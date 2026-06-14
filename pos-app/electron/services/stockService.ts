import { getDb } from '../database/database'
import { auditService } from './auditService'
import { backupService } from './backupService'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'
import type { StockAdjustmentRequest, ServiceResult } from '../../shared/types'

export const stockService = {
  adjustStock: (req: StockAdjustmentRequest): ServiceResult => {
    const db = getDb()

    const transaction = db.transaction((req: StockAdjustmentRequest) => {
      if (!Number.isInteger(req.productId) || req.productId <= 0) throw new Error('Choose a valid product.')
      if (!Number.isInteger(req.quantityChange) || req.quantityChange === 0 || Math.abs(req.quantityChange) > 100000) {
        throw new Error('Enter a valid non-zero stock adjustment.')
      }
      const reason = String(req.reason ?? '').trim()
      if (reason.length < 3 || reason.length > 500) throw new Error('Reason must be between 3 and 500 characters.')

      const prod = db.prepare('SELECT StockQuantity, ProductName FROM Products WHERE ProductID = ? AND IsActive = 1').get(req.productId) as any
      if (!prod) throw new Error('Choose an active product.')

      const newStock = prod.StockQuantity + req.quantityChange
      if (newStock < 0) {
        throw new Error(`Adjustment would result in negative stock. Current: ${prod.StockQuantity}`)
      }

      db.prepare("UPDATE Products SET StockQuantity = ?, UpdatedAt = datetime('now') WHERE ProductID = ?").run(newStock, req.productId)
      
      db.prepare(`
        INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason)
        VALUES (?, 'Adjustment', ?, ?, ?, ?, ?)
      `).run(req.productId, req.quantityChange, prod.StockQuantity, newStock, req.userId, reason)

      const updatedProduct = db.prepare('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = ?').get(req.productId)
      const backupResult = backupService.insertProductBackup(updatedProduct as any, 'ADJUSTMENT', req.userId, { before: prod, after: updatedProduct })
      if (!backupResult.success) throw new Error(backupResult.message || 'Product backup failed.')

      auditService.log('STOCK_ADJUSTED', 'Product', `Stock adjusted for ${prod.ProductName} by ${req.quantityChange}. Reason: ${reason}`, req.userId, req.productId.toString())
    })

    try {
      transaction(req)
      return { success: true, message: 'Stock adjusted successfully' }
    } catch (error: any) {
      logger.error('Stock adjustment failed', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  getHistory: (productId: number) => {
    try {
      const db = getDb()
      const stmt = db.prepare(`
        SELECT t.*, u.Username as userName, p.ProductName as productName
        FROM InventoryTransactions t
        JOIN Users u ON t.UserID = u.UserID
        JOIN Products p ON t.ProductID = p.ProductID
        WHERE t.ProductID = ?
        ORDER BY t.CreatedAt DESC
        LIMIT 100
      `)
      return { success: true, data: stmt.all(productId), message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
