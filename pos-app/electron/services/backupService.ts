import Database from 'better-sqlite3'
import { BrowserWindow, app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDb, closeDb, initDb } from '../database/database'
import { runMigrations } from '../database/migrations'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'
import type { ServiceResult } from '../../shared/types'

type BackupResult = ServiceResult & {
  data?: {
    backupPath: string
    metadataPath: string
    fileSizeBytes: number
    checksumSha256: string
  }
}

type ProductBackupResult = ServiceResult & {
  data?: {
    path: string
    checksum: string
  }
}

const DB_FILE_NAME = 'SecureStorePOS.db'
const BACKUP_PREFIX = 'SecureStorePOS_Backup'
let operationInProgress = false
let autoBackupTimer: NodeJS.Timeout | null = null

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function getDbPath() {
  return path.join(app.getPath('userData'), DB_FILE_NAME)
}

function expandHome(inputPath: string) {
  if (inputPath === '~') return app.getPath('home')
  if (inputPath.startsWith(`~${path.sep}`)) return path.join(app.getPath('home'), inputPath.slice(2))
  return inputPath
}

function ensureBackupDir(rawValue?: string) {
  const fallback = 'Backups'
  const cleaned = expandHome(String(rawValue || fallback).trim() || fallback)
  const resolved = path.resolve(path.isAbsolute(cleaned) ? cleaned : path.join(app.getPath('userData'), cleaned))
  const userDataPath = path.resolve(app.getPath('userData'))
  const liveDbPath = path.resolve(getDbPath())

  if (resolved === liveDbPath || resolved.startsWith(`${liveDbPath}${path.sep}`)) {
    throw new Error('Backup folder cannot be the live database file path.')
  }

  if (resolved === userDataPath) {
    throw new Error('Use a backup subfolder instead of the main application data folder.')
  }

  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 })
  try {
    fs.chmodSync(resolved, 0o700)
  } catch (error) {
    logger.warn(`Could not tighten backup folder permissions: ${(error as Error).message}`)
  }

  fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK)
  return resolved
}

function getBackupDir() {
  const db = getDb()
  const settingsRow = db.prepare("SELECT SettingValue FROM Settings WHERE SettingKey = 'BackupFolderPath'").get() as any
  return ensureBackupDir(settingsRow?.SettingValue)
}

function sha256File(filePath: string) {
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(filePath)
  hash.update(data)
  return hash.digest('hex')
}

function writeJsonAtomic(filePath: string, obj: unknown) {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tmp, filePath)
}

function ensureProductBackupDir() {
  const base = getBackupDir()
  const dir = path.join(base, 'product-backups')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  try { fs.chmodSync(dir, 0o700) } catch {}
  return dir
}

function insertProductBackupFile(product: Record<string, unknown>, action: string, metadata?: Record<string, unknown>) {
  const dir = ensureProductBackupDir()
  const timestamp = timestampForFile()
  const filename = `ProductBackup_${action}_${timestamp}.json`
  const fullPath = path.join(dir, filename)
  writeJsonAtomic(fullPath, {
    action,
    product,
    metadata: metadata ?? null,
    createdAt: new Date().toISOString()
  })
  const checksum = sha256File(fullPath)
  return { fullPath, checksum }
}

function verifySqliteDatabase(filePath: string, allowTemporaryFile = false) {
  if (!fs.existsSync(filePath)) throw new Error('Backup file does not exist.')
  const stats = fs.statSync(filePath)
  if (!stats.isFile() || stats.size <= 0) throw new Error('Backup file is empty or invalid.')
  if (!allowTemporaryFile && path.extname(filePath).toLowerCase() !== '.db') throw new Error('Only .db backup files can be restored.')

  const backupDb = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    const integrityRows = backupDb.pragma('integrity_check') as Array<{ integrity_check: string }>
    const integrityOk = integrityRows.length === 1 && Object.values(integrityRows[0])[0] === 'ok'
    if (!integrityOk) throw new Error('SQLite integrity check failed.')

    const foreignKeyRows = backupDb.pragma('foreign_key_check') as any[]
    if (foreignKeyRows.length > 0) throw new Error('SQLite foreign key check failed.')

    const tables = backupDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('Users', 'Products', 'Sales', 'SaleItems', 'Settings')
    `).all() as Array<{ name: string }>

    if (tables.length < 5) throw new Error('Backup file is missing required POS tables.')
  } finally {
    backupDb.close()
  }
}

function writeMetadata(metadataPath: string, metadata: Record<string, unknown>) {
  const tempPath = `${metadataPath}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tempPath, metadataPath)
}

function insertBackupLog(
  backupPath: string,
  status: 'Success' | 'Failed',
  options: {
    fileSizeBytes?: number
    userId?: number
    isAutomatic?: boolean
    errorMessage?: string
    checksumSha256?: string
    metadataPath?: string
    verifiedAt?: string
  } = {}
) {
  const db = getDb()
  db.prepare(`
    INSERT INTO BackupLogs (
      BackupPath,
      FileSizeBytes,
      CreatedByUserID,
      Status,
      ErrorMessage,
      IsAutomatic,
      ChecksumSha256,
      MetadataPath,
      VerifiedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    backupPath,
    options.fileSizeBytes || 0,
    options.userId || null,
    status,
    options.errorMessage || null,
    options.isAutomatic ? 1 : 0,
    options.checksumSha256 || null,
    options.metadataPath || null,
    options.verifiedAt || null
  )
}

function removeIfExists(filePath: string) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

function cleanupAutomaticBackups() {
  const db = getDb()
  const retentionRow = db.prepare("SELECT SettingValue FROM Settings WHERE SettingKey = 'BackupRetentionDays'").get() as any
  const retentionDays = Number(retentionRow?.SettingValue || 30)
  if (!Number.isInteger(retentionDays) || retentionDays < 7) return

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  const rows = db.prepare(`
    SELECT BackupID, BackupPath, MetadataPath
    FROM BackupLogs
    WHERE IsAutomatic = 1 AND Status = 'Success' AND BackupDate < datetime(?)
  `).all(cutoff.toISOString()) as Array<{ BackupID: number; BackupPath: string; MetadataPath?: string }>

  for (const row of rows) {
    try {
      removeIfExists(row.BackupPath)
      if (row.MetadataPath) removeIfExists(row.MetadataPath)
      db.prepare(`
        UPDATE BackupLogs
        SET Status = 'Failed',
            ErrorMessage = 'Automatic backup removed by retention policy'
        WHERE BackupID = ?
      `).run(row.BackupID)
    } catch (error: any) {
      logger.warn(`Could not remove old automatic backup ${row.BackupPath}: ${error.message}`)
    }
  }
}

async function createVerifiedBackup(userId?: number, isAutomatic = false, label = BACKUP_PREFIX): Promise<BackupResult> {
  if (operationInProgress) {
    return { success: false, message: 'A backup or restore is already running. Please wait for it to finish.' }
  }

  operationInProgress = true
  let tempBackupPath = ''
  let tempMetadataPath = ''
  let backupPath = ''

  try {
    const db = getDb()
    const backupDir = getBackupDir()
    const timestamp = timestampForFile()
    backupPath = path.join(backupDir, `${label}_${timestamp}.db`)
    const metadataPath = `${backupPath}.json`
    tempBackupPath = `${backupPath}.tmp`
    tempMetadataPath = `${metadataPath}.tmp`

    if (fs.existsSync(backupPath) || fs.existsSync(tempBackupPath)) throw new Error('Backup file already exists. Try again.')

    db.pragma('wal_checkpoint(TRUNCATE)')
    let lastLoggedCopiedPages = -1
    await db.backup(tempBackupPath, {
      progress({ totalPages, remainingPages }) {
        const copiedPages = totalPages - remainingPages
        if (copiedPages !== lastLoggedCopiedPages && (copiedPages === totalPages || copiedPages % 25 === 0)) {
          logger.info(`Backup progress: ${copiedPages} / ${totalPages} pages`)
          lastLoggedCopiedPages = copiedPages
        }

        return 100
      }
    })

    verifySqliteDatabase(tempBackupPath, true)
    const stats = fs.statSync(tempBackupPath)
    const checksumSha256 = sha256File(tempBackupPath)
    fs.renameSync(tempBackupPath, backupPath)
    try {
      fs.chmodSync(backupPath, 0o600)
    } catch (error) {
      logger.warn(`Could not tighten backup file permissions: ${(error as Error).message}`)
    }

    const verifiedAt = new Date().toISOString()
    writeMetadata(metadataPath, {
      app: 'SecureStore POS',
      databaseFile: DB_FILE_NAME,
      createdAt: verifiedAt,
      isAutomatic,
      fileSizeBytes: stats.size,
      checksumSha256
    })

    insertBackupLog(backupPath, 'Success', {
      fileSizeBytes: stats.size,
      userId,
      isAutomatic,
      checksumSha256,
      metadataPath,
      verifiedAt
    })

    cleanupAutomaticBackups()

    if (userId) auditService.log('BACKUP_CREATED', 'Backup', `Created verified backup at ${backupPath}`, userId)
    logger.info(`Verified backup successfully created at ${backupPath}`)

    return {
      success: true,
      message: 'Backup created, verified, and secured successfully.',
      data: { backupPath, metadataPath, fileSizeBytes: stats.size, checksumSha256 }
    }
  } catch (error: any) {
    logger.error('Backup failed', error)
    try {
      if (backupPath) {
        insertBackupLog(backupPath, 'Failed', {
          userId,
          isAutomatic,
          errorMessage: error.message
        })
      }
    } catch (logError: any) {
      logger.error('Could not write failed backup log', logError)
    }
    removeIfExists(tempBackupPath)
    removeIfExists(tempMetadataPath)
    return { success: false, message: publicErrorMessage(error, 'Backup failed. Please try again.') }
  } finally {
    operationInProgress = false
  }
}

function verifyChecksumAgainstKnownMetadata(backupPath: string) {
  const checksum = sha256File(backupPath)
  const metadataPath = `${backupPath}.json`

  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as { checksumSha256?: string }
    if (metadata.checksumSha256 && metadata.checksumSha256 !== checksum) {
      throw new Error('Backup checksum does not match the metadata file. The backup may be damaged or changed.')
    }
  }

  const row = getDb().prepare(`
    SELECT ChecksumSha256 FROM BackupLogs
    WHERE BackupPath = ? AND ChecksumSha256 IS NOT NULL
    ORDER BY BackupDate DESC LIMIT 1
  `).get(backupPath) as any

  if (row?.ChecksumSha256 && row.ChecksumSha256 !== checksum) {
    throw new Error('Backup checksum does not match the database log. The backup may be damaged or changed.')
  }

  return checksum
}

export const backupService = {
  createBackup: async (userId?: number, isAutomatic = false): Promise<BackupResult> => {
    return createVerifiedBackup(userId, isAutomatic)
  },

  restoreBackup: async (backupPath: string, userId?: number): Promise<ServiceResult> => {
    if (operationInProgress) {
      return { success: false, message: 'A backup or restore is already running. Please wait for it to finish.' }
    }

    operationInProgress = true
    const resolvedBackupPath = path.resolve(expandHome(String(backupPath || '').trim()))
    const liveDbPath = getDbPath()
    const timestamp = timestampForFile()
    const restoreTempPath = path.join(app.getPath('userData'), `${DB_FILE_NAME}.restore-${timestamp}.tmp`)
    const replacedDbPath = path.join(app.getPath('userData'), `${DB_FILE_NAME}.replaced-${timestamp}`)
    const failedRestoreDbPath = path.join(app.getPath('userData'), `${DB_FILE_NAME}.restore-failed-${timestamp}`)
    let liveDbReplaced = false

    try {
      if (resolvedBackupPath === path.resolve(liveDbPath)) {
        throw new Error('Cannot restore from the currently running live database file.')
      }

      verifySqliteDatabase(resolvedBackupPath)
      verifyChecksumAgainstKnownMetadata(resolvedBackupPath)

      operationInProgress = false
      const safetyBackup = await createVerifiedBackup(userId, false, 'SecureStorePOS_BeforeRestore')
      operationInProgress = true
      if (!safetyBackup.success) throw new Error(`Restore stopped because safety backup failed: ${safetyBackup.message}`)

      fs.copyFileSync(resolvedBackupPath, restoreTempPath)
      verifySqliteDatabase(restoreTempPath, true)

      getDb().pragma('wal_checkpoint(TRUNCATE)')
      closeDb()
      removeIfExists(`${liveDbPath}-wal`)
      removeIfExists(`${liveDbPath}-shm`)
      if (fs.existsSync(liveDbPath)) {
        fs.renameSync(liveDbPath, replacedDbPath)
        liveDbReplaced = true
      }
      fs.renameSync(restoreTempPath, liveDbPath)

      const db = initDb()
      runMigrations(db)

      if (safetyBackup.data) {
        insertBackupLog(safetyBackup.data.backupPath, 'Success', {
          fileSizeBytes: safetyBackup.data.fileSizeBytes,
          userId,
          isAutomatic: false,
          checksumSha256: safetyBackup.data.checksumSha256,
          metadataPath: safetyBackup.data.metadataPath,
          verifiedAt: new Date().toISOString()
        })
      }

      db.prepare(`
        UPDATE BackupLogs
        SET LastRestoredAt = datetime('now')
        WHERE BackupPath = ?
      `).run(resolvedBackupPath)

      if (userId) auditService.log('BACKUP_RESTORED', 'Backup', `Restored backup from ${resolvedBackupPath}`, userId)
      logger.info(`Database restored from verified backup ${resolvedBackupPath}. Previous database retained at ${replacedDbPath}`)

      return { success: true, message: 'Backup restored successfully. Please restart the app before continuing sales.' }
    } catch (error: any) {
      logger.error('Restore failed', error)
      removeIfExists(restoreTempPath)
      try {
        if (liveDbReplaced && fs.existsSync(replacedDbPath)) {
          if (fs.existsSync(liveDbPath)) fs.renameSync(liveDbPath, failedRestoreDbPath)
          fs.renameSync(replacedDbPath, liveDbPath)
        } else if (!fs.existsSync(liveDbPath) && fs.existsSync(replacedDbPath)) {
          fs.renameSync(replacedDbPath, liveDbPath)
        }
        const db = initDb()
        runMigrations(db)
      } catch (reopenError: any) {
        logger.error('Could not reopen database after restore failure', reopenError)
      }
      return { success: false, message: publicErrorMessage(error, 'Restore failed. The current database was kept safe.') }
    } finally {
      operationInProgress = false
    }
  },

  restoreFromFile: async (userId?: number, parentWindow?: BrowserWindow | null): Promise<ServiceResult> => {
    const dialogOptions = {
      title: 'Select SecureStore POS backup',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'SQLite backup', extensions: ['db'] }]
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Restore cancelled.' }
    }

    return backupService.restoreBackup(result.filePaths[0], userId)
  },

  verifyBackup: (backupPath: string): ServiceResult => {
    try {
      const resolvedBackupPath = path.resolve(expandHome(String(backupPath || '').trim()))
      verifySqliteDatabase(resolvedBackupPath)
      const checksumSha256 = verifyChecksumAgainstKnownMetadata(resolvedBackupPath)
      const stats = fs.statSync(resolvedBackupPath)
      getDb().prepare(`
        UPDATE BackupLogs
        SET VerifiedAt = datetime('now'),
            ChecksumSha256 = COALESCE(ChecksumSha256, ?),
            FileSizeBytes = CASE WHEN FileSizeBytes IS NULL OR FileSizeBytes = 0 THEN ? ELSE FileSizeBytes END
        WHERE BackupPath = ?
      `).run(checksumSha256, stats.size, resolvedBackupPath)
      return { success: true, message: 'Backup file passed integrity and checksum verification.' }
    } catch (error: any) {
      logger.error('Backup verification failed', error)
      return { success: false, message: publicErrorMessage(error, 'Backup verification failed.') }
    }
  },

  getHistory: () => {
    try {
      const db = getDb()
      const stmt = db.prepare(`
        SELECT b.BackupID as backupId,
               b.BackupPath as backupPath,
               b.FileSizeBytes as fileSizeBytes,
               b.BackupDate as backupDate,
               b.CreatedByUserID as createdByUserId,
               u.Username as createdBy,
               b.Status as status,
               b.ErrorMessage as errorMessage,
               b.IsAutomatic = 1 as isAutomatic,
               b.ChecksumSha256 as checksumSha256,
               b.MetadataPath as metadataPath,
               b.VerifiedAt as verifiedAt,
               b.LastRestoredAt as lastRestoredAt
        FROM BackupLogs b
        LEFT JOIN Users u ON b.CreatedByUserID = u.UserID
        ORDER BY b.BackupDate DESC LIMIT 50
      `)
      return { success: true, data: stmt.all(), message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  // Product backup helpers
  getProductBackups: (productId?: number) => {
    try {
      const db = getDb()
      if (productId) {
        const rows = db.prepare('SELECT * FROM ProductBackups WHERE ProductID = ? ORDER BY CreatedAt DESC').all(productId)
        return { success: true, data: rows, message: '' }
      }
      const rows = db.prepare('SELECT * FROM ProductBackups ORDER BY CreatedAt DESC LIMIT 200').all()
      return { success: true, data: rows, message: '' }
    } catch (error: any) {
      logger.error('Error fetching product backups', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  readProductBackupFile: (filePath: string) => {
    try {
      const resolved = path.resolve(String(filePath || ''))
      if (!fs.existsSync(resolved)) return { success: false, message: 'Backup file not found' }
      const ext = path.extname(resolved).toLowerCase()
      if (ext === '.json') {
        const content = JSON.parse(fs.readFileSync(resolved, 'utf-8'))
        return { success: true, data: content, message: '' }
      }
      if (ext === '.db') {
        const db = new Database(resolved, { readonly: true, fileMustExist: true })
        try {
          const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>
          const result: Record<string, any> = { tables: [] }
          for (const t of tables) {
            const name = t.name
            const rows = db.prepare(`SELECT * FROM "${name}" LIMIT 20`).all()
            result.tables.push({ name, sample: rows })
          }
          return { success: true, data: result, message: '' }
        } finally {
          db.close()
        }
      }
      return { success: false, message: 'Unsupported backup file type' }
    } catch (error: any) {
      logger.error('Error reading product backup file', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  startAutoBackupScheduler: () => {
    if (autoBackupTimer) clearInterval(autoBackupTimer)

    const checkAndRun = async () => {
      try {
        const db = getDb()
        const enabledRow = db.prepare("SELECT SettingValue FROM Settings WHERE SettingKey = 'AutoBackupEnabled'").get() as any
        if (enabledRow?.SettingValue !== 'true') return

        const latest = db.prepare(`
          SELECT BackupDate FROM BackupLogs
          WHERE IsAutomatic = 1 AND Status = 'Success'
          ORDER BY BackupDate DESC LIMIT 1
        `).get() as any

        const today = new Date().toLocaleDateString('en-CA')
        const latestDay = latest?.BackupDate ? new Date(latest.BackupDate).toLocaleDateString('en-CA') : ''
        if (latestDay === today) return

        await createVerifiedBackup(undefined, true)
      } catch (error: any) {
        logger.error('Automatic backup check failed', error)
      }
    }

    setTimeout(() => { checkAndRun().catch((error) => logger.error('Initial automatic backup failed', error)) }, 10000)
    autoBackupTimer = setInterval(() => {
      checkAndRun().catch((error) => logger.error('Scheduled automatic backup failed', error))
    }, 60 * 60 * 1000)
  },

  stopAutoBackupScheduler: () => {
    if (autoBackupTimer) clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }
,
  insertProductBackup: (product: Record<string, unknown>, action: string, userId?: number, metadata?: Record<string, unknown>): ProductBackupResult => {
    try {
      const { fullPath, checksum } = insertProductBackupFile(product, action, metadata)
      const db = getDb()
      db.prepare(`
        INSERT INTO ProductBackups (ProductID, Action, DataPath, ChecksumSha256, CreatedByUserID)
        VALUES (?, ?, ?, ?, ?)
      `).run(product['productId'] || null, action, fullPath, checksum, userId || null)
      if (userId) auditService.log('PRODUCT_BACKED_UP', 'ProductBackup', `Backed up product to ${fullPath}`, userId)
      return { success: true, message: 'Product backup created', data: { path: fullPath, checksum } }
    } catch (error: any) {
      logger.error('Failed to create product backup', error)
      return { success: false, message: publicErrorMessage(error, 'Product backup failed') }
    }
  }
}
