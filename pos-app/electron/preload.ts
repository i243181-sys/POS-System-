import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'

export const api = {
  // Auth
  getSetupStatus: () => ipcRenderer.invoke(IPC.AUTH_SETUP_STATUS),
  createInitialAdmin: (req: any) => ipcRenderer.invoke(IPC.AUTH_CREATE_INITIAL_ADMIN, req),
  login: (req: any) => ipcRenderer.invoke(IPC.AUTH_LOGIN, req),
  logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
  changePassword: (userId: number, currentPlain: string, newPlain: string) => ipcRenderer.invoke(IPC.AUTH_CHANGE_PASSWORD, userId, currentPlain, newPlain),
  
  // Products
  getProducts: () => ipcRenderer.invoke(IPC.PRODUCTS_GET_ALL),
  searchProducts: (term: string) => ipcRenderer.invoke(IPC.PRODUCTS_SEARCH, term),
  getProductById: (id: number) => ipcRenderer.invoke(IPC.PRODUCTS_GET_BY_ID, id),
  createProduct: (req: any, userId: number) => ipcRenderer.invoke(IPC.PRODUCTS_CREATE, req, userId),
  updateProduct: (req: any, userId: number) => ipcRenderer.invoke(IPC.PRODUCTS_UPDATE, req, userId),
  deactivateProduct: (pId: number, uId: number) => ipcRenderer.invoke(IPC.PRODUCTS_DEACTIVATE, pId, uId),
  activateProduct: (pId: number, uId: number) => ipcRenderer.invoke(IPC.PRODUCTS_ACTIVATE, pId, uId),
  getLowStockProducts: () => ipcRenderer.invoke(IPC.PRODUCTS_LOW_STOCK),
  getCategories: () => ipcRenderer.invoke(IPC.CATEGORIES_GET_ALL),

  // Sales
  completeSale: (req: any) => ipcRenderer.invoke(IPC.SALES_COMPLETE, req),
  getTodaySales: () => ipcRenderer.invoke(IPC.SALES_GET_TODAY),
  getSaleByInvoice: (invoice: string) => ipcRenderer.invoke(IPC.SALES_GET_BY_INVOICE, invoice),
  getSalesRange: (start: string, end: string) => ipcRenderer.invoke(IPC.SALES_GET_RANGE, start, end),
  voidSale: (sId: number, uId: number, reason: string) => ipcRenderer.invoke(IPC.SALES_VOID, sId, uId, reason),

  // Debts
  getCustomerDebts: () => ipcRenderer.invoke(IPC.DEBTS_GET_ALL),

  // Stock
  getStockProducts: () => ipcRenderer.invoke(IPC.STOCK_GET_PRODUCTS),
  adjustStock: (req: any) => ipcRenderer.invoke(IPC.STOCK_ADJUST, req),
  getStockHistory: (productId: number) => ipcRenderer.invoke(IPC.STOCK_HISTORY, productId),

  // Reports
  getDashboard: () => ipcRenderer.invoke(IPC.REPORTS_DASHBOARD),
  getDailyReport: (start: string, end: string) => ipcRenderer.invoke(IPC.REPORTS_DAILY, start, end),
  getProductReport: (start: string, end: string) => ipcRenderer.invoke(IPC.REPORTS_PRODUCTS, start, end),
  getCashierReport: (start: string, end: string) => ipcRenderer.invoke(IPC.REPORTS_CASHIERS, start, end),
  exportSalesPdf: (start: string, end: string) => ipcRenderer.invoke(IPC.REPORTS_EXPORT_PDF, start, end),
  exportDataExcel: () => ipcRenderer.invoke(IPC.REPORTS_EXPORT_EXCEL),

  // Users & Roles
  getUsers: () => ipcRenderer.invoke(IPC.USERS_GET_ALL),
  createUser: (req: any, uId: number) => ipcRenderer.invoke(IPC.USERS_CREATE, req, uId),
  updateUser: (req: any, uId: number) => ipcRenderer.invoke(IPC.USERS_UPDATE, req, uId),
  unlockUser: (targetId: number, adminId: number) => ipcRenderer.invoke(IPC.USERS_UNLOCK, targetId, adminId),
  getRoles: () => ipcRenderer.invoke(IPC.ROLES_GET_ALL),

  // Audit
  getAuditLogs: (limit?: number) => ipcRenderer.invoke(IPC.AUDIT_GET_LOGS, limit),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
  updateSettings: (req: any, uId: number) => ipcRenderer.invoke(IPC.SETTINGS_SET, req, uId),

  // Backup
  createBackup: (uId: number) => ipcRenderer.invoke(IPC.BACKUP_CREATE, uId),
  restoreBackup: (backupPath: string, uId: number) => ipcRenderer.invoke(IPC.BACKUP_RESTORE, backupPath, uId),
  restoreBackupFromFile: (uId: number) => ipcRenderer.invoke(IPC.BACKUP_RESTORE_FROM_FILE, uId),
  verifyBackup: (backupPath: string) => ipcRenderer.invoke(IPC.BACKUP_VERIFY, backupPath),
  getBackupHistory: () => ipcRenderer.invoke(IPC.BACKUP_HISTORY),
  getProductBackups: (productId: number) => ipcRenderer.invoke(IPC.PRODUCT_BACKUPS_GET, productId),
  readProductBackupFile: (filePath: string) => ipcRenderer.invoke(IPC.PRODUCT_BACKUP_READ, filePath)
}

contextBridge.exposeInMainWorld('api', api)
