import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { logger } from '../utils/logger'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialised. Call initDb() first.')
  return db
}

export function initDb(): Database.Database {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'SecureStorePOS.db')

  logger.info(`Initialising SQLite database at: ${dbPath}`)

  db = new Database(dbPath)

  // ── Pragmas for crash safety and performance ─────────────────────────────
  db.pragma('journal_mode = WAL')        // Write-Ahead Logging: crash safe
  db.pragma('foreign_keys = ON')         // Enforce FK constraints
  db.pragma('synchronous = FULL')        // Safer committed transactions for POS data
  db.pragma('busy_timeout = 5000')       // Wait briefly if SQLite is busy
  db.pragma('wal_autocheckpoint = 1000') // Keep WAL from growing without bound
  db.pragma('cache_size = -64000')       // 64MB cache
  db.pragma('temp_store = MEMORY')       // Temp tables in memory

  logger.info('SQLite pragmas set (WAL mode enabled).')
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    logger.info('Database connection closed.')
  }
}
