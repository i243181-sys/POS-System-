import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type User, type UserRole } from '../../shared/types'
import { getDb } from '../database/database'
import { authService } from '../services/authService'
import { productService } from '../services/productService'
import { saleService } from '../services/saleService'
import { stockService } from '../services/stockService'
import { debtService } from '../services/debtService'
import { reportService } from '../services/reportService'
import { auditService } from '../services/auditService'
import { userService } from '../services/userService'
import { settingsService } from '../services/settingsService'
import { backupService } from '../services/backupService'
import { endSession, requireRole, requireSession, startSession } from '../security/session'
import { publicErrorMessage } from '../utils/safeErrors'
import { logger } from '../utils/logger'

type Handler<T> = (user?: User) => T | Promise<T>

function getSessionTimeoutMinutes() {
  try {
    const row = getDb().prepare("SELECT SettingValue FROM Settings WHERE SettingKey = 'SessionTimeoutMinutes'").get() as any
    const timeout = Number(row?.SettingValue || 30)
    return Number.isInteger(timeout) ? timeout : 30
  } catch {
    return 30
  }
}

async function safelyInvoke<T>(handler: Handler<T>) {
  try {
    return await handler()
  } catch (error) {
    logger.error('IPC handler failed', error)
    return { success: false, message: publicErrorMessage(error) }
  }
}

function handlePublic<T>(channel: string, handler: Handler<T>) {
  ipcMain.handle(channel, () => safelyInvoke(handler))
}

function handleAuthenticated<T>(channel: string, handler: Handler<T>) {
  ipcMain.handle(channel, () => safelyInvoke(() => handler(requireSession())))
}

function handleRole<T>(channel: string, roles: UserRole[], handler: Handler<T>) {
  ipcMain.handle(channel, () => safelyInvoke(() => handler(requireRole(roles))))
}

export function registerIpcHandlers() {
  // Auth
  handlePublic(IPC.AUTH_SETUP_STATUS, () => authService.getSetupStatus())
  ipcMain.handle(IPC.AUTH_CREATE_INITIAL_ADMIN, (_, req) =>
    safelyInvoke(() => authService.createInitialAdmin({
      username: String(req?.username ?? ''),
      fullName: String(req?.fullName ?? ''),
      plainPassword: String(req?.plainPassword ?? '')
    }))
  )
  ipcMain.handle(IPC.AUTH_LOGIN, (_, req) =>
    safelyInvoke(async () => {
      const response = await authService.login({
        username: String(req?.username ?? ''),
        password: String(req?.password ?? '')
      })

      if (response.success && response.user) {
        startSession(response.user, getSessionTimeoutMinutes())
      }

      return response
    })
  )
  handleAuthenticated(IPC.AUTH_LOGOUT, () => {
    endSession()
    return { success: true, message: 'Signed out successfully.' }
  })
  ipcMain.handle(IPC.AUTH_CHANGE_PASSWORD, (_, _userId, currentPlain, newPlain) =>
    safelyInvoke(() => {
      const user = requireSession()
      return userService.changePassword(user.userId, String(currentPlain ?? ''), String(newPlain ?? ''))
    })
  )

  // Products
  handleAuthenticated(IPC.PRODUCTS_GET_ALL, () => productService.getAll())
  ipcMain.handle(IPC.PRODUCTS_SEARCH, (_, term) =>
    safelyInvoke(() => {
      requireSession()
      return productService.search(String(term ?? ''))
    })
  )
  ipcMain.handle(IPC.PRODUCTS_GET_BY_ID, (_, id) =>
    safelyInvoke(() => {
      requireSession()
      return productService.getById(Number(id))
    })
  )
  ipcMain.handle(IPC.PRODUCTS_CREATE, (_, req) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return productService.create(req, user.userId)
    })
  )
  ipcMain.handle(IPC.PRODUCTS_UPDATE, (_, req) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return productService.update(req, user.userId)
    })
  )
  ipcMain.handle(IPC.PRODUCTS_DEACTIVATE, (_, productId) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return productService.deactivate(Number(productId), user.userId)
    })
  )
  ipcMain.handle(IPC.PRODUCTS_ACTIVATE, (_, productId) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return productService.activate(Number(productId), user.userId)
    })
  )
  handleAuthenticated(IPC.PRODUCTS_LOW_STOCK, () => productService.getLowStock())
  handleAuthenticated(IPC.CATEGORIES_GET_ALL, () => productService.getAllCategories())

  // Sales
  ipcMain.handle(IPC.SALES_COMPLETE, (_, req) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin', 'Cashier'])
      return saleService.completeSale({ ...req, userId: user.userId })
    })
  )
  handleAuthenticated(IPC.SALES_GET_TODAY, () => saleService.getTodaySales())
  ipcMain.handle(IPC.SALES_GET_BY_INVOICE, (_, invoice) =>
    safelyInvoke(() => {
      requireSession()
      return saleService.getByInvoice(String(invoice ?? ''))
    })
  )
  ipcMain.handle(IPC.SALES_GET_RANGE, (_, start, end) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return saleService.getRange(String(start ?? ''), String(end ?? ''))
    })
  )
  ipcMain.handle(IPC.SALES_VOID, (_, saleId, _userId, reason) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return saleService.voidSale(Number(saleId), user.userId, String(reason ?? ''))
    })
  )

  // Debts / customer dues
  handleRole(IPC.DEBTS_GET_ALL, ['Admin'], () => debtService.getOutstanding())

  // Stock
  handleRole(IPC.STOCK_GET_PRODUCTS, ['Admin'], () => productService.getAllForStock())
  ipcMain.handle(IPC.STOCK_ADJUST, (_, req) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return stockService.adjustStock({ ...req, userId: user.userId })
    })
  )
  ipcMain.handle(IPC.STOCK_HISTORY, (_, productId) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return stockService.getHistory(Number(productId))
    })
  )

  // Reports
  handleAuthenticated(IPC.REPORTS_DASHBOARD, () => reportService.getDashboard())
  ipcMain.handle(IPC.REPORTS_DAILY, (_, start, end) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return reportService.getDailyReport(String(start ?? ''), String(end ?? ''))
    })
  )
  ipcMain.handle(IPC.REPORTS_PRODUCTS, (_, start, end) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return reportService.getProductReport(String(start ?? ''), String(end ?? ''))
    })
  )
  ipcMain.handle(IPC.REPORTS_CASHIERS, (_, start, end) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return reportService.getCashierReport(String(start ?? ''), String(end ?? ''))
    })
  )
  ipcMain.handle(IPC.REPORTS_EXPORT_PDF, (event, start, end) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return reportService.exportSalesPdf(String(start ?? ''), String(end ?? ''), BrowserWindow.fromWebContents(event.sender))
    })
  )
  ipcMain.handle(IPC.REPORTS_EXPORT_EXCEL, (event) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return reportService.exportDataExcel(BrowserWindow.fromWebContents(event.sender))
    })
  )

  // Users
  handleRole(IPC.USERS_GET_ALL, ['Admin'], () => userService.getAllUsers())
  ipcMain.handle(IPC.USERS_CREATE, (_, req) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return userService.create(req, user.userId)
    })
  )
  ipcMain.handle(IPC.USERS_UPDATE, (_, req) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return userService.update(req, user.userId)
    })
  )
  ipcMain.handle(IPC.USERS_UNLOCK, (_, targetId) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return userService.unlock(Number(targetId), user.userId)
    })
  )
  handleRole(IPC.ROLES_GET_ALL, ['Admin'], () => userService.getAllRoles())

  // Audit
  ipcMain.handle(IPC.AUDIT_GET_LOGS, (_, limit) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return auditService.getLogs(Number(limit || 100))
    })
  )

  // Settings
  handleAuthenticated(IPC.SETTINGS_GET_ALL, () => settingsService.getAll())
  ipcMain.handle(IPC.SETTINGS_SET, (_, req) =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return settingsService.updateAll(req, user.userId)
    })
  )

  // Backup
  ipcMain.handle(IPC.BACKUP_CREATE, () =>
    safelyInvoke(() => {
      const user = requireRole(['Admin'])
      return backupService.createBackup(user.userId, false)
    })
  )
  ipcMain.handle(IPC.BACKUP_RESTORE, (_, backupPath) =>
    safelyInvoke(async () => {
      const user = requireRole(['Admin'])
      const response = await backupService.restoreBackup(String(backupPath ?? ''), user.userId)
      if (response.success) endSession()
      return response
    })
  )
  ipcMain.handle(IPC.BACKUP_RESTORE_FROM_FILE, (event) =>
    safelyInvoke(async () => {
      const user = requireRole(['Admin'])
      const response = await backupService.restoreFromFile(user.userId, BrowserWindow.fromWebContents(event.sender))
      if (response.success) endSession()
      return response
    })
  )
  ipcMain.handle(IPC.BACKUP_VERIFY, (_, backupPath) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return backupService.verifyBackup(String(backupPath ?? ''))
    })
  )
  handleRole(IPC.BACKUP_HISTORY, ['Admin'], () => backupService.getHistory())
  // Product backups
  ipcMain.handle(IPC.PRODUCT_BACKUPS_GET, (_, productId) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return backupService.getProductBackups(productId ? Number(productId) : undefined)
    })
  )
  ipcMain.handle(IPC.PRODUCT_BACKUP_READ, (_, filePath) =>
    safelyInvoke(() => {
      requireRole(['Admin'])
      return backupService.readProductBackupFile(String(filePath ?? ''))
    })
  )
}
