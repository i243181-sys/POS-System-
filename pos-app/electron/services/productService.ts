import { getDb } from '../database/database'
import { auditService } from './auditService'
import { backupService } from './backupService'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'
import type { CreateProductRequest, UpdateProductRequest, ServiceResult } from '../../shared/types'

function cleanText(value: string | undefined) {
  return String(value ?? '').trim()
}

function cleanOptionalText(value: string | undefined) {
  const text = cleanText(value)
  return text.length > 0 ? text : null
}

function toMoney(value: number) {
  return Math.round(Number(value) * 100) / 100
}

function toWholeNumber(value: number) {
  return Math.floor(Number(value))
}

function validateProduct(req: CreateProductRequest) {
  const productName = cleanText(req.productName)
  const brand = cleanOptionalText(req.brand)
  const barcode = cleanOptionalText(req.barcode)
  const categoryId = toWholeNumber(req.categoryId)
  const purchasePrice = toMoney(req.purchasePrice)
  const sellingPrice = toMoney(req.sellingPrice)
  const stockQuantity = toWholeNumber(req.stockQuantity)
  const reorderLevel = toWholeNumber(req.reorderLevel)

  if (!productName) return { error: 'Product name is required.' }
  if (productName.length > 200) return { error: 'Product name must be 200 characters or fewer.' }
  if (brand && brand.length > 100) return { error: 'Brand must be 100 characters or fewer.' }
  if (barcode && barcode.length > 100) return { error: 'Barcode must be 100 characters or fewer.' }
  if (!Number.isInteger(categoryId) || categoryId <= 0) return { error: 'Choose a valid category.' }
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return { error: 'Purchase price cannot be negative.' }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { error: 'Selling price must be greater than 0.' }
  if (purchasePrice > sellingPrice) return { error: 'Selling price should be equal to or higher than purchase price.' }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return { error: 'Stock quantity cannot be negative.' }
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) return { error: 'Reorder level cannot be negative.' }

  return {
    product: {
      productName,
      brand,
      barcode,
      categoryId,
      purchasePrice,
      sellingPrice,
      stockQuantity,
      reorderLevel
    }
  }
}

function createRequiredProductBackup(product: Record<string, unknown>, action: string, userId: number, metadata?: Record<string, unknown>) {
  const result = backupService.insertProductBackup(product, action, userId, metadata)
  if (!result.success) throw new Error(result.message || 'Product backup failed.')
}

export const productService = {
  getAll: () => {
    try {
      const db = getDb()
      const stmt = db.prepare(`
        SELECT p.ProductID as productId,
               p.ProductName as productName,
               p.Barcode as barcode,
               p.CategoryID as categoryId,
               c.CategoryName as categoryName,
               p.Brand as brand,
               p.PurchasePrice as purchasePrice,
               p.SellingPrice as sellingPrice,
               p.StockQuantity as stockQuantity,
               ROUND(p.PurchasePrice * p.StockQuantity, 2) as stockCost,
               ROUND(p.SellingPrice * p.StockQuantity, 2) as stockRetailValue,
               ROUND((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) as stockProfitPotential,
               p.ReorderLevel as reorderLevel,
               p.IsActive = 1 as isActive,
               p.CreatedAt as createdAt,
               p.UpdatedAt as updatedAt,
               (p.StockQuantity <= p.ReorderLevel) as isLowStock
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = 1
        ORDER BY p.ProductName ASC
      `)
      return { success: true, data: stmt.all(), message: '' }
    } catch (error: any) {
      logger.error('Error fetching products', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getAllForStock: () => {
    try {
      const db = getDb()
      const stmt = db.prepare(`
        SELECT p.ProductID as productId,
               p.ProductName as productName,
               p.Barcode as barcode,
               p.CategoryID as categoryId,
               c.CategoryName as categoryName,
               p.Brand as brand,
               p.PurchasePrice as purchasePrice,
               p.SellingPrice as sellingPrice,
               p.StockQuantity as stockQuantity,
               ROUND(p.PurchasePrice * p.StockQuantity, 2) as stockCost,
               ROUND(p.SellingPrice * p.StockQuantity, 2) as stockRetailValue,
               ROUND((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) as stockProfitPotential,
               p.ReorderLevel as reorderLevel,
               p.IsActive = 1 as isActive,
               p.CreatedAt as createdAt,
               p.UpdatedAt as updatedAt,
               (p.StockQuantity <= p.ReorderLevel) as isLowStock
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        ORDER BY p.IsActive DESC, p.ProductName ASC
      `)
      return { success: true, data: stmt.all(), message: '' }
    } catch (error: any) {
      logger.error('Error fetching stock products', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  search: (term: string, limit = 20) => {
    try {
      const db = getDb()
      const safeTerm = String(term ?? '').trim().slice(0, 100)
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20
      const searchTerm = `%${safeTerm}%`
      const stmt = db.prepare(`
        SELECT p.ProductID as productId, p.ProductName as productName,
               p.Barcode as barcode,
               p.Brand as brand,
               c.CategoryName as categoryName,
               p.SellingPrice as sellingPrice,
               p.StockQuantity as stockQuantity
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = 1
          AND (p.ProductName LIKE ? OR p.Brand LIKE ? OR c.CategoryName LIKE ? OR p.Barcode LIKE ?)
        ORDER BY p.ProductName ASC
        LIMIT ?
      `)
      return { success: true, data: stmt.all(searchTerm, searchTerm, searchTerm, searchTerm, safeLimit), message: '' }
    } catch (error: any) {
      logger.error('Error searching products', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getById: (productId: number) => {
    try {
      const db = getDb()
      const product = db.prepare(`
        SELECT p.ProductID as productId,
               p.ProductName as productName,
               p.Barcode as barcode,
               p.CategoryID as categoryId,
               c.CategoryName as categoryName,
               p.Brand as brand,
               p.PurchasePrice as purchasePrice,
               p.SellingPrice as sellingPrice,
               p.StockQuantity as stockQuantity,
               ROUND(p.PurchasePrice * p.StockQuantity, 2) as stockCost,
               ROUND(p.SellingPrice * p.StockQuantity, 2) as stockRetailValue,
               ROUND((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) as stockProfitPotential,
               p.ReorderLevel as reorderLevel,
               p.IsActive = 1 as isActive,
               p.CreatedAt as createdAt,
               p.UpdatedAt as updatedAt
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.ProductID = ?
      `).get(productId)
      return { success: true, data: product, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: null }
    }
  },

  create: (req: CreateProductRequest, userId: number): ServiceResult => {
    try {
      const db = getDb()
      const validated = validateProduct(req)
      if (validated.error || !validated.product) return { success: false, message: validated.error || 'Invalid product.' }
      const product = validated.product

      const transaction = db.transaction(() => {
        const category = db.prepare('SELECT 1 FROM Categories WHERE CategoryID = ? AND IsActive = 1').get(product.categoryId)
        if (!category) throw new Error('Choose an active category.')

        const existing = db.prepare(`
          SELECT ProductID FROM Products
          WHERE IsActive = 1
            AND lower(ProductName) = lower(?)
            AND coalesce(lower(Brand), '') = coalesce(lower(?), '')
        `).get(product.productName, product.brand)
        if (existing) throw new Error('An active product with this name and brand already exists.')

        if (product.barcode) {
          const barcodeExists = db.prepare(`
            SELECT ProductID FROM Products
            WHERE Barcode = ?
          `).get(product.barcode)
          if (barcodeExists) throw new Error('A product with this barcode already exists.')
        }

        const stmt = db.prepare(`
          INSERT INTO Products (ProductName, CategoryID, Brand, Barcode, PurchasePrice, SellingPrice, StockQuantity, ReorderLevel)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const info = stmt.run(
          product.productName,
          product.categoryId,
          product.brand,
          product.barcode,
          product.purchasePrice,
          product.sellingPrice,
          product.stockQuantity,
          product.reorderLevel
        )

        if (product.stockQuantity > 0) {
          db.prepare(`
            INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason)
            VALUES (?, 'Purchase', ?, 0, ?, ?, ?)
          `).run(info.lastInsertRowid, product.stockQuantity, product.stockQuantity, userId, 'Opening stock entered when product was created')
        }
        auditService.log('PRODUCT_CREATED', 'Product', `Created product ${product.productName}`, userId, info.lastInsertRowid.toString())
        const created = db.prepare('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = ?').get(info.lastInsertRowid)
        createRequiredProductBackup(created as any, 'CREATE', userId, { after: created })
      })

      transaction()
      return { success: true, message: 'Product created successfully' }
    } catch (error: any) {
      logger.error('Error creating product', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  update: (req: UpdateProductRequest, userId: number): ServiceResult => {
    try {
      const db = getDb()
      const productId = toWholeNumber(req.productId)
      if (!Number.isInteger(productId) || productId <= 0) return { success: false, message: 'Invalid product.' }

      const validated = validateProduct(req)
      if (validated.error || !validated.product) return { success: false, message: validated.error || 'Invalid product.' }
      const product = validated.product

      const transaction = db.transaction(() => {
        const current = db.prepare('SELECT ProductName, Barcode, CategoryID, Brand, PurchasePrice, SellingPrice, StockQuantity, ReorderLevel, IsActive FROM Products WHERE ProductID = ?').get(productId) as any
        if (!current) throw new Error('Product was not found.')

        const category = db.prepare('SELECT 1 FROM Categories WHERE CategoryID = ? AND IsActive = 1').get(product.categoryId)
        if (!category) throw new Error('Choose an active category.')

        const existing = db.prepare(`
          SELECT ProductID FROM Products
          WHERE ProductID != ?
            AND IsActive = 1
            AND lower(ProductName) = lower(?)
            AND coalesce(lower(Brand), '') = coalesce(lower(?), '')
        `).get(productId, product.productName, product.brand)
        if (existing) throw new Error('Another active product already uses this name and brand.')

        if (product.barcode) {
          const barcodeExists = db.prepare(`
            SELECT ProductID FROM Products
            WHERE ProductID != ? AND Barcode = ?
          `).get(productId, product.barcode)
          if (barcodeExists) throw new Error('Another product already uses this barcode.')
        }

        const stmt = db.prepare(`
          UPDATE Products
          SET ProductName = ?, CategoryID = ?, Brand = ?, Barcode = ?,
              PurchasePrice = ?, SellingPrice = ?, StockQuantity = ?,
              ReorderLevel = ?, IsActive = ?, UpdatedAt = datetime('now')
          WHERE ProductID = ?
        `)

        stmt.run(
          product.productName,
          product.categoryId,
          product.brand,
          product.barcode,
          product.purchasePrice,
          product.sellingPrice,
          product.stockQuantity,
          product.reorderLevel,
          req.isActive ? 1 : 0,
          productId,
        )

        if (current.StockQuantity !== product.stockQuantity) {
          db.prepare(`
            INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason)
            VALUES (?, 'Adjustment', ?, ?, ?, ?, ?)
          `).run(
            productId,
            product.stockQuantity - current.StockQuantity,
            current.StockQuantity,
            product.stockQuantity,
            userId,
            'Stock corrected from product edit'
          )
        }

        const changes: string[] = []
        if (current.ProductName !== product.productName) changes.push(`name: '${current.ProductName}' -> '${product.productName}'`)
        if ((current.Barcode || '') !== (product.barcode || '')) changes.push(`barcode: '${current.Barcode || ''}' -> '${product.barcode || ''}'`)
        if (Number(current.CategoryID) !== product.categoryId) changes.push(`category: ${current.CategoryID} -> ${product.categoryId}`)
        if ((current.Brand || '') !== (product.brand || '')) changes.push(`brand: '${current.Brand || ''}' -> '${product.brand || ''}'`)
        if (Number(current.PurchasePrice) !== product.purchasePrice) changes.push(`purchasePrice: ${current.PurchasePrice} -> ${product.purchasePrice}`)
        if (Number(current.SellingPrice) !== product.sellingPrice) changes.push(`sellingPrice: ${current.SellingPrice} -> ${product.sellingPrice}`)
        if (Number(current.StockQuantity) !== product.stockQuantity) changes.push(`stockQuantity: ${current.StockQuantity} -> ${product.stockQuantity}`)
        if (Number(current.ReorderLevel) !== product.reorderLevel) changes.push(`reorderLevel: ${current.ReorderLevel} -> ${product.reorderLevel}`)
        if (Number(current.IsActive) !== (req.isActive ? 1 : 0)) changes.push(`isActive: ${current.IsActive} -> ${req.isActive ? 1 : 0}`)
        auditService.log('PRODUCT_UPDATED', 'Product', `Updated product ${product.productName}. ${changes.join('; ')}`, userId, productId.toString())
        const updated = db.prepare('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = ?').get(productId)
        createRequiredProductBackup(updated as any, 'UPDATE', userId, { before: current, after: updated })
      })

      transaction()
      return { success: true, message: 'Product updated successfully' }
    } catch (error: any) {
      logger.error('Error updating product', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  deactivate: (productId: number, userId: number): ServiceResult => {
    try {
      const db = getDb()
      const safeProductId = toWholeNumber(productId)
      if (!Number.isInteger(safeProductId) || safeProductId <= 0) return { success: false, message: 'Invalid product.' }

      const transaction = db.transaction(() => {
        const current = db.prepare('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = ?').get(safeProductId) as any
        if (!current) throw new Error('Product was not found.')
        if (!current.IsActive) return 'Product is already inactive.'

        db.prepare("UPDATE Products SET IsActive = 0, UpdatedAt = datetime('now') WHERE ProductID = ?").run(safeProductId)
        auditService.log('PRODUCT_DEACTIVATED', 'Product', `Deactivated product ${current.ProductName} (ProductID ${safeProductId})`, userId, safeProductId.toString())
        const deactivated = db.prepare('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = ?').get(safeProductId)
        createRequiredProductBackup(deactivated as any, 'DEACTIVATE', userId, { before: current, after: deactivated })
        return 'Product deactivated and removed from checkout successfully'
      })

      return { success: true, message: transaction() }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  activate: (productId: number, userId: number): ServiceResult => {
    try {
      const db = getDb()
      const safeProductId = toWholeNumber(productId)
      if (!Number.isInteger(safeProductId) || safeProductId <= 0) return { success: false, message: 'Invalid product.' }

      const transaction = db.transaction(() => {
        const current = db.prepare('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = ?').get(safeProductId) as any
        if (!current) throw new Error('Product was not found.')
        if (current.IsActive) return 'Product is already active in checkout.'
        if (Number(current.SellingPrice) <= 0) throw new Error('Set a valid selling price before activating this product.')
        if (Number(current.StockQuantity) < 0) throw new Error('Product stock is invalid.')

        const duplicate = db.prepare(`
          SELECT ProductID FROM Products
          WHERE ProductID != ?
            AND IsActive = 1
            AND lower(ProductName) = lower(?)
            AND coalesce(lower(Brand), '') = coalesce(lower(?), '')
        `).get(safeProductId, current.ProductName, current.Brand)
        if (duplicate) throw new Error('Another active product already uses this name and brand.')

        db.prepare("UPDATE Products SET IsActive = 1, UpdatedAt = datetime('now') WHERE ProductID = ?").run(safeProductId)
        auditService.log('PRODUCT_ACTIVATED', 'Product', `Activated product ${current.ProductName} (ProductID ${safeProductId})`, userId, safeProductId.toString())
        const activated = db.prepare('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = ?').get(safeProductId)
        createRequiredProductBackup(activated as any, 'ACTIVATE', userId, { before: current, after: activated })
        return 'Product activated and returned to checkout successfully.'
      })

      return { success: true, message: transaction() }
    } catch (error: any) {
      logger.error('Error activating product', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  getLowStock: () => {
    try {
      const db = getDb()
      const data = db.prepare(`
        SELECT p.ProductID as productId,
               p.ProductName as productName,
               p.Barcode as barcode,
               p.CategoryID as categoryId,
               c.CategoryName as categoryName,
               p.Brand as brand,
               p.PurchasePrice as purchasePrice,
               p.SellingPrice as sellingPrice,
               p.StockQuantity as stockQuantity,
               ROUND(p.PurchasePrice * p.StockQuantity, 2) as stockCost,
               ROUND(p.SellingPrice * p.StockQuantity, 2) as stockRetailValue,
               ROUND((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) as stockProfitPotential,
               p.ReorderLevel as reorderLevel,
               p.IsActive = 1 as isActive,
               p.CreatedAt as createdAt,
               p.UpdatedAt as updatedAt
        FROM Products p 
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = 1 AND p.StockQuantity <= p.ReorderLevel 
        ORDER BY p.StockQuantity ASC
      `).all()
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getAllCategories: () => {
    try {
      const db = getDb()
      const data = db.prepare(`
        SELECT CategoryID as categoryId,
               CategoryName as categoryName,
               Description as description,
               IsActive = 1 as isActive
        FROM Categories
        WHERE IsActive = 1
        ORDER BY CategoryName
      `).all()
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
