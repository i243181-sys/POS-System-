import { all, withTx, type Db } from '../database/database'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
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

  if (!next.ShopName) throw new PublicError('Shop name is required.')
  if (!next.ShopAddress) throw new PublicError('Shop address is required.')
  if (!next.ShopPhone) throw new PublicError('Shop phone is required.')
  if (next.ShopName.length > 100) throw new PublicError('Shop name must be 100 characters or fewer.')
  if (next.ShopAddress.length > 250) throw new PublicError('Shop address must be 250 characters or fewer.')
  if (next.ShopPhone.length > 30) throw new PublicError('Shop phone must be 30 characters or fewer.')
  if (next.ReceiptHeaderMessage && next.ReceiptHeaderMessage.length > 200) throw new PublicError('Receipt header must be 200 characters or fewer.')
  if (next.ReceiptFooterMessage && next.ReceiptFooterMessage.length > 200) throw new PublicError('Receipt footer must be 200 characters or fewer.')
  if (next.ShopEmail && !/^\S+@\S+\.\S+$/.test(next.ShopEmail)) throw new PublicError('Shop email is not valid.')

  next.Currency = 'PKR'
  next.CurrencySymbol = 'Rs'

  const taxPercent = Number(next.TaxPercent || 0)
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) throw new PublicError('Tax percent must be between 0 and 100.')
  next.TaxPercent = String(taxPercent)

  const sessionTimeout = Number(next.SessionTimeoutMinutes || 30)
  if (!Number.isInteger(sessionTimeout) || sessionTimeout < 5 || sessionTimeout > 480) throw new PublicError('Session timeout must be between 5 and 480 minutes.')
  next.SessionTimeoutMinutes = String(sessionTimeout)

  const cashierDiscount = Number(next.CashierMaxDiscountPercent || 0)
  if (!Number.isFinite(cashierDiscount) || cashierDiscount < 0 || cashierDiscount > 100) throw new PublicError('Cashier max discount must be between 0 and 100.')
  next.CashierMaxDiscountPercent = String(cashierDiscount)

  const lowStock = Number(next.LowStockThreshold || 10)
  if (!Number.isInteger(lowStock) || lowStock < 0) throw new PublicError('Low stock threshold cannot be negative.')
  next.LowStockThreshold = String(lowStock)

  const retentionDays = Number(next.MinimumDataRetentionDays || 365)
  if (!Number.isInteger(retentionDays) || retentionDays < 365) throw new PublicError('Data retention must be at least 365 days.')
  next.MinimumDataRetentionDays = String(retentionDays)

  next.AutoBackupEnabled = String(next.AutoBackupEnabled === 'true')
  next.ReceiptShowPhone = String(next.ReceiptShowPhone !== 'false')
  next.ReceiptShowAddress = String(next.ReceiptShowAddress !== 'false')
  next.BackupFolderPath = next.BackupFolderPath || 'Backups'
  const backupRetentionDays = Number(next.BackupRetentionDays || 30)
  if (!Number.isInteger(backupRetentionDays) || backupRetentionDays < 7 || backupRetentionDays > 3650) {
    throw new PublicError('Backup retention must be between 7 and 3650 days.')
  }
  next.BackupRetentionDays = String(backupRetentionDays)
  next.InvoicePrefix = (next.InvoicePrefix || 'POS').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || 'POS'

  return next
}

export const settingsService = {
  getAll: async () => {
    try {
      const settings = await all('SELECT SettingKey, SettingValue, Description FROM Settings')
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

  updateAll: async (settingsToUpdate: Record<string, string>, userId: number): Promise<ServiceResult> => {
    try {
      await withTx(async (tx: Db) => {
        const cleaned = clean(settingsToUpdate)
        for (const [key, value] of Object.entries(cleaned)) {
          await tx.run(
            `INSERT INTO Settings (SettingKey, SettingValue, Description, UpdatedAt)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (SettingKey) DO UPDATE SET
               SettingValue = excluded.SettingValue,
               UpdatedAt = now()`,
            [key, value, null]
          )
        }
        await auditService.log('SETTINGS_UPDATED', 'Settings', 'System settings were updated', userId, undefined, tx)
      })
      return { success: true, message: 'Settings saved successfully' }
    } catch (error: any) {
      logger.error('Failed to save settings', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  }
}
