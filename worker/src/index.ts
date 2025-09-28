interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run<T>(): Promise<T>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface SentenceRow {
  id: number;
  spanish: string;
  english: string;
  source?: string;
  difficulty?: string;
  updated_at?: string;
}

interface LeaderboardRow {
  player_name: string;
  score: number;
  updated_at?: string;
}

interface Env {
  DB: D1Database;
  // Add secrets like API tokens here (e.g., TATOEBA_API_TOKEN: string)
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  impossible: 'Impossible',
};

const ALLOWED_DIFFICULTIES = new Set(Object.keys(DIFFICULTY_LABELS));

const json = (payload: unknown, init?: ResponseInit): Response => {
  const body = JSON.stringify(payload, null, 2);
  return new Response(body, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  });
};

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (_error) {
    return null;
  }
}

const notFound = () => new Response('Not found', { status: 404 });

const methodNotAllowed = () => new Response('Method not allowed', { status: 405 });

async function getRandomSentence(env: Env, excludeIds: number[]): Promise<Response> {
  try {
    const runQuery = async (ids: number[]): Promise<SentenceRow | null> => {
      let query = `SELECT rowid AS id, spanish, english, source, difficulty, updated_at FROM sentences`;

      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(', ');
        query += ` WHERE id NOT IN (${placeholders})`;
      }

      query += ` ORDER BY RANDOM() LIMIT 1`;

      const statement = ids.length > 0 ? env.DB.prepare(query).bind(...ids) : env.DB.prepare(query);
      return (await statement.first<SentenceRow>()) ?? null;
    };

    let row = await runQuery(excludeIds);
    let reset = false;

    if (!row) {
      row = await runQuery([]);
      reset = true;
    }

    if (!row) {
      return json(
        { error: 'no_sentences', message: 'Seed the D1 database before requesting sentences.' },
        { status: 503 }
      );
    }

    return json({
      id: row.id,
      english: row.english,
      spanish: row.spanish,
      source: row.source,
      difficulty: row.difficulty ?? 'unknown',
      updatedAt: row.updated_at,
      reset,
    });
  } catch (error) {
    return json(
      {
        error: 'd1_query_failed',
        message: 'Unable to read from D1. Ensure migrations have been applied.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function getLeaderboard(env: Env, limit: number): Promise<Response> {
  try {
    const safeLimit = Math.min(Math.max(limit, 1), 25);
    const { results } = await env.DB.prepare(
      `SELECT player_name, score, updated_at
       FROM leaderboard
       ORDER BY score DESC, updated_at ASC
       LIMIT ?`
    )
      .bind(safeLimit)
      .all<LeaderboardRow>();

    const entries = (results ?? []).map((row) => decodeLeaderboardRow(row));

    return json({ entries });
  } catch (error) {
    return json(
      {
        error: 'leaderboard_query_failed',
        message: 'Unable to read leaderboard standings.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function submitLeaderboardScore(env: Env, request: Request): Promise<Response> {
  try {
    const payload = await readJson<{ name?: string; score?: number; difficulty?: string }>(request);
    const name = payload?.name?.trim();
    const score = typeof payload?.score === 'number' ? Math.round(payload.score) : NaN;
    const difficulty = normalizeDifficulty(payload?.difficulty);

    if (!name || name.length === 0 || name.length > 64) {
      return json(
        { error: 'invalid_name', message: 'Player name must be between 1 and 64 characters.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(score) || score < 0) {
      return json(
        { error: 'invalid_score', message: 'Score must be a non-negative integer.' },
        { status: 400 }
      );
    }

    const storageKey = encodeLeaderboardKey(name, difficulty);

    await env.DB.prepare(
      `INSERT INTO leaderboard (player_name, score, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(player_name) DO UPDATE SET
         score = CASE WHEN excluded.score > leaderboard.score THEN excluded.score ELSE leaderboard.score END,
         updated_at = CURRENT_TIMESTAMP`
    )
      .bind(storageKey, score)
      .run();

    const updated = await env.DB.prepare(
      `SELECT player_name, score, updated_at FROM leaderboard WHERE player_name = ?`
    )
      .bind(storageKey)
      .first<LeaderboardRow>();

    return json({
      ok: true,
      entry: updated
        ? decodeLeaderboardRow(updated)
        : null,
    });
  } catch (error) {
    return json(
      {
        error: 'leaderboard_update_failed',
        message: 'Unable to update leaderboard.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-max-age': '86400',
    },
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    const url = new URL(request.url);

    switch (url.pathname) {
      case '/api/health':
        return json({ status: 'ok' });

      case '/api/sentences/random':
        if (request.method !== 'GET') {
          return methodNotAllowed();
        }
        return withCors(await getRandomSentence(env, parseExcludeQuery(url.searchParams)));

      case '/api/leaderboard/top':
        if (request.method !== 'GET') {
          return methodNotAllowed();
        }
        return withCors(await getLeaderboard(env, parseLimit(url.searchParams.get('limit'))));

      case '/api/leaderboard/submit':
        if (request.method !== 'POST') {
          return methodNotAllowed();
        }
        return withCors(await submitLeaderboardScore(env, request));

      default:
        return notFound();
    }
  },
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function parseLimit(value: string | null): number {
  if (!value) return 10;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return parsed;
}

function parseExcludeQuery(params: URLSearchParams): number[] {
  const value = params.get('exclude');
  if (!value) return [];

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .filter((num) => Number.isFinite(num))
    .slice(0, 100);
}

function normalizeDifficulty(value: string | null | undefined): string {
  const normalized = (value ?? '').toLowerCase();
  return ALLOWED_DIFFICULTIES.has(normalized) ? normalized : 'easy';
}

function difficultyLabelFor(value: string): string {
  return DIFFICULTY_LABELS[value] ?? value;
}

function sanitizeName(name: string): string {
  return name.replace(/::/g, ':').replace(/\s+/g, ' ').trim().slice(0, 64);
}

function encodeLeaderboardKey(name: string, difficulty: string): string {
  const safeName = sanitizeName(name);
  return `${safeName}::${difficulty}`;
}

function decodeLeaderboardRow(row: LeaderboardRow) {
  const stored = row.player_name ?? '';
  const [rawName, rawDifficulty] = stored.includes('::')
    ? ((): [string, string] => {
        const parts = stored.split('::');
        return [parts[0] ?? '', parts[1] ?? 'easy'];
      })()
    : [stored, 'easy'];

  const difficulty = normalizeDifficulty(rawDifficulty);
  const entryName = sanitizeName(rawName);

  return {
    playerName: entryName || 'Player',
    difficulty,
    difficultyLabel: difficultyLabelFor(difficulty),
    score: row.score,
    updatedAt: row.updated_at,
  };
}
