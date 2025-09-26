interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
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

interface Env {
  DB: D1Database;
  // Add secrets like API tokens here (e.g., TATOEBA_API_TOKEN: string)
}

const json = (payload: unknown, init?: ResponseInit): Response => {
  const body = JSON.stringify(payload, null, 2);
  return new Response(body, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  });
};

const notFound = () => new Response('Not found', { status: 404 });

const methodNotAllowed = () => new Response('Method not allowed', { status: 405 });

async function getRandomSentence(env: Env): Promise<Response> {
  try {
    const row = await env.DB.prepare(
      `SELECT id, spanish, english, source, difficulty, updated_at
       FROM sentences
       ORDER BY RANDOM()
       LIMIT 1`
    ).first<SentenceRow>();

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
        return withCors(await getRandomSentence(env));

      default:
        return notFound();
    }
  },
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
