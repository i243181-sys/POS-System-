import { getDb } from '../database/database'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'

export const debtService = {
  getOutstanding: () => {
    try {
      const db = getDb()
      const rows = db.prepare(`
        SELECT
          c.CustomerID as customerId,
          c.AccountNumber as customerAccountNumber,
          c.FullName as customerName,
          c.FatherName as customerFatherName,
          c.Phone as customerPhone,
          COUNT(s.SaleID) as invoiceCount,
          ROUND(SUM(s.NetTotal), 2) as totalAmount,
          ROUND(SUM(s.PaidAmount - s.ChangeAmount), 2) as paidAmount,
          ROUND(SUM(s.NetTotal - (s.PaidAmount - s.ChangeAmount)), 2) as amountToBePaid,
          MAX(s.SaleDate) as lastSaleDate
        FROM Sales s
        JOIN Customers c ON s.CustomerID = c.CustomerID
        WHERE s.IsVoided = 0
          AND s.PaymentStatus = 'Pending'
          AND ROUND(s.NetTotal - (s.PaidAmount - s.ChangeAmount), 2) > 0
          AND c.IsActive = 1
        GROUP BY c.CustomerID, c.AccountNumber, c.FullName, c.FatherName, c.Phone
        ORDER BY amountToBePaid DESC, lastSaleDate DESC
      `).all()

      return { success: true, message: '', data: rows }
    } catch (error) {
      logger.error('Error fetching customer debts', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
