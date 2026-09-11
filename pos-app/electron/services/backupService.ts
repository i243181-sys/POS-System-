import { BrowserWindow, app, dialog } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { all, get, run, type Db } from '../database/database'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
import type { ServiceResult } from '../../shared/types'

const execFileAsync = promisify(execFile)
const BACKUP_PREFIX = 'SecureStorePOS_Backup'
let operationInProgress = false
let restoring = false
let autoBackupTimer: NodeJS.Timeout | null = null

type BackupResult = ServiceResult & { data?: { backupPath: string; metadataPath: string; fileSizeBytes: number; checksumSha256: string } }
type ProductBackupResult = ServiceResult & { data?: { path: string; checksum: string } }

function timestampForFile() { return new Date().toISOString().replace(/[:.]/g, '-') }
function expandHome(value: string) { return value === '~' ? app.getPath('home') : value.startsWith(`~${path.sep}`) ? path.join(app.getPath('home'), value.slice(2)) : value }
function checksum(filePath: string) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') }
function removeIfExists(filePath: string) { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath) }
function writeJsonAtomic(filePath: string, value: unknown) { const tmp = `${filePath}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(tmp, filePath) }
function databaseEnv() { return { ...process.env, PGPASSWORD: process.env.POS_PG_PASSWORD || 'securestore_pos' } }
function databaseArgs() { return ['--host', process.env.POS_PG_HOST || '127.0.0.1', '--port', String(process.env.POS_PG_PORT || 5432), '--username', process.env.POS_PG_USER || 'securestore', '--dbname', process.env.POS_PG_DB || 'securestore_pos'] }
async function getBackupDir() {
  const row = await get("SELECT SettingValue AS \"settingValue\" FROM Settings WHERE SettingKey = 'BackupFolderPath'") as { settingValue?: string } | undefined
  const raw = expandHome(String(row?.settingValue || 'Backups').trim() || 'Backups')
  const dir = path.resolve(path.isAbsolute(raw) ? raw : path.join(app.getPath('userData'), raw))
  if (dir === path.resolve(app.getPath('userData'))) throw new PublicError('Use a backup subfolder instead of the main application data folder.')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK)
  return dir
}
async function verifyDatabaseBackup(filePath: string) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || fs.statSync(filePath).size === 0) throw new PublicError('Backup file is empty or invalid.')
  await execFileAsync('pg_restore', ['--list', filePath], { env: databaseEnv() })
}
async function insertBackupLog(backupPath: string, status: 'Success' | 'Failed', options: Record<string, unknown> = {}) {
  await run('INSERT INTO BackupLogs (BackupPath, FileSizeBytes, CreatedByUserID, Status, ErrorMessage, IsAutomatic, ChecksumSha256, MetadataPath, VerifiedAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [backupPath, options.fileSizeBytes || 0, options.userId || null, status, options.errorMessage || null, Boolean(options.isAutomatic), options.checksumSha256 || null, options.metadataPath || null, options.verifiedAt || null])
}
async function createVerifiedBackup(userId?: number, isAutomatic = false, label = BACKUP_PREFIX): Promise<BackupResult> {
  if (operationInProgress) return { success: false, message: 'A backup or restore is already running. Please wait for it to finish.' }
  operationInProgress = true
  let backupPath = ''
  try {
    const backupDir = await getBackupDir(); backupPath = path.join(backupDir, `${label}_${timestampForFile()}.db`); const metadataPath = `${backupPath}.json`
    await execFileAsync('pg_dump', [...databaseArgs(), '--format=custom', '--file', backupPath], { env: databaseEnv(), maxBuffer: 1024 * 1024 })
    await verifyDatabaseBackup(backupPath)
    const stats = fs.statSync(backupPath); const checksumSha256 = checksum(backupPath); fs.chmodSync(backupPath, 0o600); const verifiedAt = new Date().toISOString()
    writeJsonAtomic(metadataPath, { app: 'SecureStore POS', createdAt: verifiedAt, isAutomatic, fileSizeBytes: stats.size, checksumSha256 })
    await insertBackupLog(backupPath, 'Success', { fileSizeBytes: stats.size, userId, isAutomatic, checksumSha256, metadataPath, verifiedAt })
    if (userId) await auditService.log('BACKUP_CREATED', 'Backup', `Created verified backup at ${backupPath}`, userId)
    return { success: true, message: 'Backup created, verified, and secured successfully.', data: { backupPath, metadataPath, fileSizeBytes: stats.size, checksumSha256 } }
  } catch (error: any) {
    logger.error('Backup failed', error); if (backupPath) { try { await insertBackupLog(backupPath, 'Failed', { userId, isAutomatic, errorMessage: error.message }) } catch {} }; removeIfExists(backupPath)
    return { success: false, message: publicErrorMessage(error, 'Backup failed. Please try again.') }
  } finally { operationInProgress = false }
}

export const backupService = {
  isRestoring: () => restoring,
  isBusy: () => operationInProgress,
  createBackup: (userId?: number, isAutomatic = false) => createVerifiedBackup(userId, isAutomatic),
  restoreBackup: async (backupPath: string, userId?: number): Promise<ServiceResult> => {
    if (operationInProgress) return { success: false, message: 'A backup or restore is already running. Please wait for it to finish.' }
    operationInProgress = true; restoring = true
    try {
      const resolved = path.resolve(expandHome(String(backupPath || '').trim())); await verifyDatabaseBackup(resolved)
      const metadataPath = `${resolved}.json`
      if (fs.existsSync(metadataPath)) { const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as { checksumSha256?: string }; if (metadata.checksumSha256 && metadata.checksumSha256 !== checksum(resolved)) throw new PublicError('Backup checksum does not match the metadata file.') }
      const safety = await createVerifiedBackup(userId, false, 'SecureStorePOS_BeforeRestore'); if (!safety.success) throw new PublicError(`Restore stopped because safety backup failed: ${safety.message}`)
      await execFileAsync('pg_restore', [...databaseArgs(), '--clean', '--if-exists', '--no-owner', '--exit-on-error', resolved], { env: databaseEnv(), maxBuffer: 1024 * 1024 })
      await run('UPDATE BackupLogs SET LastRestoredAt = now() WHERE BackupPath = $1', [resolved]); await auditService.log('BACKUP_RESTORED', 'Backup', `Restored backup requested by user ${userId ?? 'unknown'}`, userId)
      return { success: true, message: 'Backup restored successfully.' }
    } catch (error: any) { logger.error('Restore failed', error); return { success: false, message: publicErrorMessage(error, 'Restore failed.') } }
    finally { restoring = false; operationInProgress = false }
  },
  restoreFromFile: async (userId?: number, parentWindow?: BrowserWindow | null) => {
    const options = { title: 'Select SecureStore POS backup', properties: ['openFile'] as Array<'openFile'>, filters: [{ name: 'PostgreSQL backup', extensions: ['db'] }] }; const result = parentWindow ? await dialog.showOpenDialog(parentWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled || !result.filePaths.length ? { success: false, message: 'Restore cancelled.' } : backupService.restoreBackup(result.filePaths[0], userId)
  },
  verifyBackup: async (backupPath: string): Promise<ServiceResult> => { try { const resolved = path.resolve(expandHome(String(backupPath || '').trim())); await verifyDatabaseBackup(resolved); return { success: true, message: 'Backup passed integrity and checksum verification.' } } catch (error: any) { return { success: false, message: publicErrorMessage(error, 'Backup verification failed.') } } },
  getHistory: async () => { try { const data = await all('SELECT b.BackupID as "backupId", b.BackupPath as "backupPath", b.FileSizeBytes as "fileSizeBytes", b.BackupDate as "backupDate", b.CreatedByUserID as "createdByUserId", u.Username as "createdBy", b.Status as status, b.ErrorMessage as "errorMessage", b.IsAutomatic as "isAutomatic", b.ChecksumSha256 as "checksumSha256", b.MetadataPath as "metadataPath", b.VerifiedAt as "verifiedAt", b.LastRestoredAt as "lastRestoredAt" FROM BackupLogs b LEFT JOIN Users u ON b.CreatedByUserID = u.UserID ORDER BY b.BackupDate DESC LIMIT 50'); return { success: true, data, message: '' } } catch (error: any) { return { success: false, data: [], message: publicErrorMessage(error) } } },
  getProductBackups: async (productId?: number) => { try { const data = await all(productId ? 'SELECT * FROM ProductBackups WHERE ProductID = $1 ORDER BY CreatedAt DESC' : 'SELECT * FROM ProductBackups ORDER BY CreatedAt DESC LIMIT 200', productId ? [productId] : []); return { success: true, data, message: '' } } catch (error: any) { return { success: false, data: [], message: publicErrorMessage(error) } } },
  readProductBackupFile: async (filePath: string) => { try { const resolved = path.resolve(String(filePath || '')); const record = await get('SELECT ChecksumSha256 as "checksum" FROM ProductBackups WHERE DataPath = $1', [resolved]) as { checksum?: string } | undefined; if (!record || path.extname(resolved).toLowerCase() !== '.json' || !fs.statSync(resolved).isFile() || checksum(resolved) !== record.checksum) throw new PublicError('Choose a valid registered product backup.'); return { success: true, data: JSON.parse(fs.readFileSync(resolved, 'utf8')), message: '' } } catch (error: any) { return { success: false, message: publicErrorMessage(error) } } },
  startAutoBackupScheduler: () => { if (autoBackupTimer) clearInterval(autoBackupTimer); autoBackupTimer = setInterval(() => createVerifiedBackup(undefined, true).catch(error => logger.error('Automatic backup failed', error)), 24 * 60 * 60 * 1000) },
  stopAutoBackupScheduler: () => { if (autoBackupTimer) clearInterval(autoBackupTimer); autoBackupTimer = null },
  insertProductBackup: async (product: Record<string, unknown>, action: string, userId?: number, metadata?: Record<string, unknown>, client?: Db): Promise<ProductBackupResult> => { try { const dir = path.join(await getBackupDir(), 'product-backups'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); const fullPath = path.join(dir, `ProductBackup_${action}_${timestampForFile()}_${crypto.randomUUID()}.json`); writeJsonAtomic(fullPath, { action, product, metadata: metadata ?? null, createdAt: new Date().toISOString() }); const fileChecksum = checksum(fullPath); const execute = client ? client.run.bind(client) : run; await execute('INSERT INTO ProductBackups (ProductID, Action, DataPath, ChecksumSha256, CreatedByUserID) VALUES ($1,$2,$3,$4,$5)', [product.productId || null, action, fullPath, fileChecksum, userId || null]); if (userId) await auditService.log('PRODUCT_BACKED_UP', 'ProductBackup', `Backed up product to ${fullPath}`, userId, undefined, client); return { success: true, message: 'Product backup created', data: { path: fullPath, checksum: fileChecksum } } } catch (error: any) { return { success: false, message: publicErrorMessage(error, 'Product backup failed') } }
  }
}
