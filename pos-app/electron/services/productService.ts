import { all, get, withTx, type Db } from '../database/database'
import { auditService } from './auditService'
import { backupService } from './backupService'
import { logger } from '../utils/logger'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
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
  return Number(value)
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
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0 || purchasePrice > 1e9) return { error: 'Purchase price cannot be negative.' }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0 || sellingPrice > 1e9) return { error: 'Selling price must be greater than 0.' }
  if (purchasePrice > sellingPrice) return { error: 'Selling price should be equal to or higher than purchase price.' }
  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100000000) return { error: 'Stock quantity cannot be negative.' }
  if (!Number.isSafeInteger(reorderLevel) || reorderLevel < 0 || reorderLevel > 100000000) return { error: 'Reorder level cannot be negative.' }

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

async function createRequiredProductBackup(product: Record<string, unknown>, action: string, userId: number, metadata?: Record<string, unknown>, client?: Db) {
  const result = await backupService.insertProductBackup(product, action, userId, metadata, client)
  if (!result.success) throw new PublicError(result.message || 'Product backup failed.')
}

export const productService = {
  getAll: async () => {
    try {
      const data = await all(`
         SELECT p.ProductID AS "productId",
           p.ProductName AS "productName",
           p.Barcode AS "barcode",
           p.CategoryID AS "categoryId",
           c.CategoryName AS "categoryName",
           p.Brand AS "brand",
           p.PurchasePrice AS "purchasePrice",
           p.SellingPrice AS "sellingPrice",
           p.StockQuantity AS "stockQuantity",
           round(p.PurchasePrice * p.StockQuantity, 2) AS "stockCost",
           round(p.SellingPrice * p.StockQuantity, 2) AS "stockRetailValue",
           round((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) AS "stockProfitPotential",
           p.ReorderLevel AS "reorderLevel",
           p.IsActive AS "isActive",
           p.CreatedAt AS "createdAt",
           p.UpdatedAt AS "updatedAt",
           (p.StockQuantity <= p.ReorderLevel) AS "isLowStock"
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = true
        ORDER BY p.ProductName ASC
      `)
      return { success: true, data, message: '' }
    } catch (error: any) {
      logger.error('Error fetching products', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getAllForStock: async () => {
    try {
      const data = await all(`
         SELECT p.ProductID AS "productId",
           p.ProductName AS "productName",
           p.Barcode AS "barcode",
           p.CategoryID AS "categoryId",
           c.CategoryName AS "categoryName",
           p.Brand AS "brand",
           p.PurchasePrice AS "purchasePrice",
           p.SellingPrice AS "sellingPrice",
           p.StockQuantity AS "stockQuantity",
           round(p.PurchasePrice * p.StockQuantity, 2) AS "stockCost",
           round(p.SellingPrice * p.StockQuantity, 2) AS "stockRetailValue",
           round((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) AS "stockProfitPotential",
           p.ReorderLevel AS "reorderLevel",
           p.IsActive AS "isActive",
           p.CreatedAt AS "createdAt",
           p.UpdatedAt AS "updatedAt",
           (p.StockQuantity <= p.ReorderLevel) AS "isLowStock"
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        ORDER BY p.IsActive DESC, p.ProductName ASC
      `)
      return { success: true, data, message: '' }
    } catch (error: any) {
      logger.error('Error fetching stock products', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  search: async (term: string, limit = 20) => {
    try {
      const safeTerm = String(term ?? '').trim().slice(0, 100)
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20
      const searchTerm = `%${safeTerm}%`
      const data = await all(`
         SELECT p.ProductID AS "productId", p.ProductName AS "productName",
           p.Barcode AS "barcode",
           p.Brand AS "brand",
           c.CategoryName AS "categoryName",
           p.SellingPrice AS "sellingPrice",
           p.StockQuantity AS "stockQuantity"
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = true
          AND (p.ProductName ILIKE $1 OR p.Brand ILIKE $1 OR c.CategoryName ILIKE $1 OR p.Barcode ILIKE $1)
        ORDER BY p.ProductName ASC
        LIMIT $2
      `, [searchTerm, safeLimit])
      return { success: true, data, message: '' }
    } catch (error: any) {
      logger.error('Error searching products', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getById: async (productId: number) => {
    try {
      const product = await get(`
         SELECT p.ProductID AS "productId",
           p.ProductName AS "productName",
           p.Barcode AS "barcode",
           p.CategoryID AS "categoryId",
           c.CategoryName AS "categoryName",
           p.Brand AS "brand",
           p.PurchasePrice AS "purchasePrice",
           p.SellingPrice AS "sellingPrice",
           p.StockQuantity AS "stockQuantity",
           round(p.PurchasePrice * p.StockQuantity, 2) AS "stockCost",
           round(p.SellingPrice * p.StockQuantity, 2) AS "stockRetailValue",
           round((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) AS "stockProfitPotential",
           p.ReorderLevel AS "reorderLevel",
           p.IsActive AS "isActive",
           p.CreatedAt AS "createdAt",
           p.UpdatedAt AS "updatedAt"
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.ProductID = $1
      `, [productId])
      return { success: true, data: product, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: null }
    }
  },

  create: async (req: CreateProductRequest, userId: number): Promise<ServiceResult> => {
    try {
      const validated = validateProduct(req)
      if (validated.error || !validated.product) return { success: false, message: validated.error || 'Invalid product.' }
      const product = validated.product

      await withTx(async (tx: Db) => {
        const category = await tx.get('SELECT 1 FROM Categories WHERE CategoryID = $1 AND IsActive = true', [product.categoryId])
        if (!category) throw new PublicError('Choose an active category.')

        const existing = await tx.get(`
          SELECT ProductID FROM Products
          WHERE IsActive = true
            AND lower(ProductName) = lower($1)
            AND coalesce(lower(Brand), '') = coalesce(lower($2), '')
        `, [product.productName, product.brand])
        if (existing) throw new PublicError('An active product with this name and brand already exists.')

        if (product.barcode) {
          const barcodeExists = await tx.get('SELECT ProductID FROM Products WHERE Barcode = $1', [product.barcode])
          if (barcodeExists) throw new PublicError('A product with this barcode already exists.')
        }

        const info = await tx.run(
          `INSERT INTO Products (ProductName, CategoryID, Brand, Barcode, PurchasePrice, SellingPrice, StockQuantity, ReorderLevel)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ProductID`,
          [product.productName, product.categoryId, product.brand, product.barcode, product.purchasePrice, product.sellingPrice, product.stockQuantity, product.reorderLevel]
        )
        const productId = info.rows[0].ProductID

        if (product.stockQuantity > 0) {
          await tx.run(
            `INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason)
             VALUES ($1, 'Purchase', $2, 0, $2, $3, 'Opening stock entered when product was created')`,
            [productId, product.stockQuantity, userId]
          )
        }
        await auditService.log('PRODUCT_CREATED', 'Product', `Created product ${product.productName}`, userId, String(productId), tx)
        const created = await tx.get('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = $1', [productId])
        await createRequiredProductBackup(created as any, 'CREATE', userId, { after: created }, tx)
      })

      return { success: true, message: 'Product created successfully' }
    } catch (error: any) {
      logger.error('Error creating product', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  update: async (req: UpdateProductRequest, userId: number): Promise<ServiceResult> => {
    try {
      const productId = toWholeNumber(req.productId)
      if (!Number.isInteger(productId) || productId <= 0) return { success: false, message: 'Invalid product.' }

      const validated = validateProduct(req)
      if (validated.error || !validated.product) return { success: false, message: validated.error || 'Invalid product.' }
      const product = validated.product

      await withTx(async (tx: Db) => {
        const current = await tx.get('SELECT ProductName, Barcode, CategoryID, Brand, PurchasePrice, SellingPrice, StockQuantity, ReorderLevel, IsActive FROM Products WHERE ProductID = $1', [productId]) as any
        if (!current) throw new PublicError('Product was not found.')

        const category = await tx.get('SELECT 1 FROM Categories WHERE CategoryID = $1 AND IsActive = true', [product.categoryId])
        if (!category) throw new PublicError('Choose an active category.')

        const existing = await tx.get(`
          SELECT ProductID FROM Products
          WHERE ProductID != $1
            AND IsActive = true
            AND lower(ProductName) = lower($2)
            AND coalesce(lower(Brand), '') = coalesce(lower($3), '')
        `, [productId, product.productName, product.brand])
        if (existing) throw new PublicError('Another active product already uses this name and brand.')

        if (product.barcode) {
          const barcodeExists = await tx.get('SELECT ProductID FROM Products WHERE ProductID != $1 AND Barcode = $2', [productId, product.barcode])
          if (barcodeExists) throw new PublicError('Another product already uses this barcode.')
        }

        await tx.run(
          `UPDATE Products
           SET ProductName = $1, CategoryID = $2, Brand = $3, Barcode = $4,
               PurchasePrice = $5, SellingPrice = $6, StockQuantity = $7,
               ReorderLevel = $8, IsActive = $9, UpdatedAt = now()
           WHERE ProductID = $10`,
          [
            product.productName,
            product.categoryId,
            product.brand,
            product.barcode,
            product.purchasePrice,
            product.sellingPrice,
            product.stockQuantity,
            product.reorderLevel,
            Boolean(req.isActive),
            productId
          ]
        )

        if (Number(current.StockQuantity) !== product.stockQuantity) {
          await tx.run(
            `INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason)
             VALUES ($1, 'Adjustment', $2, $3, $4, $5, 'Stock corrected from product edit')`,
            [
              productId,
              product.stockQuantity - Number(current.StockQuantity),
              Number(current.StockQuantity),
              product.stockQuantity,
              userId
            ]
          )
        }

        const changes: string[] = []
        if (current.ProductName !== product.productName) changes.push(`productName: ${current.ProductName} -> ${product.productName}`)
        if ((current.Barcode || null) !== (product.barcode || null)) changes.push(`barcode: ${current.Barcode || ''} -> ${product.barcode || ''}`)
        if (Number(current.CategoryID) !== product.categoryId) changes.push(`categoryId: ${current.CategoryID} -> ${product.categoryId}`)
        if ((current.Brand || null) !== (product.brand || null)) changes.push(`brand: ${current.Brand || ''} -> ${product.brand || ''}`)
        if (Number(current.PurchasePrice) !== product.purchasePrice) changes.push(`purchasePrice: ${current.PurchasePrice} -> ${product.purchasePrice}`)
        if (Number(current.SellingPrice) !== product.sellingPrice) changes.push(`sellingPrice: ${current.SellingPrice} -> ${product.sellingPrice}`)
        if (Number(current.StockQuantity) !== product.stockQuantity) changes.push(`stockQuantity: ${current.StockQuantity} -> ${product.stockQuantity}`)
        if (Number(current.ReorderLevel) !== product.reorderLevel) changes.push(`reorderLevel: ${current.ReorderLevel} -> ${product.reorderLevel}`)
        if (Boolean(current.IsActive) !== Boolean(req.isActive)) changes.push(`isActive: ${current.IsActive} -> ${req.isActive}`)
        await auditService.log('PRODUCT_UPDATED', 'Product', `Updated product ${product.productName}. ${changes.join('; ')}`, userId, productId.toString(), tx)
        const updated = await tx.get('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = $1', [productId])
        await createRequiredProductBackup(updated as any, 'UPDATE', userId, { before: current, after: updated }, tx)
      })

      return { success: true, message: 'Product updated successfully' }
    } catch (error: any) {
      logger.error('Error updating product', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  deactivate: async (productId: number, userId: number): Promise<ServiceResult> => {
    try {
      const safeProductId = toWholeNumber(productId)
      if (!Number.isInteger(safeProductId) || safeProductId <= 0) return { success: false, message: 'Invalid product.' }

      const message = await withTx(async (tx: Db) => {
        const current = await tx.get('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = $1', [safeProductId]) as any
        if (!current) throw new PublicError('Product was not found.')
        if (!current.IsActive) return 'Product is already inactive.'

        await tx.run('UPDATE Products SET IsActive = false, UpdatedAt = now() WHERE ProductID = $1', [safeProductId])
        await auditService.log('PRODUCT_DEACTIVATED', 'Product', `Deactivated product ${current.ProductName} (ProductID ${safeProductId})`, userId, safeProductId.toString(), tx)
        const deactivated = await tx.get('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = $1', [safeProductId])
        await createRequiredProductBackup(deactivated as any, 'DEACTIVATE', userId, { before: current, after: deactivated }, tx)
        return 'Product deactivated and removed from checkout successfully'
      })

      return { success: true, message }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  activate: async (productId: number, userId: number): Promise<ServiceResult> => {
    try {
      const safeProductId = toWholeNumber(productId)
      if (!Number.isInteger(safeProductId) || safeProductId <= 0) return { success: false, message: 'Invalid product.' }

      const message = await withTx(async (tx: Db) => {
        const current = await tx.get('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = $1', [safeProductId]) as any
        if (!current) throw new PublicError('Product was not found.')
        if (current.IsActive) return 'Product is already active in checkout.'
        if (Number(current.SellingPrice) <= 0) throw new PublicError('Set a valid selling price before activating this product.')
        if (Number(current.StockQuantity) < 0) throw new PublicError('Product stock is invalid.')

        const duplicate = await tx.get(`
          SELECT ProductID FROM Products
          WHERE ProductID != $1
            AND IsActive = true
            AND lower(ProductName) = lower($2)
            AND coalesce(lower(Brand), '') = coalesce(lower($3), '')
        `, [safeProductId, current.ProductName, current.Brand])
        if (duplicate) throw new PublicError('Another active product already uses this name and brand.')

        await tx.run('UPDATE Products SET IsActive = true, UpdatedAt = now() WHERE ProductID = $1', [safeProductId])
        await auditService.log('PRODUCT_ACTIVATED', 'Product', `Activated product ${current.ProductName} (ProductID ${safeProductId})`, userId, safeProductId.toString(), tx)
        const activated = await tx.get('SELECT ProductID as productId, ProductName, Barcode, CategoryID as categoryId, Brand, PurchasePrice as purchasePrice, SellingPrice as sellingPrice, StockQuantity as stockQuantity, ReorderLevel as reorderLevel, IsActive, CreatedAt, UpdatedAt FROM Products WHERE ProductID = $1', [safeProductId])
        await createRequiredProductBackup(activated as any, 'ACTIVATE', userId, { before: current, after: activated }, tx)
        return 'Product activated and returned to checkout successfully.'
      })

      return { success: true, message }
    } catch (error: any) {
      logger.error('Error activating product', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  getLowStock: async () => {
    try {
      const data = await all(`
        SELECT p.ProductID as productId,
               p.ProductName as productName,
               p.Barcode as barcode,
               p.CategoryID as categoryId,
               c.CategoryName as categoryName,
               p.Brand as brand,
               p.PurchasePrice as purchasePrice,
               p.SellingPrice as sellingPrice,
               p.StockQuantity as stockQuantity,
               round(p.PurchasePrice * p.StockQuantity, 2) as stockCost,
               round(p.SellingPrice * p.StockQuantity, 2) as stockRetailValue,
               round((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) as stockProfitPotential,
               p.ReorderLevel as reorderLevel,
               p.IsActive as isActive,
               p.CreatedAt as createdAt,
               p.UpdatedAt as updatedAt
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = true AND p.StockQuantity <= p.ReorderLevel
        ORDER BY p.StockQuantity ASC
      `)
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getAllCategories: async () => {
    try {
      const data = await all(`
         SELECT CategoryID AS "categoryId",
           CategoryName AS "categoryName",
           Description AS "description",
           IsActive AS "isActive"
        FROM Categories
        WHERE IsActive = true
        ORDER BY CategoryName
      `)
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
