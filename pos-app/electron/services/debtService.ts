import { auditService } from './auditService'
import { all, withTx, type Db } from '../database/database'
import { logger } from '../utils/logger'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'

export const debtService = {
  recordPayment: async (customerId: number, amount: number, userId: number) => {
    try {
      if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new PublicError('Choose a valid customer account.')
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new PublicError('Enter a positive payment with at most two decimal places.')
      const amountToBePaid = await withTx(async (tx: Db) => {
        const sales = await tx.all(
          `SELECT s.SaleID, round((s.NetTotal - s.PaidAmount + s.ChangeAmount) * 100) as due
           FROM Sales s JOIN Customers c ON c.CustomerID = s.CustomerID
           WHERE s.CustomerID = $1 AND c.IsActive = true AND s.IsVoided = false AND s.PaymentStatus = 'Pending'
           ORDER BY s.SaleDate, s.SaleID`,
          [customerId]
        ) as Array<{ SaleID: number; due: number }>
        const totalDue = sales.reduce((sum, sale) => sum + Number(sale.due), 0)
        let remaining = Math.round(amount * 100)
        if (!totalDue || remaining > totalDue) throw new PublicError('Payment exceeds the current outstanding balance.')
        for (const sale of sales) {
          if (remaining <= 0) break
          const applied = Math.min(remaining, Number(sale.due))
          await tx.run(
            "INSERT INTO Payments (SaleID, PaymentMethod, Amount, Notes) VALUES ($1, 'Cash', $2, 'Account repayment')",
            [sale.SaleID, applied / 100]
          )
          await tx.run(
            "UPDATE Sales SET PaidAmount = round(PaidAmount + $1, 2), PaymentStatus = $2 WHERE SaleID = $3",
            [applied / 100, applied === Number(sale.due) ? 'Completed' : 'Pending', sale.SaleID]
          )
          remaining -= applied
        }
        await auditService.log('DEBT_PAYMENT', 'Customer', `Received cash payment of ${amount.toFixed(2)}; applied to oldest outstanding bills.`, userId, String(customerId), tx)
        return (totalDue - Math.round(amount * 100)) / 100
      })
      return { success: true, message: 'Payment recorded against the oldest outstanding bills.', data: { amountToBePaid } }
    } catch (error) {
      logger.error('Account payment failed', error)
      return { success: false, message: publicErrorMessage(error, 'Could not record payment. No payment was saved.') }
    }
  },
  getOutstanding: async () => {
    try {
      const rows = await all(`
        SELECT
          c.CustomerID as customerId,
          c.AccountNumber as customerAccountNumber,
          c.FullName as customerName,
          c.FatherName as customerFatherName,
          c.Phone as customerPhone,
          COUNT(s.SaleID) as invoiceCount,
          round(SUM(s.NetTotal), 2) as totalAmount,
          round(SUM(s.PaidAmount - s.ChangeAmount), 2) as paidAmount,
          round(SUM(s.NetTotal - (s.PaidAmount - s.ChangeAmount)), 2) as amountToBePaid,
          MAX(s.SaleDate) as lastSaleDate
        FROM Sales s
        JOIN Customers c ON s.CustomerID = c.CustomerID
        WHERE s.IsVoided = false
          AND s.PaymentStatus = 'Pending'
          AND round(s.NetTotal - (s.PaidAmount - s.ChangeAmount), 2) > 0
          AND c.IsActive = true
        GROUP BY c.CustomerID, c.AccountNumber, c.FullName, c.FatherName, c.Phone
        ORDER BY amountToBePaid DESC, lastSaleDate DESC
      `)

      return { success: true, message: '', data: rows }
    } catch (error) {
      logger.error('Error fetching customer debts', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
