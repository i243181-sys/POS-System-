import { validDate, localDate } from '../../shared/dates'
import { all, get, withTx, type Db } from '../database/database'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
import type { CompleteSaleRequest, PaymentStatus, SaleResult, ServiceResult } from '../../shared/types'

function roundMoney(value: number) {
  return Math.round(Number(value) * 100) / 100
}

async function settingNumber(key: string, fallback: number) {
  const row = await get('SELECT SettingValue FROM Settings WHERE SettingKey = $1', [key]) as any
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
  completeSale: async (req: CompleteSaleRequest): Promise<SaleResult> => {
    try {
      const result = await withTx(async (tx: Db) => {
        if (!Number.isInteger(req.userId) || req.userId <= 0) {
          throw new PublicError('A valid cashier is required.')
        }

        const cashier = await tx.get(`
          SELECT u.UserID, r.RoleName
          FROM Users u
          JOIN Roles r ON u.RoleID = r.RoleID
          WHERE u.UserID = $1 AND u.Status = 'Active' AND r.RoleName IN ('Admin', 'Cashier')
        `, [req.userId]) as any
        if (!cashier) throw new PublicError('Cashier account is not active or is not allowed to make sales.')

        if (!Array.isArray(req.cartItems) || req.cartItems.length === 0) {
          throw new PublicError('Add at least one product before completing a sale.')
        }

        const discountPercent = Number(req.discountPercent ?? 0)
        const taxPercent = Number(req.taxPercent ?? 0)
        const discountAmount = Number(req.discountAmount ?? 0)
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          throw new PublicError('Discount percent must be between 0 and 100.')
        }
        if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
          throw new PublicError('Tax percent must be between 0 and 100.')
        }
        if (!Number.isFinite(discountAmount) || discountAmount < 0) {
          throw new PublicError('Discount amount cannot be negative.')
        }

        if (req.cartItems.length > 1000) throw new PublicError('A sale can contain at most 1,000 products.')
        const productIds = new Set<number>()
        const cartRows: Array<{ item: any, prod: any, unitPrice: number, unitCost: number, lineTotal: number }> = []
        for (const item of req.cartItems) {
          if (productIds.has(item.productId)) throw new PublicError('Combine duplicate products into one cart line.')
          productIds.add(item.productId)
          if (!Number.isInteger(item.productId) || item.productId <= 0) throw new PublicError('Invalid product in cart.')
          if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100000) throw new PublicError(`Invalid quantity for ${item.productName}.`)
          if (!Number.isFinite(item.lineDiscount) || item.lineDiscount < 0) throw new PublicError(`Invalid line discount for ${item.productName}.`)

          const prod = await tx.get(
            'SELECT StockQuantity, ProductName, SellingPrice, PurchasePrice FROM Products WHERE ProductID = $1 AND IsActive = true',
            [item.productId]
          ) as any
          if (!prod) throw new PublicError(`Product ${item.productName} is inactive, deleted, or unavailable.`)
          if (prod.StockQuantity < item.quantity) {
            throw new PublicError(`Insufficient stock for ${prod.ProductName}. Available: ${prod.StockQuantity}`)
          }

          const unitPrice = roundMoney(Number(prod.SellingPrice))
          const unitCost = roundMoney(Number(prod.PurchasePrice || 0))
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new PublicError(`Invalid price for ${prod.ProductName}.`)
          if (!Number.isFinite(unitCost) || unitCost < 0) throw new PublicError(`Invalid purchase cost for ${prod.ProductName}.`)
          const lineGross = roundMoney(unitPrice * item.quantity)
          if (item.lineDiscount > lineGross) throw new PublicError(`Line discount is greater than line total for ${item.productName}.`)
          cartRows.push({ item, prod, unitPrice, unitCost, lineTotal: roundMoney(lineGross - item.lineDiscount) })
        }
        const subTotal = roundMoney(cartRows.reduce((sum, row) => sum + roundMoney(row.unitPrice * row.item.quantity), 0))
        const requestedDiscount = discountAmount > 0 ? discountAmount : (subTotal * discountPercent / 100)
        const lineDiscountTotal = roundMoney(cartRows.reduce((sum, row) => sum + row.item.lineDiscount, 0))
        if (requestedDiscount + lineDiscountTotal > subTotal) throw new PublicError('Discounts cannot exceed the subtotal.')
        const calculatedDiscount = roundMoney(requestedDiscount + lineDiscountTotal)
        const effectiveDiscountPercent = subTotal > 0 ? roundMoney((calculatedDiscount / subTotal) * 100) : 0
        const maxDiscount = cashier.RoleName === 'Admin'
          ? await settingNumber('AdminMaxDiscountPercent', 100)
          : await settingNumber('CashierMaxDiscountPercent', 5)
        if (calculatedDiscount > roundMoney(subTotal * maxDiscount / 100)) {
          throw new PublicError(`Applied discount exceeds the ${maxDiscount}% limit for this role.`)
        }
        const taxableAmount = roundMoney(subTotal - calculatedDiscount)
        const calculatedTax = roundMoney(taxableAmount * (taxPercent / 100))
        const netTotal = roundMoney(taxableAmount + calculatedTax)
        const paidAmount = roundMoney(req.paidAmount)
        const amountDue = roundMoney(Math.max(0, netTotal - paidAmount))
        const changeAmount = roundMoney(Math.max(0, paidAmount - netTotal))
        const collectedAmount = roundMoney(Math.max(0, paidAmount - changeAmount))
        const paymentStatus: PaymentStatus = amountDue > 0 ? 'Pending' : 'Completed'

        if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > 1e12 || !Number.isSafeInteger(Math.round(netTotal * 100))) {
          throw new PublicError('Paid amount cannot be negative.')
        }

        const invoicePrefixSetting = await tx.get("SELECT SettingValue FROM Settings WHERE SettingKey = 'InvoicePrefix'") as any
        const invoicePrefix = String(invoicePrefixSetting?.SettingValue || 'POS').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || 'POS'
        const datePart = localDate().replace(/-/g, '')
        const prefix = `${invoicePrefix}-${datePart}-`
        const seqRow = await tx.get('SELECT COUNT(*) as cnt FROM Sales WHERE InvoiceNumber ILIKE $1', [`${prefix}%`]) as any
        const seq = (Number(seqRow.cnt) + 1).toString().padStart(6, '0')
        const invoiceNumber = `${prefix}${seq}`
        const customerName = req.customerName?.trim()
        const customerFatherName = req.customerFatherName?.trim()
        const customerPhone = normalizeMobile(req.customerPhone)
        const customerEmail = req.customerEmail?.trim()
        const requestedAccountNumber = amountDue > 0 ? normalizeAccountNumber(req.customerAccountNumber) : ''
        let customerId: number | null = amountDue > 0 ? req.customerId || null : null
        let customerAccountNumber: string | undefined

        if (customerName && customerName.length > 100) throw new PublicError('Customer name must be 100 characters or fewer.')
        if (customerFatherName && customerFatherName.length > 100) throw new PublicError('Father name must be 100 characters or fewer.')
        if (customerPhone && customerPhone.length > 30) throw new PublicError('Customer phone must be 30 characters or fewer.')
        if (customerEmail && (customerEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) {
          throw new PublicError('Customer email is not valid.')
        }
        if (amountDue > 0) {
          if (!customerName) throw new PublicError('Customer name is required to open or use an account.')
          if (!customerFatherName) throw new PublicError('Father name is required to open or use an account.')
          if (!customerPhone || !isValidMobile(customerPhone)) throw new PublicError('A valid mobile number is required to open or use an account.')
        }
        if (String(req.paymentMethod) !== 'Cash') {
          throw new PublicError('Only cash payments are accepted at checkout.')
        }

        if (amountDue > 0 && customerId) {
          const customer = await tx.get('SELECT CustomerID, AccountNumber, Phone FROM Customers WHERE CustomerID = $1 AND IsActive = true', [customerId]) as any
          if (!customer) throw new PublicError('Selected customer is inactive or does not exist.')
          if (normalizeMobile(customer.Phone) !== customerPhone || (requestedAccountNumber && customer.AccountNumber !== requestedAccountNumber)) throw new PublicError('Account ID and mobile number do not match the same customer.')
          customerAccountNumber = customer.AccountNumber || accountNumberForCustomer(customerId)
          if (!customer.AccountNumber) {
            await tx.run('UPDATE Customers SET AccountNumber = $1, UpdatedAt = now() WHERE CustomerID = $2', [customerAccountNumber, customerId])
          }
        }

        if (amountDue > 0 && !customerId && (requestedAccountNumber || customerPhone)) {
          let existing: any = null
          if (requestedAccountNumber) {
            existing = await tx.get(
              `SELECT CustomerID, AccountNumber, Phone FROM Customers WHERE AccountNumber = $1 AND IsActive = true LIMIT 1`,
              [requestedAccountNumber]
            )
            if (!existing) throw new PublicError('Account ID was not found. Leave it blank to open a new account.')
            if (existing?.Phone && customerPhone && normalizeMobile(existing.Phone) !== customerPhone) {
              throw new PublicError('Account ID and mobile number do not match the same customer.')
            }
          }

          if (!existing && customerPhone) {
            existing = await tx.get(`
              SELECT CustomerID, AccountNumber, Phone FROM Customers
              WHERE Phone = $1 AND IsActive = true
              ORDER BY CustomerID DESC
              LIMIT 1
            `, [customerPhone])
          }

          if (existing) {
            customerId = Number(existing.CustomerID)
            customerAccountNumber = existing.AccountNumber || accountNumberForCustomer(customerId)
            await tx.run(
              `UPDATE Customers
               SET FullName = COALESCE($1, FullName),
                   FatherName = COALESCE($2, FatherName),
                   Phone = COALESCE($3, Phone),
                   Email = COALESCE($4, Email),
                   AccountNumber = CASE
                     WHEN AccountNumber IS NULL OR trim(AccountNumber) = '' THEN $5
                     ELSE AccountNumber
                   END,
                   UpdatedAt = now()
               WHERE CustomerID = $6`,
              [customerName || null, customerFatherName || null, customerPhone || null, customerEmail || null, customerAccountNumber, customerId]
            )
          }
        }

        if (!customerId && amountDue > 0) {
          const customerInfo = await tx.run(
            `INSERT INTO Customers (FullName, FatherName, Phone, Email, UpdatedAt)
             VALUES ($1, $2, $3, $4, now()) RETURNING CustomerID`,
            [customerName, customerFatherName, customerPhone, customerEmail || null]
          )
          customerId = Number(customerInfo.rows[0].CustomerID)
          customerAccountNumber = accountNumberForCustomer(customerId)
          await tx.run('UPDATE Customers SET AccountNumber = $1 WHERE CustomerID = $2', [customerAccountNumber, customerId])
        }

        const saleInfo = await tx.run(
          `INSERT INTO Sales (InvoiceNumber, UserID, CustomerID, SubTotal, DiscountAmount, DiscountPercent, TaxAmount, NetTotal, PaidAmount, ChangeAmount, PaymentStatus, Notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING SaleID`,
          [invoiceNumber, req.userId, customerId, subTotal, calculatedDiscount, effectiveDiscountPercent, calculatedTax, netTotal, paidAmount, changeAmount, paymentStatus, req.notes || null]
        )
        const saleId = Number(saleInfo.rows[0].SaleID)

        for (const { item, prod, unitPrice, unitCost, lineTotal } of cartRows) {
          const itemName = prod.ProductName || item.productName
          await tx.run(
            `INSERT INTO SaleItems (SaleID, ProductID, ProductName, Quantity, UnitPrice, UnitCost, LineDiscount, LineTotal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [saleId, item.productId, itemName, item.quantity, unitPrice, unitCost, item.lineDiscount, lineTotal]
          )
          const stockUpdate = await tx.run(
            `UPDATE Products SET StockQuantity = StockQuantity - $1, UpdatedAt = now()
             WHERE ProductID = $2 AND IsActive = true AND StockQuantity >= $1`,
            [item.quantity, item.productId]
          )
          if (stockUpdate.rowCount !== 1) throw new PublicError(`${itemName} is no longer active or does not have enough stock.`)

          await tx.run(
            `INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason, SaleID)
             VALUES ($1, 'Sale', $2, $3, $4, $5, $6, $7)`,
            [item.productId, -item.quantity, prod.StockQuantity, prod.StockQuantity - item.quantity, req.userId, `Sale ${invoiceNumber}`, saleId]
          )
        }

        if (collectedAmount > 0) {
          await tx.run(
            'INSERT INTO Payments (SaleID, PaymentMethod, Amount, ReferenceNo) VALUES ($1, $2, $3, $4)',
            [saleId, 'Cash', collectedAmount, req.paymentReference || null]
          )
        }

        await tx.run(
          `INSERT INTO AuditLogs (UserID, Action, EntityName, EntityID, Description) VALUES ($1, 'SALE_COMPLETED', 'Sale', $2, $3)`,
          [
            req.userId,
            saleId,
            `Sale ${invoiceNumber} ${paymentStatus === 'Pending' ? 'saved with unpaid balance' : 'completed'} for ${netTotal.toFixed(2)}${customerId ? ` for customer ${customerId}` : ''}${amountDue > 0 ? `, due ${amountDue.toFixed(2)}` : ''}.`
          ]
        )

        return { saleId, invoiceNumber, netTotal, changeAmount, amountDue, paymentStatus, customerId: customerId || undefined, customerAccountNumber }
      })

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

  getTodaySales: async (userId?: number) => {
    try {
      const today = localDate()
      const data = await all(
        `SELECT s.*, u.FullName as cashierName
         FROM Sales s
         JOIN Users u ON s.UserID = u.UserID
         WHERE (s.SaleDate)::date = $1::date AND ($2::int IS NULL OR s.UserID = $2::int)
         ORDER BY s.SaleDate DESC`,
        [today, userId ?? null]
      )
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getByInvoice: async (invoiceNumber: string, userId?: number) => {
    try {
      const sale = await get(
        `SELECT s.*, u.FullName as cashierName
         FROM Sales s
         JOIN Users u ON s.UserID = u.UserID
         WHERE s.InvoiceNumber = $1 AND ($2::int IS NULL OR s.UserID = $2::int)`,
        [invoiceNumber, userId ?? null]
      ) as any

      if (!sale) return { success: false, message: 'Invoice not found', data: null }

      sale.items = await all('SELECT * FROM SaleItems WHERE SaleID = $1', [sale.SaleID])
      sale.payments = await all('SELECT * FROM Payments WHERE SaleID = $1', [sale.SaleID])

      return { success: true, data: sale, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: null }
    }
  },

  getRange: async (startDate: string, endDate: string) => {
    try {
      if (!validDate(startDate) || !validDate(endDate)) {
        return { success: false, message: 'Choose a valid start and end date.', data: [] }
      }
      if (startDate > endDate) return { success: false, message: 'Start date cannot be after end date.', data: [] }
      const data = await all(
        `WITH item_totals AS (
          SELECT si.SaleID,
                 COUNT(si.SaleItemID) as itemCount,
                 COALESCE(SUM(si.Quantity), 0) as itemsSold,
                 round(COALESCE(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0), 2) as totalCost,
                 string_agg(si.ProductName || ' x' || si.Quantity, ', ') as itemSummary
          FROM SaleItems si
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          GROUP BY si.SaleID
        ),
        payment_totals AS (
          SELECT SaleID,
                 string_agg(PaymentMethod, ', ') as paymentMethods,
                 COALESCE(SUM(Amount), 0) as collectedAmount
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
               COALESCE(it.itemCount, 0) as itemCount,
               COALESCE(it.itemsSold, 0) as itemsSold,
               it.itemSummary as itemSummary,
               s.SubTotal as subTotal,
               s.DiscountAmount as discountAmount,
               s.DiscountPercent as discountPercent,
               s.TaxAmount as taxAmount,
               s.NetTotal as netTotal,
               s.PaidAmount as paidAmount,
               s.ChangeAmount as changeAmount,
               round(CASE
                 WHEN s.NetTotal > (s.PaidAmount - s.ChangeAmount) THEN s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                 ELSE 0
               END, 2) as amountDue,
               s.PaymentStatus as paymentStatus,
               COALESCE(pt.paymentMethods, 'Unpaid') as paymentMethods,
               round(s.PaidAmount, 2) as tenderedAmount,
               round(COALESCE(pt.collectedAmount, s.PaidAmount - s.ChangeAmount), 2) as collectedAmount,
               round(COALESCE(it.totalCost, 0), 2) as totalCost,
               round(COALESCE((s.SubTotal - s.DiscountAmount) - COALESCE(it.totalCost, 0), 0), 2) as grossProfit,
               s.IsVoided as isVoided
        FROM Sales s
        JOIN Users u ON s.UserID = u.UserID
        LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
        LEFT JOIN item_totals it ON s.SaleID = it.SaleID
        LEFT JOIN payment_totals pt ON s.SaleID = pt.SaleID
        WHERE (s.SaleDate)::date >= $1::date AND (s.SaleDate)::date <= $2::date AND s.IsVoided = false
        ORDER BY s.SaleDate DESC`,
        [startDate, endDate]
      )
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  voidSale: async (saleId: number, userId: number, reason: string): Promise<ServiceResult> => {
    try {
      await withTx(async (tx: Db) => {
        if (!Number.isInteger(saleId) || saleId <= 0) throw new PublicError('Invalid sale.')
        const safeReason = String(reason ?? '').trim()
        if (safeReason.length < 3 || safeReason.length > 500) throw new PublicError('Void reason must be between 3 and 500 characters.')
        const sale = await tx.get('SELECT * FROM Sales WHERE SaleID = $1', [saleId]) as any
        if (!sale) throw new PublicError('Sale not found')
        if (sale.IsVoided) throw new PublicError('Sale is already voided')

        // Mark sale void
        await tx.run(
          "UPDATE Sales SET IsVoided = true, PaymentStatus = 'Voided', Notes = COALESCE(Notes, '') || $1 WHERE SaleID = $2",
          [` | Voided: ${safeReason}`, saleId]
        )

        // Revert Stock
        const items = await tx.all('SELECT * FROM SaleItems WHERE SaleID = $1', [saleId]) as any[]
        for (const item of items) {
          const prod = await tx.get('SELECT StockQuantity FROM Products WHERE ProductID = $1', [item.ProductID]) as any
          if (prod) {
            await tx.run(
              "UPDATE Products SET StockQuantity = StockQuantity + $1, UpdatedAt = now() WHERE ProductID = $2",
              [item.Quantity, item.ProductID]
            )
            await tx.run(
              `INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason, SaleID)
               VALUES ($1, 'Void', $2, $3, $4, $5, $6, $7)`,
              [item.ProductID, item.Quantity, prod.StockQuantity, prod.StockQuantity + item.Quantity, userId, `Voided Sale ${sale.InvoiceNumber}`, saleId]
            )
          }
        }

        await auditService.log('SALE_VOIDED', 'Sale', `Voided sale ${sale.InvoiceNumber}. Reason: ${safeReason}`, userId, saleId.toString(), tx)
      })
      return { success: true, message: 'Sale voided and stock restored successfully' }
    } catch (error: any) {
      logger.error('Failed to void sale', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  }
}
