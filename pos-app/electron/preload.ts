import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'

async function invoke(channel: string, ...args: unknown[]) {
  const result = await ipcRenderer.invoke(channel, ...args)
  if (result?.code === 'SESSION_EXPIRED') window.dispatchEvent(new Event('pos:session-expired'))
  return result
}

export const api = {
  // Auth
  getSessionStatus: () => invoke(IPC.AUTH_SESSION_STATUS),
  getSetupStatus: () => invoke(IPC.AUTH_SETUP_STATUS),
  createInitialAdmin: (req: any) => invoke(IPC.AUTH_CREATE_INITIAL_ADMIN, req),
  login: (req: any) => invoke(IPC.AUTH_LOGIN, req),
  logout: () => invoke(IPC.AUTH_LOGOUT),
  changePassword: (userId: number, currentPlain: string, newPlain: string) => invoke(IPC.AUTH_CHANGE_PASSWORD, userId, currentPlain, newPlain),
  
  // Products
  getProducts: () => invoke(IPC.PRODUCTS_GET_ALL),
  searchProducts: (term: string) => invoke(IPC.PRODUCTS_SEARCH, term),
  getProductById: (id: number) => invoke(IPC.PRODUCTS_GET_BY_ID, id),
  createProduct: (req: any, userId: number) => invoke(IPC.PRODUCTS_CREATE, req, userId),
  updateProduct: (req: any, userId: number) => invoke(IPC.PRODUCTS_UPDATE, req, userId),
  deactivateProduct: (pId: number, uId: number) => invoke(IPC.PRODUCTS_DEACTIVATE, pId, uId),
  activateProduct: (pId: number, uId: number) => invoke(IPC.PRODUCTS_ACTIVATE, pId, uId),
  getLowStockProducts: () => invoke(IPC.PRODUCTS_LOW_STOCK),
  getCategories: () => invoke(IPC.CATEGORIES_GET_ALL),

  // Sales
  completeSale: (req: any) => invoke(IPC.SALES_COMPLETE, req),
  getTodaySales: () => invoke(IPC.SALES_GET_TODAY),
  getSaleByInvoice: (invoice: string) => invoke(IPC.SALES_GET_BY_INVOICE, invoice),
  getSalesRange: (start: string, end: string) => invoke(IPC.SALES_GET_RANGE, start, end),
  voidSale: (sId: number, uId: number, reason: string) => invoke(IPC.SALES_VOID, sId, uId, reason),

  // Debts
  recordDebtPayment: (customerId: number, amount: number) => invoke(IPC.DEBTS_RECORD_PAYMENT, customerId, amount),
  getCustomerDebts: () => invoke(IPC.DEBTS_GET_ALL),

  // Stock
  getStockProducts: () => invoke(IPC.STOCK_GET_PRODUCTS),
  adjustStock: (req: any) => invoke(IPC.STOCK_ADJUST, req),
  getStockHistory: (productId: number) => invoke(IPC.STOCK_HISTORY, productId),

  // Reports
  getDashboard: () => invoke(IPC.REPORTS_DASHBOARD),
  getDailyReport: (start: string, end: string) => invoke(IPC.REPORTS_DAILY, start, end),
  getProductReport: (start: string, end: string) => invoke(IPC.REPORTS_PRODUCTS, start, end),
  getCashierReport: (start: string, end: string) => invoke(IPC.REPORTS_CASHIERS, start, end),
  exportSalesPdf: (start: string, end: string) => invoke(IPC.REPORTS_EXPORT_PDF, start, end),
  exportDataExcel: () => invoke(IPC.REPORTS_EXPORT_EXCEL),

  // Users & Roles
  getUsers: () => invoke(IPC.USERS_GET_ALL),
  createUser: (req: any, uId: number) => invoke(IPC.USERS_CREATE, req, uId),
  updateUser: (req: any, uId: number) => invoke(IPC.USERS_UPDATE, req, uId),
  unlockUser: (targetId: number, adminId: number) => invoke(IPC.USERS_UNLOCK, targetId, adminId),
  getRoles: () => invoke(IPC.ROLES_GET_ALL),

  // Audit
  getAuditLogs: (limit?: number) => invoke(IPC.AUDIT_GET_LOGS, limit),

  // Settings
  getSettings: () => invoke(IPC.SETTINGS_GET_ALL),
  updateSettings: (req: any, uId: number) => invoke(IPC.SETTINGS_SET, req, uId),

  // Backup
  createBackup: (uId: number) => invoke(IPC.BACKUP_CREATE, uId),
  restoreBackup: (backupPath: string, uId: number) => invoke(IPC.BACKUP_RESTORE, backupPath, uId),
  restoreBackupFromFile: (uId: number) => invoke(IPC.BACKUP_RESTORE_FROM_FILE, uId),
  verifyBackup: (backupPath: string) => invoke(IPC.BACKUP_VERIFY, backupPath),
  getBackupHistory: () => invoke(IPC.BACKUP_HISTORY),
  getProductBackups: (productId: number) => invoke(IPC.PRODUCT_BACKUPS_GET, productId),
  readProductBackupFile: (filePath: string) => invoke(IPC.PRODUCT_BACKUP_READ, filePath)
}

contextBridge.exposeInMainWorld('api', api)
