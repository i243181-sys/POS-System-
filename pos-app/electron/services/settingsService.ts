import { getDb } from '../database/database'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'
import type { ServiceResult } from '../../shared/types'

const ALLOWED_SETTINGS = new Set([
  'ShopName',
  'ShopAddress',
  'ShopPhone',
  'ShopEmail',
  'Currency',
  'CurrencySymbol',
  'TaxPercent',
  'SessionTimeoutMinutes',
  'CashierMaxDiscountPercent',
  'BackupFolderPath',
  'AutoBackupEnabled',
  'BackupRetentionDays',
  'MinimumDataRetentionDays',
  'LowStockThreshold',
  'ReceiptHeaderMessage',
  'ReceiptFooterMessage',
  'ReceiptShowPhone',
  'ReceiptShowAddress',
  'InvoicePrefix'
])

function clean(settings: Record<string, string>) {
  const next: Record<string, string> = {}

  for (const [key, rawValue] of Object.entries(settings)) {
    if (!ALLOWED_SETTINGS.has(key)) continue
    next[key] = String(rawValue ?? '').trim()
  }

  if (!next.ShopName) throw new Error('Shop name is required.')
  if (!next.ShopAddress) throw new Error('Shop address is required.')
  if (!next.ShopPhone) throw new Error('Shop phone is required.')
  if (next.ShopName.length > 100) throw new Error('Shop name must be 100 characters or fewer.')
  if (next.ShopAddress.length > 250) throw new Error('Shop address must be 250 characters or fewer.')
  if (next.ShopPhone.length > 30) throw new Error('Shop phone must be 30 characters or fewer.')
  if (next.ReceiptHeaderMessage && next.ReceiptHeaderMessage.length > 200) throw new Error('Receipt header must be 200 characters or fewer.')
  if (next.ReceiptFooterMessage && next.ReceiptFooterMessage.length > 200) throw new Error('Receipt footer must be 200 characters or fewer.')
  if (next.ShopEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.ShopEmail)) throw new Error('Shop email is not valid.')

  next.Currency = 'PKR'
  next.CurrencySymbol = 'Rs'

  const taxPercent = Number(next.TaxPercent || 0)
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) throw new Error('Tax percent must be between 0 and 100.')
  next.TaxPercent = String(taxPercent)

  const sessionTimeout = Number(next.SessionTimeoutMinutes || 30)
  if (!Number.isInteger(sessionTimeout) || sessionTimeout < 5 || sessionTimeout > 480) throw new Error('Session timeout must be between 5 and 480 minutes.')
  next.SessionTimeoutMinutes = String(sessionTimeout)

  const cashierDiscount = Number(next.CashierMaxDiscountPercent || 0)
  if (!Number.isFinite(cashierDiscount) || cashierDiscount < 0 || cashierDiscount > 100) throw new Error('Cashier max discount must be between 0 and 100.')
  next.CashierMaxDiscountPercent = String(cashierDiscount)

  const lowStock = Number(next.LowStockThreshold || 10)
  if (!Number.isInteger(lowStock) || lowStock < 0) throw new Error('Low stock threshold cannot be negative.')
  next.LowStockThreshold = String(lowStock)

  const retentionDays = Number(next.MinimumDataRetentionDays || 365)
  if (!Number.isInteger(retentionDays) || retentionDays < 365) throw new Error('Data retention must be at least 365 days.')
  next.MinimumDataRetentionDays = String(retentionDays)

  next.AutoBackupEnabled = String(next.AutoBackupEnabled === 'true')
  next.ReceiptShowPhone = String(next.ReceiptShowPhone !== 'false')
  next.ReceiptShowAddress = String(next.ReceiptShowAddress !== 'false')
  next.BackupFolderPath = next.BackupFolderPath || 'Backups'
  const backupRetentionDays = Number(next.BackupRetentionDays || 30)
  if (!Number.isInteger(backupRetentionDays) || backupRetentionDays < 7 || backupRetentionDays > 3650) {
    throw new Error('Backup retention must be between 7 and 3650 days.')
  }
  next.BackupRetentionDays = String(backupRetentionDays)
  next.InvoicePrefix = (next.InvoicePrefix || 'POS').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || 'POS'

  return next
}

export const settingsService = {
  getAll: () => {
    try {
      const db = getDb()
      const settings = db.prepare('SELECT SettingKey, SettingValue, Description FROM Settings').all()
      
      // Convert array of rows to a key-value dictionary object
      const result: Record<string, string> = {}
      for (const row of settings as any[]) {
        result[row.SettingKey] = row.SettingValue
      }
      return { success: true, data: result, message: '' }
    } catch (error: any) {
      logger.error('Error fetching settings', error)
      return { success: false, message: publicErrorMessage(error), data: {} }
    }
  },

  updateAll: (settingsToUpdate: Record<string, string>, userId: number): ServiceResult => {
    const db = getDb()
    const transaction = db.transaction((settings: Record<string, string>) => {
      const cleaned = clean(settings)
      const stmt = db.prepare(`
        INSERT INTO Settings (SettingKey, SettingValue, Description, UpdatedAt)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(SettingKey) DO UPDATE SET
          SettingValue = excluded.SettingValue,
          UpdatedAt = datetime('now')
      `)
      for (const [key, value] of Object.entries(cleaned)) {
        stmt.run(key, value, null)
      }
      auditService.log('SETTINGS_UPDATED', 'Settings', 'System settings were updated', userId)
    })

    try {
      transaction(settingsToUpdate)
      return { success: true, message: 'Settings saved successfully' }
    } catch (error: any) {
      logger.error('Failed to save settings', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  }
}
