import { getDb } from '../database/database'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'
import type { CompleteSaleRequest, PaymentStatus, SaleResult, ServiceResult } from '../../shared/types'

function roundMoney(value: number) {
  return Math.round(Number(value) * 100) / 100
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function settingNumber(db: ReturnType<typeof getDb>, key: string, fallback: number) {
  const row = db.prepare('SELECT SettingValue FROM Settings WHERE SettingKey = ?').get(key) as any
  const value = Number(row?.SettingValue ?? fallback)
  return Number.isFinite(value) ? value : fallback
}

function normalizeMobile(value?: string) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  const cleaned = trimmed.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\+/g, '')}`
  return cleaned.replace(/\+/g, '')
}

function isValidMobile(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

function normalizeAccountNumber(value?: string) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 30)
}

function accountNumberForCustomer(customerId: number) {
  return `CUS-${customerId.toString().padStart(6, '0')}`
}

export const saleService = {
  completeSale: (req: CompleteSaleRequest): SaleResult => {
    const db = getDb()
    
    const transaction = db.transaction((req: CompleteSaleRequest) => {
      if (!Number.isInteger(req.userId) || req.userId <= 0) {
        throw new Error('A valid cashier is required.')
      }

      const cashier = db.prepare(`
        SELECT u.UserID, r.RoleName
        FROM Users u
        JOIN Roles r ON u.RoleID = r.RoleID
        WHERE u.UserID = ? AND u.Status = 'Active' AND r.RoleName IN ('Admin', 'Cashier')
      `).get(req.userId) as any
      if (!cashier) throw new Error('Cashier account is not active or is not allowed to make sales.')

      if (!Array.isArray(req.cartItems) || req.cartItems.length === 0) {
        throw new Error('Add at least one product before completing a sale.')
      }

      const discountPercent = Number(req.discountPercent ?? 0)
      const taxPercent = Number(req.taxPercent ?? 0)
      const discountAmount = Number(req.discountAmount ?? 0)
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        throw new Error('Discount percent must be between 0 and 100.')
      }
      if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
        throw new Error('Tax percent must be between 0 and 100.')
      }
      if (!Number.isFinite(discountAmount) || discountAmount < 0) {
        throw new Error('Discount amount cannot be negative.')
      }

      const getProductStmt = db.prepare(`
        SELECT StockQuantity, ProductName, SellingPrice, PurchasePrice
        FROM Products
        WHERE ProductID = ? AND IsActive = 1
      `)
      const cartRows = req.cartItems.map((item) => {
        if (!Number.isInteger(item.productId) || item.productId <= 0) throw new Error('Invalid product in cart.')
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error(`Invalid quantity for ${item.productName}.`)
        if (!Number.isFinite(item.lineDiscount) || item.lineDiscount < 0) throw new Error(`Invalid line discount for ${item.productName}.`)

        const prod = getProductStmt.get(item.productId) as any
        if (!prod) throw new Error(`Product ${item.productName} is inactive, deleted, or unavailable.`)
        if (prod.StockQuantity < item.quantity) {
          throw new Error(`Insufficient stock for ${prod.ProductName}. Available: ${prod.StockQuantity}`)
        }

        const unitPrice = roundMoney(Number(prod.SellingPrice))
        const unitCost = roundMoney(Number(prod.PurchasePrice || 0))
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error(`Invalid price for ${prod.ProductName}.`)
        if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error(`Invalid purchase cost for ${prod.ProductName}.`)
        const lineGross = roundMoney(unitPrice * item.quantity)
        if (item.lineDiscount > lineGross) throw new Error(`Line discount is greater than line total for ${item.productName}.`)
        return { item, prod, unitPrice, unitCost, lineTotal: roundMoney(lineGross - item.lineDiscount) }
      })
      const subTotal = roundMoney(cartRows.reduce((sum, row) => sum + roundMoney(row.unitPrice * row.item.quantity), 0))
      const requestedDiscount = discountAmount > 0 ? discountAmount : (subTotal * discountPercent / 100)
      const calculatedDiscount = roundMoney(Math.min(requestedDiscount, subTotal))
      const effectiveDiscountPercent = subTotal > 0 ? roundMoney((calculatedDiscount / subTotal) * 100) : 0
      const maxDiscount = cashier.RoleName === 'Admin'
        ? settingNumber(db, 'AdminMaxDiscountPercent', 100)
        : settingNumber(db, 'CashierMaxDiscountPercent', 5)
      if (effectiveDiscountPercent > maxDiscount) {
        throw new Error(`Applied discount exceeds the ${maxDiscount}% limit for this role.`)
      }
      const taxableAmount = roundMoney(subTotal - calculatedDiscount)
      const calculatedTax = roundMoney(taxableAmount * (taxPercent / 100))
      const netTotal = roundMoney(taxableAmount + calculatedTax)
      const paidAmount = roundMoney(req.paidAmount)
      const amountDue = roundMoney(Math.max(0, netTotal - paidAmount))
      const changeAmount = roundMoney(Math.max(0, paidAmount - netTotal))
      const collectedAmount = roundMoney(Math.max(0, paidAmount - changeAmount))
      const paymentStatus: PaymentStatus = amountDue > 0 ? 'Pending' : 'Completed'

      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        throw new Error('Paid amount cannot be negative.')
      }

      const invoicePrefixSetting = db.prepare("SELECT SettingValue FROM Settings WHERE SettingKey = 'InvoicePrefix'").get() as any
      const invoicePrefix = String(invoicePrefixSetting?.SettingValue || 'POS').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || 'POS'
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const prefix = `${invoicePrefix}-${datePart}-`
      const seqRow = db.prepare(`SELECT COUNT(*) as cnt FROM Sales WHERE InvoiceNumber LIKE ?`).get(`${prefix}%`) as any
      const seq = (seqRow.cnt + 1).toString().padStart(6, '0')
      const invoiceNumber = `${prefix}${seq}`
      const customerName = req.customerName?.trim()
      const customerFatherName = req.customerFatherName?.trim()
      const customerPhone = normalizeMobile(req.customerPhone)
      const customerEmail = req.customerEmail?.trim()
      const requestedAccountNumber = amountDue > 0 ? normalizeAccountNumber(req.customerAccountNumber) : ''
      let customerId = amountDue > 0 ? req.customerId || null : null
      let customerAccountNumber: string | undefined

      if (customerName && customerName.length > 100) throw new Error('Customer name must be 100 characters or fewer.')
      if (customerFatherName && customerFatherName.length > 100) throw new Error('Father name must be 100 characters or fewer.')
      if (customerPhone && customerPhone.length > 30) throw new Error('Customer phone must be 30 characters or fewer.')
      if (customerEmail && (customerEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) {
        throw new Error('Customer email is not valid.')
      }
      if (amountDue > 0) {
        if (!customerName) throw new Error('Customer name is required to open or use an account.')
        if (!customerFatherName) throw new Error('Father name is required to open or use an account.')
        if (!customerPhone || !isValidMobile(customerPhone)) throw new Error('A valid mobile number is required to open or use an account.')
      }
      if (String(req.paymentMethod) !== 'Cash') {
        throw new Error('Only cash payments are accepted at checkout.')
      }

      if (amountDue > 0 && customerId) {
        const customer = db.prepare('SELECT CustomerID, AccountNumber FROM Customers WHERE CustomerID = ? AND IsActive = 1').get(customerId) as any
        if (!customer) throw new Error('Selected customer is inactive or does not exist.')
        customerAccountNumber = customer.AccountNumber || accountNumberForCustomer(customerId)
        if (!customer.AccountNumber) {
          db.prepare('UPDATE Customers SET AccountNumber = ?, UpdatedAt = datetime(\'now\') WHERE CustomerID = ?').run(customerAccountNumber, customerId)
        }
      }

      if (amountDue > 0 && !customerId && (requestedAccountNumber || customerPhone)) {
        let existing: any = null
        if (requestedAccountNumber) {
          existing = db.prepare(`
            SELECT CustomerID, AccountNumber, Phone FROM Customers
            WHERE AccountNumber = ? AND IsActive = 1
            LIMIT 1
          `).get(requestedAccountNumber) as any
          if (existing?.Phone && customerPhone && normalizeMobile(existing.Phone) !== customerPhone) {
            throw new Error('Account ID and mobile number do not match the same customer.')
          }
        }

        if (!existing && customerPhone) {
          existing = db.prepare(`
            SELECT CustomerID, AccountNumber, Phone FROM Customers
            WHERE Phone = ? AND IsActive = 1
            ORDER BY CustomerID DESC
            LIMIT 1
          `).get(customerPhone) as any
        }

        if (existing) {
          customerId = Number(existing.CustomerID)
          customerAccountNumber = existing.AccountNumber || accountNumberForCustomer(customerId)
          db.prepare(`
            UPDATE Customers
            SET FullName = COALESCE(?, FullName),
                FatherName = COALESCE(?, FatherName),
                Phone = COALESCE(?, Phone),
                Email = COALESCE(?, Email),
                AccountNumber = CASE
                  WHEN AccountNumber IS NULL OR trim(AccountNumber) = '' THEN ?
                  ELSE AccountNumber
                END,
                UpdatedAt = datetime('now')
            WHERE CustomerID = ?
          `).run(customerName || null, customerFatherName || null, customerPhone || null, customerEmail || null, customerAccountNumber, customerId)
        }
      }

      if (!customerId && amountDue > 0) {
        const customerInfo = db.prepare(`
          INSERT INTO Customers (FullName, FatherName, Phone, Email, UpdatedAt)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(customerName, customerFatherName, customerPhone, customerEmail || null)
        customerId = Number(customerInfo.lastInsertRowid)
        customerAccountNumber = accountNumberForCustomer(customerId)
        db.prepare(`
          UPDATE Customers
          SET AccountNumber = ?
          WHERE CustomerID = ?
        `).run(customerAccountNumber, customerId)
      }

      const insertSaleStmt = db.prepare(`
        INSERT INTO Sales (InvoiceNumber, UserID, CustomerID, SubTotal, DiscountAmount, DiscountPercent, TaxAmount, NetTotal, PaidAmount, ChangeAmount, PaymentStatus, Notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const saleInfo = insertSaleStmt.run(
        invoiceNumber, req.userId, customerId, subTotal, calculatedDiscount, 
        discountPercent, calculatedTax, netTotal, paidAmount, changeAmount, paymentStatus, req.notes || null
      )
      const saleId = Number(saleInfo.lastInsertRowid)

      const insertItemStmt = db.prepare(`
        INSERT INTO SaleItems (SaleID, ProductID, ProductName, Quantity, UnitPrice, UnitCost, LineDiscount, LineTotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const updateStockStmt = db.prepare(`
        UPDATE Products
        SET StockQuantity = StockQuantity - ?, UpdatedAt = datetime('now')
        WHERE ProductID = ? AND IsActive = 1 AND StockQuantity >= ?
      `)
      const insertInvStmt = db.prepare(`
        INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason, SaleID)
        VALUES (?, 'Sale', ?, ?, ?, ?, ?, ?)
      `)

      for (const { item, prod, unitPrice, unitCost, lineTotal } of cartRows) {
        const itemName = prod.ProductName || item.productName
        insertItemStmt.run(saleId, item.productId, itemName, item.quantity, unitPrice, unitCost, item.lineDiscount, lineTotal)
        const stockUpdate = updateStockStmt.run(item.quantity, item.productId, item.quantity)
        if (stockUpdate.changes !== 1) throw new Error(`${itemName} is no longer active or does not have enough stock.`)
        
        insertInvStmt.run(
          item.productId, -item.quantity, prod.StockQuantity, prod.StockQuantity - item.quantity,
          req.userId, `Sale ${invoiceNumber}`, saleId
        )
      }

      const insertPaymentStmt = db.prepare(`
        INSERT INTO Payments (SaleID, PaymentMethod, Amount, ReferenceNo)
        VALUES (?, ?, ?, ?)
      `)
      if (collectedAmount > 0) {
        insertPaymentStmt.run(saleId, 'Cash', collectedAmount, req.paymentReference || null)
      }

      const insertAuditStmt = db.prepare(`
        INSERT INTO AuditLogs (UserID, Action, EntityName, EntityID, Description)
        VALUES (?, 'SALE_COMPLETED', 'Sale', ?, ?)
      `)
      insertAuditStmt.run(
        req.userId,
        saleId,
        `Sale ${invoiceNumber} ${paymentStatus === 'Pending' ? 'saved with unpaid balance' : 'completed'} for ${netTotal.toFixed(2)}${customerId ? ` for customer ${customerId}` : ''}${amountDue > 0 ? `, due ${amountDue.toFixed(2)}` : ''}.`
      )

      return { saleId, invoiceNumber, netTotal, changeAmount, amountDue, paymentStatus, customerId: customerId || undefined, customerAccountNumber }
    })

    try {
      const result = transaction(req)
      logger.info(`Sale ${result.invoiceNumber} committed successfully.`)
      return {
        success: true,
        message: result.paymentStatus === 'Pending' ? 'Sale saved with unpaid customer balance.' : 'Sale completed successfully.',
        ...result
      }
    } catch (error: any) {
      logger.error('Sale transaction rolled back', error)
      return { success: false, message: publicErrorMessage(error, 'Sale failed and was rolled back safely.') }
    }
  },

  getTodaySales: () => {
    try {
      const db = getDb()
      const today = new Date().toISOString().slice(0, 10)
      const data = db.prepare(`
        SELECT s.*, u.FullName as cashierName 
        FROM Sales s 
        JOIN Users u ON s.UserID = u.UserID
        WHERE date(s.SaleDate) = ?
        ORDER BY s.SaleDate DESC
      `).all(today)
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getByInvoice: (invoiceNumber: string) => {
    try {
      const db = getDb()
      const sale = db.prepare(`
        SELECT s.*, u.FullName as cashierName 
        FROM Sales s 
        JOIN Users u ON s.UserID = u.UserID
        WHERE s.InvoiceNumber = ?
      `).get(invoiceNumber) as any

      if (!sale) return { success: false, message: 'Invoice not found', data: null }

      sale.items = db.prepare('SELECT * FROM SaleItems WHERE SaleID = ?').all(sale.SaleID)
      sale.payments = db.prepare('SELECT * FROM Payments WHERE SaleID = ?').all(sale.SaleID)

      return { success: true, data: sale, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: null }
    }
  },

  getRange: (startDate: string, endDate: string) => {
    try {
      const db = getDb()
      if (!validDate(startDate) || !validDate(endDate)) {
        return { success: false, message: 'Choose a valid start and end date.', data: [] }
      }
      if (startDate > endDate) return { success: false, message: 'Start date cannot be after end date.', data: [] }
      const data = db.prepare(`
        WITH item_totals AS (
          SELECT si.SaleID,
                 COUNT(si.SaleItemID) as itemCount,
                 IFNULL(SUM(si.Quantity), 0) as itemsSold,
                 ROUND(IFNULL(SUM(si.Quantity * COALESCE(NULLIF(si.UnitCost, 0), p.PurchasePrice, 0)), 0), 2) as totalCost,
                 GROUP_CONCAT(si.ProductName || ' x' || si.Quantity, ', ') as itemSummary
          FROM SaleItems si
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          GROUP BY si.SaleID
        ),
        payment_totals AS (
          SELECT SaleID,
                 GROUP_CONCAT(PaymentMethod, ', ') as paymentMethods,
                 IFNULL(SUM(Amount), 0) as collectedAmount
          FROM Payments
          GROUP BY SaleID
        )
        SELECT s.SaleID as saleId,
               s.InvoiceNumber as invoiceNumber,
               s.UserID as userId,
               s.CustomerID as customerId,
               c.FullName as customerName,
               c.Phone as customerPhone,
               u.FullName as cashierName,
               s.SaleDate as saleDate,
               IFNULL(it.itemCount, 0) as itemCount,
               IFNULL(it.itemsSold, 0) as itemsSold,
               it.itemSummary as itemSummary,
               s.SubTotal as subTotal,
               s.DiscountAmount as discountAmount,
               s.DiscountPercent as discountPercent,
               s.TaxAmount as taxAmount,
               s.NetTotal as netTotal,
               s.PaidAmount as paidAmount,
               s.ChangeAmount as changeAmount,
               ROUND(CASE
                 WHEN s.NetTotal > (s.PaidAmount - s.ChangeAmount) THEN s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                 ELSE 0
               END, 2) as amountDue,
               s.PaymentStatus as paymentStatus,
               IFNULL(pt.paymentMethods, 'Unpaid') as paymentMethods,
               ROUND(s.PaidAmount, 2) as tenderedAmount,
               ROUND(IFNULL(pt.collectedAmount, s.PaidAmount - s.ChangeAmount), 2) as collectedAmount,
               ROUND(IFNULL(it.totalCost, 0), 2) as totalCost,
               ROUND(IFNULL((s.SubTotal - s.DiscountAmount) - IFNULL(it.totalCost, 0), 0), 2) as grossProfit,
               s.IsVoided as isVoided
        FROM Sales s
        JOIN Users u ON s.UserID = u.UserID
        LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
        LEFT JOIN item_totals it ON s.SaleID = it.SaleID
        LEFT JOIN payment_totals pt ON s.SaleID = pt.SaleID
        WHERE date(s.SaleDate) >= ? AND date(s.SaleDate) <= ? AND s.IsVoided = 0
        ORDER BY s.SaleDate DESC
      `).all(startDate, endDate)
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  voidSale: (saleId: number, userId: number, reason: string): ServiceResult => {
    const db = getDb()
    const transaction = db.transaction(() => {
      if (!Number.isInteger(saleId) || saleId <= 0) throw new Error('Invalid sale.')
      const safeReason = String(reason ?? '').trim()
      if (safeReason.length < 3 || safeReason.length > 500) throw new Error('Void reason must be between 3 and 500 characters.')
      const sale = db.prepare('SELECT * FROM Sales WHERE SaleID = ?').get(saleId) as any
      if (!sale) throw new Error('Sale not found')
      if (sale.IsVoided) throw new Error('Sale is already voided')

      // Mark sale void
      db.prepare("UPDATE Sales SET IsVoided = 1, PaymentStatus = 'Voided', Notes = IFNULL(Notes, '') || ? WHERE SaleID = ?")
        .run(` | Voided: ${safeReason}`, saleId)

      // Revert Stock
      const items = db.prepare('SELECT * FROM SaleItems WHERE SaleID = ?').all(saleId) as any[]
      const updateStockStmt = db.prepare("UPDATE Products SET StockQuantity = StockQuantity + ?, UpdatedAt = datetime('now') WHERE ProductID = ?")
      const insertInvStmt = db.prepare(`
        INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason, SaleID)
        VALUES (?, 'Void', ?, ?, ?, ?, ?, ?)
      `)

      for (const item of items) {
        const prod = db.prepare('SELECT StockQuantity FROM Products WHERE ProductID = ?').get(item.ProductID) as any
        if (prod) {
          updateStockStmt.run(item.Quantity, item.ProductID)
          insertInvStmt.run(
            item.ProductID, item.Quantity, prod.StockQuantity, prod.StockQuantity + item.Quantity,
            userId, `Voided Sale ${sale.InvoiceNumber}`, saleId
          )
        }
      }

      auditService.log('SALE_VOIDED', 'Sale', `Voided sale ${sale.InvoiceNumber}. Reason: ${safeReason}`, userId, saleId.toString())
    })

    try {
      transaction()
      return { success: true, message: 'Sale voided and stock restored successfully' }
    } catch (error: any) {
      logger.error('Failed to void sale', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  }
}
