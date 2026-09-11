import type {
  CompleteSaleRequest,
  CreateProductRequest,
  CreateUserRequest,
  InitialAdminRequest,
  LoginRequest,
  LoginResponse,
  StockAdjustmentRequest,
  UpdateProductRequest,
  UpdateUserRequest
} from '../../shared/types'

export {}

declare global {
  interface Window {
    api?: {
      getSessionStatus?: () => Promise<any>
      getSetupStatus?: () => Promise<{ success: boolean; message: string; data: { setupRequired: boolean } }>
      createInitialAdmin?: (req: InitialAdminRequest) => Promise<any>
      login?: (req: LoginRequest) => Promise<LoginResponse>
      logout?: () => Promise<{ success: boolean }>
      changePassword?: (userId: number, currentPlain: string, newPlain: string) => Promise<any>

      getProducts?: () => Promise<any>
      searchProducts?: (term: string) => Promise<any>
      getProductById?: (id: number) => Promise<any>
      createProduct?: (req: CreateProductRequest, userId: number) => Promise<any>
      updateProduct?: (req: UpdateProductRequest, userId: number) => Promise<any>
      deactivateProduct?: (productId: number, userId: number) => Promise<any>
      activateProduct?: (productId: number, userId: number) => Promise<any>
      getLowStockProducts?: () => Promise<any>
      getCategories?: () => Promise<any>

      completeSale?: (req: CompleteSaleRequest) => Promise<any>
      getTodaySales?: () => Promise<any>
      getSaleByInvoice?: (invoice: string) => Promise<any>
      getSalesRange?: (start: string, end: string) => Promise<any>
      voidSale?: (saleId: number, userId: number, reason: string) => Promise<any>
      recordDebtPayment?: (customerId: number, amount: number) => Promise<any>
      getCustomerDebts?: () => Promise<any>

      getStockProducts?: () => Promise<any>
      adjustStock?: (req: StockAdjustmentRequest) => Promise<any>
      getStockHistory?: (productId: number) => Promise<any>

      getDashboard?: () => Promise<any>
      getDailyReport?: (start: string, end: string) => Promise<any>
      getProductReport?: (start: string, end: string) => Promise<any>
      getCashierReport?: (start: string, end: string) => Promise<any>
      exportSalesPdf?: (start: string, end: string) => Promise<any>
      exportDataExcel?: () => Promise<any>

      getUsers?: () => Promise<any>
      createUser?: (req: CreateUserRequest, userId: number) => Promise<any>
      updateUser?: (req: UpdateUserRequest, userId: number) => Promise<any>
      unlockUser?: (targetId: number, adminId: number) => Promise<any>
      getRoles?: () => Promise<any>

      getAuditLogs?: (limit?: number) => Promise<any>
      getSettings?: () => Promise<any>
      updateSettings?: (req: Record<string, string>, userId: number) => Promise<any>
      createBackup?: (userId: number) => Promise<any>
      restoreBackup?: (backupPath: string, userId: number) => Promise<any>
      restoreBackupFromFile?: (userId: number) => Promise<any>
      verifyBackup?: (backupPath: string) => Promise<any>
      getBackupHistory?: () => Promise<any>
      getProductBackups?: (productId: number) => Promise<any>
      readProductBackupFile?: (filePath: string) => Promise<any>
    }
  }
}
