import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC, type User, type UserRole } from '../../shared/types'
import { get } from '../database/database'
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
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
import { logger } from '../utils/logger'

import { isAllowedRendererUrl } from '../security/renderer'

let trustedWindow: BrowserWindow
let pendingRequests = 0
let requestQueue = Promise.resolve<unknown>(undefined)

function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== trustedWindow.webContents || event.senderFrame !== event.sender.mainFrame || !isAllowedRendererUrl(event.senderFrame.url)) {
      return { success: false, message: 'This window is not authorized.' }
    }
    if (backupService.isRestoring()) return { success: false, message: 'Restore in progress. Please wait.' }
    if (pendingRequests >= 64) return { success: false, message: 'Too many requests. Please wait.' }
    pendingRequests++
    const result = requestQueue.then(() => safelyInvoke(() => listener(event, ...args)))
    requestQueue = result.catch(() => undefined).finally(() => { pendingRequests-- })
    return result
  })
}

type Handler<T> = (user?: User) => T | Promise<T>

async function getSessionTimeoutMinutes() {
  try {
    const row = await get("SELECT SettingValue FROM Settings WHERE SettingKey = 'SessionTimeoutMinutes'") as any
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
    return { success: false, message: publicErrorMessage(error), code: error instanceof PublicError && /sign in again/i.test(error.message) ? 'SESSION_EXPIRED' : undefined }
  }
}

function handlePublic<T>(channel: string, handler: Handler<T>) {
  handle(channel, () => safelyInvoke(handler))
}

function handleAuthenticated<T>(channel: string, handler: Handler<T>) {
  handle(channel, () => safelyInvoke(async () => handler(await requireSession())))
}

function handleRole<T>(channel: string, roles: UserRole[], handler: Handler<T>) {
  handle(channel, () => safelyInvoke(async () => handler(await requireRole(roles))))
}

function checkoutProducts(response: any, user: User) {
  if (user.roleName === 'Admin' || !response?.success) return response
  const redact = (product: Record<string, unknown>) => Object.fromEntries(
    Object.entries(product).filter(([key]) => !['purchasePrice', 'PurchasePrice', 'stockCost', 'stockProfitPotential'].includes(key))
  )
  return { ...response, data: Array.isArray(response.data) ? response.data.map(redact) : response.data ? redact(response.data) : response.data }
}

export function registerIpcHandlers(window: BrowserWindow) {
  trustedWindow = window
  // Auth
  handlePublic(IPC.AUTH_SESSION_STATUS, async () => ({ success: true, data: await requireSession(false) }))
  handlePublic(IPC.AUTH_SETUP_STATUS, () => authService.getSetupStatus())
  handle(IPC.AUTH_CREATE_INITIAL_ADMIN, (_, req) =>
    safelyInvoke(() => authService.createInitialAdmin({
      username: String(req?.username ?? ''),
      fullName: String(req?.fullName ?? ''),
      plainPassword: String(req?.plainPassword ?? '')
    }))
  )
  handle(IPC.AUTH_LOGIN, (_, req) =>
    safelyInvoke(async () => {
      const response = await authService.login({
        username: String(req?.username ?? ''),
        password: String(req?.password ?? '')
      })

      if (response.success && response.user) {
        startSession(response.user, await getSessionTimeoutMinutes())
      }

      return response
    })
  )
  handlePublic(IPC.AUTH_LOGOUT, () => {
    endSession()
    return { success: true, message: 'Signed out successfully.' }
  })
  handle(IPC.AUTH_CHANGE_PASSWORD, (_, _userId, currentPlain, newPlain) =>
    safelyInvoke(async () => {
      const user = await requireSession()
      return userService.changePassword(user.userId, String(currentPlain ?? ''), String(newPlain ?? ''))
    })
  )

  // Products
  handleAuthenticated(IPC.PRODUCTS_GET_ALL, async user => checkoutProducts(await productService.getAll(), user!))
  handle(IPC.PRODUCTS_SEARCH, (_, term) =>
    safelyInvoke(async () => {
      const user = await requireSession()
      return checkoutProducts(productService.search(String(term ?? '')), user)
    })
  )
  handle(IPC.PRODUCTS_GET_BY_ID, (_, id) =>
    safelyInvoke(async () => {
      const user = await requireSession()
      return checkoutProducts(productService.getById(Number(id)), user)
    })
  )
  handle(IPC.PRODUCTS_CREATE, (_, req) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return productService.create(req, user.userId)
    })
  )
  handle(IPC.PRODUCTS_UPDATE, (_, req) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return productService.update(req, user.userId)
    })
  )
  handle(IPC.PRODUCTS_DEACTIVATE, (_, productId) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return productService.deactivate(Number(productId), user.userId)
    })
  )
  handle(IPC.PRODUCTS_ACTIVATE, (_, productId) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return productService.activate(Number(productId), user.userId)
    })
  )
  handleRole(IPC.PRODUCTS_LOW_STOCK, ['Admin'], () => productService.getLowStock())
  handleAuthenticated(IPC.CATEGORIES_GET_ALL, () => productService.getAllCategories())

  // Sales
  handle(IPC.SALES_COMPLETE, (_, req) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin', 'Cashier'])
      return saleService.completeSale({ ...req, userId: user.userId })
    })
  )
  handleAuthenticated(IPC.SALES_GET_TODAY, user => saleService.getTodaySales(user!.roleName === 'Admin' ? undefined : user!.userId))
  handle(IPC.SALES_GET_BY_INVOICE, (_, invoice) =>
    safelyInvoke(async () => {
      const user = await requireSession()
      return saleService.getByInvoice(String(invoice ?? ''), user.roleName === 'Admin' ? undefined : user.userId)
    })
  )
  handle(IPC.SALES_GET_RANGE, (_, start, end) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return saleService.getRange(String(start ?? ''), String(end ?? ''))
    })
  )
  handle(IPC.SALES_VOID, (_, saleId, _userId, reason) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return saleService.voidSale(Number(saleId), user.userId, String(reason ?? ''))
    })
  )

  // Debts / customer dues
  handleRole(IPC.DEBTS_GET_ALL, ['Admin'], () => debtService.getOutstanding())

  handle(IPC.DEBTS_RECORD_PAYMENT, (_, customerId, amount) => safelyInvoke(async () => {
    const user = await requireRole(['Admin'])
    return debtService.recordPayment(Number(customerId), Number(amount), user.userId)
  }))

  // Stock
  handleRole(IPC.STOCK_GET_PRODUCTS, ['Admin'], () => productService.getAllForStock())
  handle(IPC.STOCK_ADJUST, (_, req) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return stockService.adjustStock({ ...req, userId: user.userId })
    })
  )
  handle(IPC.STOCK_HISTORY, (_, productId) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return stockService.getHistory(Number(productId))
    })
  )

  // Reports
  handleRole(IPC.REPORTS_DASHBOARD, ['Admin'], () => reportService.getDashboard())
  handle(IPC.REPORTS_DAILY, (_, start, end) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return reportService.getDailyReport(String(start ?? ''), String(end ?? ''))
    })
  )
  handle(IPC.REPORTS_PRODUCTS, (_, start, end) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return reportService.getProductReport(String(start ?? ''), String(end ?? ''))
    })
  )
  handle(IPC.REPORTS_CASHIERS, (_, start, end) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return reportService.getCashierReport(String(start ?? ''), String(end ?? ''))
    })
  )
  handle(IPC.REPORTS_EXPORT_PDF, (event, start, end) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return reportService.exportSalesPdf(String(start ?? ''), String(end ?? ''), BrowserWindow.fromWebContents(event.sender))
    })
  )
  handle(IPC.REPORTS_EXPORT_EXCEL, (event) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return reportService.exportDataExcel(BrowserWindow.fromWebContents(event.sender))
    })
  )

  // Users
  handleRole(IPC.USERS_GET_ALL, ['Admin'], () => userService.getAllUsers())
  handle(IPC.USERS_CREATE, (_, req) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return userService.create(req, user.userId)
    })
  )
  handle(IPC.USERS_UPDATE, (_, req) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return userService.update(req, user.userId)
    })
  )
  handle(IPC.USERS_UNLOCK, (_, targetId) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return userService.unlock(Number(targetId), user.userId)
    })
  )
  handleRole(IPC.ROLES_GET_ALL, ['Admin'], () => userService.getAllRoles())

  // Audit
  handle(IPC.AUDIT_GET_LOGS, (_, limit) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return auditService.getLogs(Number(limit || 100))
    })
  )

  // Settings
  handleAuthenticated(IPC.SETTINGS_GET_ALL, () => settingsService.getAll())
  handle(IPC.SETTINGS_SET, (_, req) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return settingsService.updateAll(req, user.userId)
    })
  )

  // Backup
  handle(IPC.BACKUP_CREATE, () =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      return backupService.createBackup(user.userId, false)
    })
  )
  handle(IPC.BACKUP_RESTORE, (_, backupPath) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      const response = await backupService.restoreBackup(String(backupPath ?? ''), user.userId)
      if (response.success) endSession()
      return response
    })
  )
  handle(IPC.BACKUP_RESTORE_FROM_FILE, (event) =>
    safelyInvoke(async () => {
      const user = await requireRole(['Admin'])
      const response = await backupService.restoreFromFile(user.userId, BrowserWindow.fromWebContents(event.sender))
      if (response.success) endSession()
      return response
    })
  )
  handle(IPC.BACKUP_VERIFY, (_, backupPath) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return await backupService.verifyBackup(String(backupPath ?? ''))
    })
  )
  handleRole(IPC.BACKUP_HISTORY, ['Admin'], () => backupService.getHistory())
  // Product backups
  handle(IPC.PRODUCT_BACKUPS_GET, (_, productId) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return await backupService.getProductBackups(productId ? Number(productId) : undefined)
    })
  )
  handle(IPC.PRODUCT_BACKUP_READ, (_, filePath) =>
    safelyInvoke(async () => {
      await requireRole(['Admin'])
      return await backupService.readProductBackupFile(String(filePath ?? ''))
    })
  )
}
