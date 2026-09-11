import { all, withTx, type Db } from '../database/database'
import { auditService } from './auditService'
import { backupService } from './backupService'
import { logger } from '../utils/logger'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
import type { StockAdjustmentRequest, ServiceResult } from '../../shared/types'

export const stockService = {
  adjustStock: async (req: StockAdjustmentRequest): Promise<ServiceResult> => {
    try {
      await withTx(async (tx: Db) => {
        if (!Number.isInteger(req.productId) || req.productId <= 0) throw new PublicError('Choose a valid product.')
        if (!Number.isInteger(req.quantityChange) || req.quantityChange === 0 || Math.abs(req.quantityChange) > 100000) {
          throw new PublicError('Enter a valid non-zero stock adjustment.')
        }
        const reason = String(req.reason ?? '').trim()
        if (reason.length < 3 || reason.length > 500) throw new PublicError('Reason must be between 3 and 500 characters.')

        const prod = await tx.get('SELECT StockQuantity, ProductName FROM Products WHERE ProductID = $1 AND IsActive = true', [req.productId]) as any
        if (!prod) throw new PublicError('Choose an active product.')

        const newStock = prod.StockQuantity + req.quantityChange
        if (newStock < 0) {
          throw new PublicError(`Adjustment would result in negative stock. Current: ${prod.StockQuantity}`)
        }

        await tx.run('UPDATE Products SET StockQuantity = $1, UpdatedAt = now() WHERE ProductID = $2', [newStock, req.productId])

        await tx.run(
          `INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason)
           VALUES ($1, 'Adjustment', $2, $3, $4, $5, $6)`,
          [req.productId, req.quantityChange, prod.StockQuantity, newStock, req.userId, reason]
        )

        const updatedProduct = await tx.get(
          'SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = $1',
          [req.productId]
        )
        const backupResult = await backupService.insertProductBackup(updatedProduct as any, 'ADJUSTMENT', req.userId, { before: prod, after: updatedProduct }, tx)
        if (!backupResult.success) throw new PublicError(backupResult.message || 'Product backup failed.')

        await auditService.log('STOCK_ADJUSTED', 'Product', `Stock adjusted for ${prod.ProductName} by ${req.quantityChange}. Reason: ${reason}`, req.userId, req.productId.toString(), tx)
      })
      return { success: true, message: 'Stock adjusted successfully' }
    } catch (error: any) {
      logger.error('Stock adjustment failed', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  getHistory: async (productId: number) => {
    try {
      const data = await all(`
        SELECT t.*, u.Username as userName, p.ProductName as productName
        FROM InventoryTransactions t
        JOIN Users u ON t.UserID = u.UserID
        JOIN Products p ON t.ProductID = p.ProductID
        WHERE t.ProductID = $1
        ORDER BY t.CreatedAt DESC
        LIMIT 100
      `, [productId])
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
