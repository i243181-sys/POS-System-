import pg, { type PoolClient } from 'pg'
import { logger } from '../utils/logger'

// ── PostgreSQL connection configuration ──────────────────────────────────────
// Every value can be overridden with environment variables:
//   POS_PG_HOST, POS_PG_PORT, POS_PG_DB, POS_PG_USER, POS_PG_PASSWORD
const PG_CONFIG = {
  host: process.env.POS_PG_HOST || '127.0.0.1',
  port: Number(process.env.POS_PG_PORT || 5432),
  database: process.env.POS_PG_DB || 'securestore_pos',
  user: process.env.POS_PG_USER || 'securestore',
  password: process.env.POS_PG_PASSWORD || 'securestore_pos',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  options: `-c timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}`
}

// ── Value-type compatibility with the legacy TEXT/REAL storage ──────────────
// NUMERIC/DECIMAL come back as JS numbers (money columns).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) =>
  value === null ? null : Number(value)
)
// TIMESTAMPTZ come back as UTC 'YYYY-MM-DD HH:MM:SS' strings, exactly the
// format the previous SQLite TEXT timestamps used (shared/dates.ts parses it
// as UTC). Rendering and date grouping stay byte-for-byte compatible.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) =>
  value === null ? null : new Date(value).toISOString().slice(0, 19).replace('T', ' ')
)
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (value) =>
  value === null ? null : new Date(`${value}+00`).toISOString().slice(0, 19).replace('T', ' ')
)

let pool: pg.Pool | null = null

export function getDb(): pg.Pool {
  if (!pool) throw new Error('Database not initialised. Call initDb() first.')
  return pool
}

export function initDb(): pg.Pool {
  if (pool) return pool
  logger.info(
    `Connecting to PostgreSQL at ${PG_CONFIG.host}:${PG_CONFIG.port}, database "${PG_CONFIG.database}" as "${PG_CONFIG.user}".`
  )
  pool = new pg.Pool(PG_CONFIG)

  pool.on('error', (error) => logger.error('Unexpected PostgreSQL pool error', error))
  return pool
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end().catch((error) => logger.error('Error closing database pool', error))
    pool = null
    logger.info('Database connection pool closed.')
  }
}

// ── SQLite-dialect -> PostgreSQL-dialect translation ─────────────────────────
// The application SQL was written for SQLite. This single translation point
// keeps every service's SQL readable while running on real PostgreSQL.
export function toPgSql(sql: string): string {
  let out = sql
  // Boolean columns (SQLite stored 0/1 integers).
  out = out.replace(/(\b(?:\w+\.)?IsActive)\s*=\s*0\b/g, '$1 = false')
  out = out.replace(/(\b(?:\w+\.)?IsActive)\s*=\s*1\b/g, '$1 = true')
  out = out.replace(/(\b(?:\w+\.)?IsVoided)\s*=\s*0\b/g, '$1 = false')
  out = out.replace(/(\b(?:\w+\.)?IsVoided)\s*=\s*1\b/g, '$1 = true')
  out = out.replace(/(\b(?:\w+\.)?IsAutomatic)\s*=\s*0\b/g, '$1 = false')
  out = out.replace(/(\b(?:\w+\.)?IsAutomatic)\s*=\s*1\b/g, '$1 = true')
  // Local business-date grouping.
  out = out.replace(/date\(([^,()]+),\s*'localtime'\)/g, '($1)::date')
  // IFNULL -> COALESCE, GROUP_CONCAT -> string_agg.
  out = out.replace(/\bIFNULL\s*\(/g, 'COALESCE(')
  out = out.replace(/\bGROUP_CONCAT\s*\(/gi, 'string_agg(')
  // datetime('now') -> now(); datetime(?) -> typed parameter.
  out = out.replace(/\bdatetime\(\s*\?\s*\)/g, '?::timestamptz')
  out = out.replace(/\bdatetime\('now'\)/g, 'now()')
  // SQLite LIKE is case-insensitive; PostgreSQL needs ILIKE.
  out = out.replace(/\bLIKE\b/g, 'ILIKE')
  // INSERT OR IGNORE -> ON CONFLICT DO NOTHING.
  if (/\binsert\s+or\s+ignore\s+into\b/i.test(out)) {
    out = out.replace(/\binsert\s+or\s+ignore\s+into\b/gi, 'INSERT INTO')
    out = `${out.trimEnd()} ON CONFLICT DO NOTHING`
  }
  // ? -> $1, $2, ...
  let index = 0
  out = out.replace(/\?/g, () => `$${++index}`)
  return out
}

// ── Query surface: the async equivalent of the old prepare()/get()/all()/run() ─
export type QueryResult = { rows: any[]; rowCount: number }

export type Db = {
  all: (sql: string, params?: unknown[]) => Promise<any[]>
  get: (sql: string, params?: unknown[]) => Promise<any | undefined>
  run: (sql: string, params?: unknown[]) => Promise<QueryResult>
}

function wrapExecutor(exec: (sql: string, params: unknown[]) => Promise<pg.QueryResult>): Db {
  return {
    all: (sql, params = []) => exec(toPgSql(sql), params).then((result) => result.rows),
    get: async (sql, params = []) => (await exec(toPgSql(sql), params)).rows[0],
    run: (sql, params = []) => exec(toPgSql(sql), params).then((result) => ({ rows: result.rows, rowCount: result.rowCount ?? 0 }))
  }
}

const poolDb: Db = wrapExecutor((sql, params) => getDb().query(sql, params))

/** Run a query on the pool (no transaction). */
export function all(sql: string, params: unknown[] = []): Promise<any[]> {
  return poolDb.all(sql, params)
}

export function get(sql: string, params: unknown[] = []): Promise<any | undefined> {
  return poolDb.get(sql, params)
}

export function run(sql: string, params: unknown[] = []): Promise<QueryResult> {
  return poolDb.run(sql, params)
}

/** Run work inside an atomic PostgreSQL transaction. Throws after ROLLBACK. */
export async function withTx<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  const client: PoolClient = await getDb().connect()
  try {
    await client.query('BEGIN')
    const tx = wrapExecutor((sql, params) => client.query(sql, params))
    const result = await work(tx)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* connection may already be broken */ }
    throw error
  } finally {
    client.release()
  }
}
