#!/usr/bin/env node
/**
 * Ingestion helper for SpanishType.
 *
 * This script can download bilingual sentence pairs from the public Tatoeba API
 * (English ↔ Spanish), normalize the results, and produce an SQL seed file that
 * can be applied to the Cloudflare D1 database backing the Worker.
 *
 * Usage examples:
 *   - Fetch 200 sentences from Tatoeba and write SQL to data/seed.sql
 *       npx ts-node scripts/ingest-tatoeba.ts
 *
 *   - Read a pre-filtered JSON dataset and create SQL without hitting the API
 *       npx ts-node scripts/ingest-tatoeba.ts --input data/sentences.json
 *
 *   - Fetch 500 sentences, persist raw JSON, and write SQL to a custom file
 *       npx ts-node scripts/ingest-tatoeba.ts --limit 500 --json-out data/raw.json --output data/seed.sql
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

interface CliOptions {
  limit: number;
  batchSize: number;
  sourceLang: string;
  targetLang: string;
  inputPath?: string;
  outputPath: string;
  jsonOutputPath?: string;
  verbose: boolean;
  maxPages?: number;
  wrapTransaction: boolean;
}

interface TatoebaTranslation {
  id: number;
  text: string;
  lang: string;
}

interface TatoebaTranslationWrapper {
  sentence?: {
    id: number;
    text: string;
    lang: string;
  } | null;
  text?: string;
  id?: number;
  lang?: string;
}

interface TatoebaResult {
  id: number;
  text: string;
  lang: string;
  user?: string;
  translations?: Record<string, TatoebaTranslationWrapper[] | undefined> | TatoebaTranslationWrapper[];
  directTranslations?: TatoebaTranslationWrapper[]; // Some API responses use this key.
}

interface NormalizedSentence {
  tatoebaId: number | null;
  spanish: string;
  english: string;
  source: string;
  difficulty: string;
}

const DEFAULT_LIMIT = 200;
const DEFAULT_BATCH_SIZE = 100;
const DATA_DIR = 'data';
const MAX_PAGE_MULTIPLIER = 6; // fetch at most ~6x the theoretical minimum number of pages.

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: DEFAULT_LIMIT,
    batchSize: DEFAULT_BATCH_SIZE,
    sourceLang: 'eng',
    targetLang: 'spa',
    outputPath: path.join(DATA_DIR, 'seed.sql'),
    verbose: false,
    wrapTransaction: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--limit':
        if (!next) throw new Error('--limit expects a number');
        options.limit = Number.parseInt(next, 10);
        i += 1;
        break;
      case '--batch-size':
        if (!next) throw new Error('--batch-size expects a number');
        options.batchSize = Number.parseInt(next, 10);
        i += 1;
        break;
      case '--from':
        if (!next) throw new Error('--from expects a language code');
        options.sourceLang = next;
        i += 1;
        break;
      case '--to':
        if (!next) throw new Error('--to expects a language code');
        options.targetLang = next;
        i += 1;
        break;
      case '--output':
        if (!next) throw new Error('--output expects a file path');
        options.outputPath = next;
        i += 1;
        break;
      case '--input':
        if (!next) throw new Error('--input expects a file path');
        options.inputPath = next;
        i += 1;
        break;
      case '--json-out':
        if (!next) throw new Error('--json-out expects a file path');
        options.jsonOutputPath = next;
        i += 1;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--no-transaction':
        options.wrapTransaction = false;
        break;
      case '--max-pages':
        if (!next) throw new Error('--max-pages expects a number');
        options.maxPages = Number.parseInt(next, 10);
        i += 1;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  if (Number.isNaN(options.limit) || options.limit <= 0) {
    throw new Error('Expected --limit to be a positive integer');
  }

  if (Number.isNaN(options.batchSize) || options.batchSize <= 0) {
    throw new Error('Expected --batch-size to be a positive integer');
  }

  if (
    options.maxPages !== undefined &&
    (Number.isNaN(options.maxPages) || options.maxPages <= 0)
  ) {
    throw new Error('Expected --max-pages to be a positive integer');
  }

  return options;
}

function printHelp(): void {
  console.log(`SpanishType ingestion script\n\n` +
    `Options:\n` +
    `  --limit <number>       Total sentence pairs to collect (default ${DEFAULT_LIMIT})\n` +
    `  --batch-size <number>  How many rows per SQL INSERT (default ${DEFAULT_BATCH_SIZE})\n` +
    `  --from <lang>          Source language code (default eng)\n` +
    `  --to <lang>            Target language code (default spa)\n` +
    `  --input <path>         Optional JSON file to use instead of hitting the API\n` +
    `  --output <path>        SQL output file (default data/seed.sql)\n` +
    `  --json-out <path>      Optional JSON dump of normalized sentences\n` +
    `  --max-pages <number>   Safety cap on API pages to fetch (auto-calculated if omitted)\n` +
    `  --no-transaction       Do not wrap INSERTs in BEGIN/COMMIT (useful for remote D1 uploads)\n` +
    `  --verbose              Print progress details\n` +
    `  --help                 Show this message\n`);
}

async function fetchSentencesFromTatoeba(options: CliOptions): Promise<NormalizedSentence[]> {
  const { limit, sourceLang, targetLang, verbose } = options;
  const collected = new Map<number, NormalizedSentence>();
  const pageSize = Math.min(100, limit);
  let page = 1;
  const maxPages = options.maxPages ?? Math.max(5, Math.ceil(limit / pageSize) * MAX_PAGE_MULTIPLIER);

  while (collected.size < limit && page <= maxPages) {
    const payload = await requestTatoebaPage({
      page,
      pageSize,
      sourceLang,
      targetLang,
    });

    if (verbose) {
      console.log(`Page ${page}/${maxPages} → ${payload.length} results (unique so far: ${collected.size}/${limit})`);
    }

    if (payload.length === 0) {
      break;
    }

    for (const entry of payload) {
      const normalized = normalizeSentence(entry, verbose);
      if (!normalized) {
        continue;
      }

      if (normalized.tatoebaId === null) {
        if (verbose) {
          console.log('  Skipping entry without tatoeba_id', summarizeEntry(entry));
        }
        continue;
      }

      if (collected.has(normalized.tatoebaId) && verbose) {
        console.log(`  Duplicate sentence id ${normalized.tatoebaId}, refreshing value`);
      }

      collected.set(normalized.tatoebaId, normalized);
      if (collected.size >= limit) {
        break;
      }
    }

    page += 1;

    // Avoid hammering the public API.
    if (collected.size < limit && page < maxPages) {
      await sleep(400);
    }
  }

  if (collected.size < limit) {
    console.warn(
      `Only collected ${collected.size} unique sentence pairs after ${Math.min(page, maxPages)} pages. ` +
        'You may need to raise --limit, loosen filters, or supply your own dataset with --input.'
    );
  }

  return [...collected.values()].slice(0, limit);
}

async function requestTatoebaPage(params: {
  page: number;
  pageSize: number;
  sourceLang: string;
  targetLang: string;
}): Promise<TatoebaResult[]> {
  const { page, pageSize, sourceLang, targetLang } = params;
  const endpoint = new URL('https://tatoeba.org/eng/api_v0/search');
  endpoint.searchParams.set('from', sourceLang);
  endpoint.searchParams.set('to', targetLang);
  endpoint.searchParams.set('page', page.toString());
  endpoint.searchParams.set('per_page', pageSize.toString());
  endpoint.searchParams.set('orphans', 'no');
  endpoint.searchParams.set('unapproved', 'no');
  endpoint.searchParams.set('trans_filter', 'any');
  endpoint.searchParams.set('trans_to', targetLang);
  endpoint.searchParams.set('trans_orphan', 'no');
  endpoint.searchParams.set('trans_unapproved', 'no');
  endpoint.searchParams.set('trans_link', 'direct');
  endpoint.searchParams.set('sort', 'random');

  const response = await fetch(endpoint.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Tatoeba request failed with status ${response.status}: ${body}`
    );
  }

  const json = (await response.json()) as { results?: TatoebaResult[] };
  return Array.isArray(json.results) ? json.results : [];
}

function normalizeSentence(entry: TatoebaResult, verbose = false): NormalizedSentence | null {
  const variants = gatherVariants(entry);

  if (verbose) {
    const translationKeys = entry.translations && !Array.isArray(entry.translations)
      ? Object.keys(entry.translations)
      : Array.isArray(entry.translations)
        ? `array(${entry.translations.length})`
        : 'none';
    const directCount = Array.isArray(entry.directTranslations) ? entry.directTranslations.length : 0;
    console.log('  Translation metadata:', {
      translationKeys,
      directCount,
    });
    console.log('  Raw entry envelope:', summarizeEnvelope(entry));
    console.log('  Raw translations preview:', previewTranslations(entry));
    console.log('  Raw JSON dump:', JSON.stringify(entry, null, 2));
    console.log('  Variants:', variants.map((variant) => summarizeVariant(variant)));
  }

  const spanish = variants.find((variant) => normalizeLang(variant.lang) === 'spa');
  const english = variants.find((variant) => normalizeLang(variant.lang) === 'eng');

  if (!spanish || !english) {
    if (verbose) {
      console.log('  Skipping entry: missing expected translation', {
        hasSpanish: Boolean(spanish),
        hasEnglish: Boolean(english),
      });
    }
    return null;
  }

  const cleanSpanish = spanish.text?.trim();
  const cleanEnglish = english.text?.trim();

  if (!cleanSpanish || !cleanEnglish) {
    if (verbose) {
      console.log('  Skipping entry: empty text detected', {
        spanish: cleanSpanish,
        english: cleanEnglish,
      });
    }
    return null;
  }

  const tatoebaId = spanish.id ?? english.id ?? entry.id ?? null;
  if (tatoebaId === null && verbose) {
    console.log('  Missing Tatoeba id; will be discarded');
  }

  const difficulty = classifyDifficulty(cleanSpanish);

  return {
    tatoebaId,
    spanish: cleanSpanish,
    english: cleanEnglish,
    source: 'tatoeba',
    difficulty,
  };
}

function gatherVariants(entry: TatoebaResult): TatoebaTranslation[] {
  const variants: TatoebaTranslation[] = [
    {
      id: entry.id,
      text: entry.text,
      lang: entry.lang,
    },
    ...flattenTranslations(entry.directTranslations),
    ...flattenTranslations(entry.translations),
  ];

  if (variants.length === 1 && entry.translations && Array.isArray(entry.translations)) {
    for (const group of entry.translations) {
      if (!Array.isArray(group)) continue;
      for (const item of group) {
        const coerced = coerceTranslation(item);
        if (coerced) variants.push(coerced);
      }
    }
  }

  return variants;
}

function summarizeVariant(variant: TatoebaTranslation): { id: number; lang: string; text: string } {
  const text = variant.text ?? '';
  return {
    id: variant.id,
    lang: normalizeLang(variant.lang) ?? variant.lang,
    text: text.length > 60 ? `${text.slice(0, 57)}...` : text,
  };
}

function summarizeEntry(entry: TatoebaResult) {
  const text = entry.text ?? '';
  return {
    id: entry.id,
    lang: normalizeLang(entry.lang) ?? entry.lang,
    text: text.length > 60 ? `${text.slice(0, 57)}...` : text,
  };
}

function previewTranslations(entry: TatoebaResult) {
  const preview: unknown[] = [];

  const pushItems = (items: TatoebaTranslationWrapper[] | undefined, label: string) => {
    if (!items || !items.length) return;
    preview.push({
      label,
      sample: items.slice(0, 3).map((item) => ({
        id: item?.id ?? item?.sentence?.id,
        lang: (item?.lang ?? (item as Record<string, unknown>).lang_code ?? item?.sentence?.lang) ?? null,
        textPreview: truncateText(
          typeof item?.text === 'string'
            ? item.text
            : typeof item?.sentence?.text === 'string'
              ? item.sentence.text
              : ''
        ),
        hasSentence: Boolean(item?.sentence),
        keys: item ? Object.keys(item).sort() : [],
      })),
    });
  };

  if (Array.isArray(entry.directTranslations)) {
    pushItems(entry.directTranslations, 'direct');
  }

  if (Array.isArray(entry.translations)) {
    pushItems(entry.translations, 'translations_array');
  } else if (entry.translations && typeof entry.translations === 'object') {
    for (const [key, items] of Object.entries(entry.translations)) {
      pushItems(items ?? undefined, `translations.${key}`);
    }
  }

  return preview;
}

function truncateText(text: string): string {
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

function summarizeEnvelope(entry: TatoebaResult) {
  return {
    id: entry.id,
    lang: entry.lang,
    hasSentence: Boolean((entry as Record<string, unknown>).sentence),
    keys: Object.keys(entry).sort(),
  };
}

const ISO2_TO_ISO3: Record<string, string> = {
  en: 'eng',
  es: 'spa',
  fr: 'fra',
  pt: 'por',
  de: 'deu',
  it: 'ita',
};

function normalizeLang(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  const lower = lang.toLowerCase();
  if (lower.length === 2) {
    return ISO2_TO_ISO3[lower] ?? lower;
  }
  if (lower.length === 3) {
    return lower;
  }
  return lower.slice(0, 3);
}

function flattenTranslations(
  translations: TatoebaResult['translations'] | TatoebaTranslation[] | undefined
): TatoebaTranslation[] {
  if (!translations) {
    return [];
  }

  const rawList: TatoebaTranslationWrapper[] = [];

  if (Array.isArray(translations)) {
    // Swap the roles: Tatoeba sometimes wraps translations as an array of arrays by language.
    const firstLevel = translations as unknown[];
    for (const item of firstLevel) {
      if (Array.isArray(item)) {
        rawList.push(...(item as TatoebaTranslationWrapper[]));
      } else {
        rawList.push(item as TatoebaTranslationWrapper);
      }
    }
  } else {
    for (const items of Object.values(translations)) {
      if (!items) continue;
      rawList.push(...(items as TatoebaTranslationWrapper[]));
    }
  }

  const normalized: TatoebaTranslation[] = [];
  for (const item of rawList) {
    const translated = coerceTranslation(item);
    if (translated) {
      normalized.push(translated);
    }
  }
  return normalized;
}

function coerceTranslation(entry: TatoebaTranslationWrapper | undefined): TatoebaTranslation | null {
  if (!entry) return null;

  const candidate = {
    id:
      typeof entry.id === 'number'
        ? entry.id
        : typeof entry.id === 'string'
          ? Number.parseInt(entry.id, 10)
          : entry.sentence && typeof entry.sentence.id === 'number'
            ? entry.sentence.id
            : undefined,
    text:
      typeof entry.text === 'string'
        ? entry.text
        : entry.sentence && typeof entry.sentence.text === 'string'
          ? entry.sentence.text
          : undefined,
    lang:
      typeof entry.lang === 'string'
        ? entry.lang
        : typeof (entry as Record<string, unknown>).lang_code === 'string'
          ? String((entry as Record<string, unknown>).lang_code)
          : entry.sentence && typeof entry.sentence.lang === 'string'
            ? entry.sentence.lang
            : undefined,
  };

  if (
    typeof candidate.id === 'number' &&
    Number.isFinite(candidate.id) &&
    typeof candidate.text === 'string' &&
    candidate.text.trim().length > 0 &&
    typeof candidate.lang === 'string' &&
    candidate.lang.length > 0
  ) {
    return {
      id: candidate.id,
      text: candidate.text,
      lang: candidate.lang,
    };
  }

  return null;
}

function classifyDifficulty(sentence: string): string {
  const length = sentence.length;
  if (length <= 40) return 'easy';
  if (length <= 80) return 'medium';
  return 'hard';
}

async function loadFromJson(filePath: string): Promise<NormalizedSentence[]> {
  const data = await readFile(filePath, 'utf8');
  const json = JSON.parse(data);
  if (!Array.isArray(json)) {
    throw new Error('Expected input JSON to be an array');
  }

  return json.map((item) => normalizeFromJson(item)).filter(Boolean) as NormalizedSentence[];
}

function normalizeFromJson(entry: unknown): NormalizedSentence | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }

  const candidate = entry as Partial<NormalizedSentence & { english?: unknown; spanish?: unknown }>;
  if (!candidate.english || !candidate.spanish) {
    return null;
  }

  return {
    tatoebaId: typeof candidate.tatoebaId === 'number' ? candidate.tatoebaId : null,
    english: String(candidate.english).trim(),
    spanish: String(candidate.spanish).trim(),
    source: candidate.source ? String(candidate.source) : 'manual',
    difficulty: candidate.difficulty ? String(candidate.difficulty) : classifyDifficulty(String(candidate.spanish)),
  };
}

function chunk<T>(list: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    batches.push(list.slice(i, i + size));
  }
  return batches;
}

function buildSqlFile(rows: NormalizedSentence[], batchSize: number, wrapTransaction: boolean): string {
  if (rows.length === 0) {
    throw new Error('No sentence rows to write. Fetch or supply data first.');
  }

  const statements: string[] = [];

  if (wrapTransaction) {
    statements.push('BEGIN TRANSACTION;');
  }

  for (const group of chunk(rows, batchSize)) {
    const values = group
      .map((row) => {
        const parts = [
          row.tatoebaId === null ? 'NULL' : row.tatoebaId,
          quote(row.spanish),
          quote(row.english),
          quote(row.source),
          quote(row.difficulty),
        ];
        return `(${parts.join(', ')})`;
      })
      .join(',\n  ');

    statements.push(
      `INSERT INTO sentences (tatoeba_id, spanish, english, source, difficulty)
VALUES
  ${values}
ON CONFLICT(tatoeba_id) DO UPDATE SET
  spanish = excluded.spanish,
  english = excluded.english,
  source = excluded.source,
  difficulty = excluded.difficulty,
  updated_at = CURRENT_TIMESTAMP;`
    );
  }

  if (wrapTransaction) {
    statements.push('COMMIT;');
  }

  return `${statements.join('\n\n')}\n`;
}

function quote(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

async function ensureDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.sourceLang !== 'eng' || options.targetLang !== 'spa') {
    console.warn(
      'Warning: this script currently normalizes output under the assumption of English↔Spanish pairs. '
        + 'Other language combinations may require additional adjustments.'
    );
  }

  const sentences = options.inputPath
    ? await loadFromJson(options.inputPath)
    : await fetchSentencesFromTatoeba(options);

  if (sentences.length === 0) {
    throw new Error('No sentences were collected. Try increasing --limit or providing a dataset.');
  }

  if (options.verbose) {
    console.log(`Collected ${sentences.length} unique sentence pairs.`);
  }

  const sql = buildSqlFile(sentences, options.batchSize, options.wrapTransaction);

  await ensureDirectory(options.outputPath);
  await writeFile(options.outputPath, sql, 'utf8');

  if (options.jsonOutputPath) {
    await ensureDirectory(options.jsonOutputPath);
    await writeFile(options.jsonOutputPath, JSON.stringify(sentences, null, 2), 'utf8');
  }

  console.log(`Wrote SQL seed to ${options.outputPath}`);
  if (options.jsonOutputPath) {
    console.log(`Wrote normalized JSON to ${options.jsonOutputPath}`);
  }

  console.log('\nApply to D1 with:');
  if (options.wrapTransaction) {
    console.log(`  # Local / dev instance`);
    console.log(`  npx wrangler d1 execute spanish_type --config worker/wrangler.toml --local --file ${options.outputPath}`);
    console.log(`\n  # Remote (regenerate with --no-transaction first)`);
    console.log(`  npx wrangler d1 execute spanish_type --config worker/wrangler.toml --remote --file ${options.outputPath}`);
  } else {
    console.log(`  npx wrangler d1 execute spanish_type --config worker/wrangler.toml --remote --file ${options.outputPath}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exitCode = 1;
});
