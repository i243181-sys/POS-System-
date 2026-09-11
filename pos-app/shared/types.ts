// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types — used by BOTH Electron main process and React renderer
// via the contextBridge IPC contract.
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'Admin' | 'Cashier'
export type AccountStatus = 'Active' | 'Inactive' | 'Locked'
export type TransactionType = 'Sale' | 'Purchase' | 'Adjustment' | 'Return' | 'Void'
export type PaymentMethod = 'Cash' | 'Card' | 'MobilePayment' | 'Cheque' | 'Other'
export type PaymentStatus = 'Pending' | 'Completed' | 'Refunded' | 'Voided'

// ── Entities ─────────────────────────────────────────────────────────────────

export interface Role {
  roleId: number
  roleName: UserRole
}

export interface User {
  userId: number
  username: string
  fullName: string
  roleId: number
  roleName?: UserRole
  status: AccountStatus
  failedLoginAttempts: number
  lastLoginAt?: string
  createdAt: string
}

export interface Category {
  categoryId: number
  categoryName: string
  description?: string
  isActive: boolean
}

export interface Product {
  productId: number
  productName: string
  categoryId: number
  categoryName?: string
  brand?: string
  barcode?: string
  purchasePrice: number
  sellingPrice: number
  stockQuantity: number
  stockCost?: number
  stockRetailValue?: number
  stockProfitPotential?: number
  reorderLevel: number
  isActive: boolean
  isLowStock?: boolean
  createdAt: string
  updatedAt: string
}

export interface Sale {
  saleId: number
  invoiceNumber: string
  userId: number
  cashierName?: string
  customerId?: number
  saleDate: string
  subTotal: number
  discountAmount: number
  discountPercent: number
  taxAmount: number
  netTotal: number
  paidAmount: number
  changeAmount: number
  paymentStatus: PaymentStatus
  isVoided: boolean
  items?: SaleItem[]
  payments?: Payment[]
}

export interface SaleItem {
  saleItemId: number
  saleId: number
  productId: number
  productName: string
  quantity: number
  unitPrice: number
  unitCost?: number
  lineDiscount: number
  lineTotal: number
}

export interface Payment {
  paymentId: number
  saleId: number
  paymentMethod: PaymentMethod
  amount: number
  paymentDate: string
  referenceNo?: string
}

export interface InventoryTransaction {
  inventoryTransactionId: number
  productId: number
  productName?: string
  transactionType: TransactionType
  quantityChange: number
  oldStock: number
  newStock: number
  userId: number
  userName?: string
  reason?: string
  saleId?: number
  createdAt: string
}

export interface AuditLog {
  auditLogId: number
  userId?: number
  userName?: string
  action: string
  entityName: string
  entityId?: string
  description: string
  deviceName: string
  createdAt: string
}

export interface BackupLog {
  backupId: number
  backupPath: string
  fileSizeBytes: number
  backupDate: string
  createdByUserId?: number
  createdBy?: string
  status: 'Success' | 'Failed'
  errorMessage?: string
  isAutomatic: boolean
  checksumSha256?: string
  metadataPath?: string
  verifiedAt?: string
  lastRestoredAt?: string
}

// ── DTOs / Request-Response types ────────────────────────────────────────────

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  success: boolean
  message: string
  user?: User
}

export interface InitialAdminRequest {
  username: string
  fullName: string
  plainPassword: string
}

export interface CartItem {
  productId: number
  productName: string
  unitPrice: number
  quantity: number
  lineDiscount: number
  availableStock: number
  lineTotal: number
}

export interface CompleteSaleRequest {
  userId: number
  customerId?: number
  customerAccountNumber?: string
  customerName?: string
  customerFatherName?: string
  customerPhone?: string
  customerEmail?: string
  cartItems: CartItem[]
  discountPercent: number
  discountAmount: number
  taxPercent: number
  paidAmount: number
  paymentMethod: PaymentMethod
  paymentReference?: string
  notes?: string
}

export interface SaleResult {
  success: boolean
  message: string
  saleId?: number
  invoiceNumber?: string
  netTotal?: number
  changeAmount?: number
  amountDue?: number
  paymentStatus?: PaymentStatus
  customerId?: number
  customerAccountNumber?: string
}

export interface DebtSummary {
  customerId: number
  customerAccountNumber?: string
  customerName: string
  customerFatherName?: string
  customerPhone?: string
  invoiceCount: number
  totalAmount: number
  paidAmount: number
  amountToBePaid: number
  lastSaleDate: string
}

export interface CreateProductRequest {
  productName: string
  categoryId: number
  brand?: string
  barcode?: string
  purchasePrice: number
  sellingPrice: number
  stockQuantity: number
  reorderLevel: number
}

export interface UpdateProductRequest extends CreateProductRequest {
  productId: number
  isActive: boolean
}

export interface CreateUserRequest {
  username: string
  plainPassword: string
  fullName: string
  roleId: number
}

export interface UpdateUserRequest {
  userId: number
  fullName: string
  roleId: number
  status: AccountStatus
}

export interface StockAdjustmentRequest {
  productId: number
  quantityChange: number
  reason: string
  userId: number
}

export interface ServiceResult {
  success: boolean
  message: string
}

// ── Dashboard / Report types ──────────────────────────────────────────────────

export interface DashboardData {
  todayRevenue: number
  todayNetSales: number
  todayOutstanding: number
  todayTransactions: number
  totalProducts: number
  lowStockCount: number
  recentSales: RecentSale[]
  lowStockItems: LowStockItem[]
}

export interface RecentSale {
  invoiceNumber: string
  cashierName: string
  saleDate: string
  netTotal: number
}

export interface LowStockItem {
  productName: string
  categoryName: string
  stockQuantity: number
  reorderLevel: number
}

export interface DailySalesReport {
  date: string
  transactionCount: number
  totalRevenue: number
  totalDiscount: number
  totalTax: number
  netRevenue: number
  itemsSold: number
  totalCost: number
  grossProfit: number
  profitMargin: number
}

export interface ProductSalesReport {
  productId: number
  productName: string
  categoryName: string
  totalQuantitySold: number
  grossRevenue: number
  totalRevenue: number
  totalDiscount: number
  totalCost: number
  grossProfit: number
  profitMargin: number
}

export interface CashierSalesReport {
  userId: number
  cashierName: string
  transactionCount: number
  totalRevenue: number
  totalDiscount: number
  collectedAmount: number
  outstandingAmount: number
  totalCost: number
  grossProfit: number
}

export interface DetailedSaleReport {
  saleId: number
  invoiceNumber: string
  userId: number
  customerId?: number
  customerName?: string
  customerPhone?: string
  cashierName: string
  saleDate: string
  itemCount: number
  itemsSold: number
  itemSummary?: string
  subTotal: number
  discountAmount: number
  discountPercent: number
  taxAmount: number
  netTotal: number
  paidAmount: number
  changeAmount: number
  amountDue: number
  paymentStatus: PaymentStatus
  paymentMethods: string
  tenderedAmount: number
  collectedAmount: number
  totalCost: number
  grossProfit: number
  isVoided: boolean
}

export interface DiscountReport {
  invoiceNumber: string
  cashierName: string
  saleDate: string
  subTotal: number
  discountPercent: number
  discountAmount: number
  netTotal: number
}

// ── IPC Channel names (type-safe contract) ───────────────────────────────────
export const IPC = {
  AUTH_SESSION_STATUS: 'auth:session-status',
  AUTH_SETUP_STATUS: 'auth:setupStatus',
  AUTH_CREATE_INITIAL_ADMIN: 'auth:createInitialAdmin',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CHANGE_PASSWORD: 'auth:changePassword',

  PRODUCTS_GET_ALL: 'products:getAll',
  PRODUCTS_SEARCH: 'products:search',
  PRODUCTS_GET_BY_ID: 'products:getById',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DEACTIVATE: 'products:deactivate',
  PRODUCTS_ACTIVATE: 'products:activate',
  PRODUCTS_LOW_STOCK: 'products:lowStock',
  CATEGORIES_GET_ALL: 'categories:getAll',

  SALES_COMPLETE: 'sales:complete',
  SALES_GET_TODAY: 'sales:getToday',
  SALES_GET_BY_INVOICE: 'sales:getByInvoice',
  SALES_GET_RANGE: 'sales:getRange',
  SALES_VOID: 'sales:void',

  DEBTS_RECORD_PAYMENT: 'debts:record-payment',
  DEBTS_GET_ALL: 'debts:getAll',

  STOCK_GET_PRODUCTS: 'stock:getProducts',
  STOCK_ADJUST: 'stock:adjust',
  STOCK_HISTORY: 'stock:history',

  REPORTS_DASHBOARD: 'reports:dashboard',
  REPORTS_DAILY: 'reports:daily',
  REPORTS_PRODUCTS: 'reports:products',
  REPORTS_CASHIERS: 'reports:cashiers',
  REPORTS_EXPORT_PDF: 'reports:exportPdf',
  REPORTS_EXPORT_EXCEL: 'reports:exportExcel',
  REPORTS_DISCOUNTS: 'reports:discounts',
  REPORTS_LOW_STOCK: 'reports:lowStock',

  USERS_GET_ALL: 'users:getAll',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_UNLOCK: 'users:unlock',
  ROLES_GET_ALL: 'roles:getAll',

  AUDIT_GET_LOGS: 'audit:getLogs',

  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_RESTORE_FROM_FILE: 'backup:restoreFromFile',
  BACKUP_VERIFY: 'backup:verify',
  BACKUP_HISTORY: 'backup:history',
  PRODUCT_BACKUPS_GET: 'productBackups:getByProduct',
  PRODUCT_BACKUP_READ: 'productBackups:readFile',

  SETTINGS_GET_ALL: 'settings:getAll',
  SETTINGS_SET: 'settings:set',
} as const
