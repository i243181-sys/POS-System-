import { validDate, localDate } from '../../shared/dates'
import { all, get } from '../database/database'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'
import type { DashboardData } from '../../shared/types'
import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'

const currency = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' })

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}


function reportFileName(startDate: string, endDate: string) {
  return `SecureStore_Sales_Report_${startDate}_to_${endDate}.pdf`
}

function excelExportFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `SecureStore_POS_Data_Export_${timestamp}.xls`
}

type ExcelColumn = {
  key: string
  header: string
}

type ExcelSheet = {
  name: string
  columns: ExcelColumn[]
  rows: Array<Record<string, unknown>>
}

function cleanXmlText(value: unknown) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

function escapeXml(value: unknown) {
  return cleanXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function excelSafeText(value: unknown) {
  const text = cleanXmlText(value)
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text
}

function excelSheetName(name: string) {
  return cleanXmlText(name).replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet'
}

function excelCell(value: unknown, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : ''

  if (value === null || value === undefined || value === '') {
    return `<Cell${style}><Data ss:Type="String"></Data></Cell>`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell${style}><Data ss:Type="Number">${value}</Data></Cell>`
  }

  if (typeof value === 'boolean') {
    return `<Cell${style}><Data ss:Type="String">${value ? 'Yes' : 'No'}</Data></Cell>`
  }

  return `<Cell${style}><Data ss:Type="String">${escapeXml(excelSafeText(value))}</Data></Cell>`
}

function buildExcelWorkbook(sheets: ExcelSheet[]) {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Top" />
      <Font ss:FontName="Arial" ss:Size="10" />
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF" />
      <Interior ss:Color="#14532D" ss:Pattern="Solid" />
      <Alignment ss:Vertical="Center" />
    </Style>
  </Styles>
  ${sheets.map((sheet) => `
    <Worksheet ss:Name="${escapeXml(excelSheetName(sheet.name))}">
      <Table>
        <Row>${sheet.columns.map((column) => excelCell(column.header, 'Header')).join('')}</Row>
        ${sheet.rows.map((row) => `<Row>${sheet.columns.map((column) => excelCell(row[column.key])).join('')}</Row>`).join('')}
      </Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <FreezePanes />
        <FrozenNoSplit />
        <SplitHorizontal>1</SplitHorizontal>
        <TopRowBottomPane>1</TopRowBottomPane>
        <ActivePane>2</ActivePane>
      </WorksheetOptions>
    </Worksheet>
  `).join('')}
</Workbook>`
}

function renderTable(headers: string[], rows: unknown[][]) {
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.length === 0
          ? `<tr><td colspan="${headers.length}" class="empty">No records found.</td></tr>`
          : rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `
}

function buildSalesReportHtml(report: {
  startDate: string
  endDate: string
  generatedAt: string
  settings: Record<string, string>
  summary: any
  daily: any[]
  products: any[]
  cashiers: any[]
  payments: any[]
  sales: any[]
}) {
  const shopName = report.settings.ShopName || 'SecureStore POS'
  const shopAddress = report.settings.ShopAddress || ''
  const shopPhone = report.settings.ShopPhone || ''
  const shopEmail = report.settings.ShopEmail || ''
  const summaryCards = [
    ['Transactions', report.summary.transactionCount || 0],
    ['Gross Sales', currency.format(report.summary.grossSales || 0)],
    ['Discounts', currency.format(report.summary.totalDiscount || 0)],
    ['Tax', currency.format(report.summary.totalTax || 0)],
    ['Net Revenue', currency.format(report.summary.netRevenue || 0)],
    ['Collected', currency.format(report.summary.collectedAmount || 0)],
    ['Outstanding', currency.format(report.summary.outstandingAmount || 0)],
    ['Gross Profit', currency.format(report.summary.grossProfit || 0)],
    ['Avg Ticket', currency.format(report.summary.averageTicket || 0)]
  ]

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Sales Report</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 28px; font-family: Arial, Helvetica, sans-serif; color: #111827; background: white; }
        .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #14532d; padding-bottom: 16px; margin-bottom: 18px; }
        .brand h1 { margin: 0; color: #14532d; font-size: 28px; }
        .brand p, .meta p { margin: 4px 0; color: #475569; font-size: 12px; }
        .meta { text-align: right; }
        .title { margin: 18px 0 8px; font-size: 22px; }
        .range { margin: 0 0 18px; color: #334155; font-weight: 700; }
        .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0 22px; }
        .card { border: 1px solid #dbeafe; border-radius: 10px; padding: 12px; background: #f8fafc; }
        .card label { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: .04em; }
        .card strong { display: block; margin-top: 6px; font-size: 20px; color: #0f172a; }
        h2 { margin: 22px 0 8px; color: #14532d; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
        th { background: #14532d; color: white; text-align: left; padding: 7px; }
        td { border-bottom: 1px solid #e2e8f0; padding: 7px; vertical-align: top; }
        tr:nth-child(even) td { background: #f8fafc; }
        .empty { text-align: center; color: #64748b; padding: 18px; }
        .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 10px; color: #64748b; font-size: 11px; display: flex; justify-content: space-between; }
        .page-break { page-break-before: always; }
      </style>
    </head>
    <body>
      <section class="header">
        <div class="brand">
          <h1>${escapeHtml(shopName)}</h1>
          ${shopAddress ? `<p>${escapeHtml(shopAddress)}</p>` : ''}
          ${shopPhone ? `<p>Phone: ${escapeHtml(shopPhone)}</p>` : ''}
          ${shopEmail ? `<p>${escapeHtml(shopEmail)}</p>` : ''}
        </div>
        <div class="meta">
          <p><strong>Generated:</strong> ${escapeHtml(report.generatedAt)}</p>
          <p><strong>Currency:</strong> PKR</p>
          <p><strong>Report:</strong> Sales Summary</p>
        </div>
      </section>

      <h1 class="title">Sales Report</h1>
      <p class="range">${escapeHtml(report.startDate)} to ${escapeHtml(report.endDate)}</p>

      <section class="cards">
        ${summaryCards.map(([label, value]) => `<div class="card"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value)}</strong></div>`).join('')}
      </section>

      <h2>Daily Sales</h2>
      ${renderTable(
        ['Date', 'Transactions', 'Items', 'Gross Sales', 'Discounts', 'Tax', 'Net Revenue', 'Cost', 'Profit'],
        report.daily.map((row) => [
          row.date,
          row.transactionCount,
          row.itemsSold,
          currency.format(row.totalRevenue || 0),
          currency.format(row.totalDiscount || 0),
          currency.format(row.totalTax || 0),
          currency.format(row.netRevenue || 0),
          currency.format(row.totalCost || 0),
          currency.format(row.grossProfit || 0)
        ])
      )}

      <h2>Payment Summary</h2>
      ${renderTable(
        ['Payment Method', 'Count', 'Amount'],
        report.payments.map((row) => [row.paymentMethod, row.paymentCount, currency.format(row.totalAmount || 0)])
      )}

      <h2>Top Products</h2>
      ${renderTable(
        ['Product', 'Category', 'Qty Sold', 'Gross Sales', 'Discounts', 'Net Sales', 'Cost', 'Profit/Loss', 'Margin'],
        report.products.slice(0, 20).map((row) => [
          row.productName,
          row.categoryName || 'Uncategorized',
          row.totalQuantitySold,
          currency.format(row.grossRevenue || 0),
          currency.format(row.totalDiscount || 0),
          currency.format(row.totalRevenue || 0),
          currency.format(row.totalCost || 0),
          currency.format(row.grossProfit || 0),
          `${Number(row.profitMargin || 0).toFixed(1)}%`
        ])
      )}

      <h2>Cashier Performance</h2>
      ${renderTable(
        ['Cashier', 'Transactions', 'Revenue', 'Collected', 'Outstanding', 'Discounts', 'Profit'],
        report.cashiers.map((row) => [
          row.cashierName,
          row.transactionCount,
          currency.format(row.totalRevenue || 0),
          currency.format(row.collectedAmount || 0),
          currency.format(row.outstandingAmount || 0),
          currency.format(row.totalDiscount || 0),
          currency.format(row.grossProfit || 0)
        ])
      )}

      <h2 class="page-break">Sales Detail</h2>
      ${renderTable(
        ['Invoice', 'Date', 'Customer', 'Cashier', 'Items', 'Subtotal', 'Discount', 'Tax', 'Net Total', 'Collected', 'Due', 'Profit'],
        report.sales.map((row) => [
          row.invoiceNumber,
          row.saleDate,
          row.customerName || 'Walk-in',
          row.cashierName,
          row.itemSummary || row.itemCount,
          currency.format(row.subTotal || 0),
          currency.format(row.discountAmount || 0),
          currency.format(row.taxAmount || 0),
          currency.format(row.netTotal || 0),
          currency.format(row.collectedAmount || Math.max(0, Number(row.paidAmount || 0) - Number(row.changeAmount || 0))),
          currency.format(row.amountDue || 0),
          currency.format(row.grossProfit || 0)
        ])
      )}

      <div class="footer">
        <span>Generated by SecureStore POS</span>
        <span>${escapeHtml(report.startDate)} to ${escapeHtml(report.endDate)}</span>
      </div>
    </body>
  </html>`
}

export const reportService = {
  getDashboard: async (): Promise<{ success: boolean, data?: DashboardData, message: string }> => {
    try {
      
      const today = localDate()
      
      const salesRow = await get(`
        SELECT COUNT(*) as count,
               ROUND(IFNULL(SUM(PaidAmount - ChangeAmount), 0), 2) as collected,
               ROUND(IFNULL(SUM(NetTotal), 0), 2) as netSales,
               ROUND(IFNULL(SUM(CASE
                 WHEN NetTotal > (PaidAmount - ChangeAmount) THEN NetTotal - (PaidAmount - ChangeAmount)
                 ELSE 0
               END), 0), 2) as outstanding
        FROM Sales 
        WHERE date(SaleDate, 'localtime') = ? AND IsVoided = 0
      `, [today]) as any

      const prodRow = await get(`SELECT COUNT(*) as cnt FROM Products WHERE IsActive = 1`)
      const lowStockRow = await get(`SELECT COUNT(*) as cnt FROM Products WHERE IsActive = 1 AND StockQuantity <= ReorderLevel`)

      const recentSales = await all(`
        SELECT s.InvoiceNumber as invoiceNumber, u.FullName as cashierName, s.SaleDate as saleDate, s.NetTotal as netTotal
        FROM Sales s
        JOIN Users u ON s.UserID = u.UserID
        WHERE s.IsVoided = 0
        ORDER BY s.SaleDate DESC LIMIT 5
      `)

      const lowStockItems = await all(`
        SELECT p.ProductName as productName, c.CategoryName as categoryName, p.StockQuantity as stockQuantity, p.ReorderLevel as reorderLevel
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.IsActive = 1 AND p.StockQuantity <= p.ReorderLevel
        ORDER BY p.StockQuantity ASC LIMIT 10
      `)

      return {
        success: true,
        message: '',
        data: {
          todayTransactions: salesRow.count,
          todayRevenue: salesRow.collected,
          todayNetSales: salesRow.netSales,
          todayOutstanding: salesRow.outstanding,
          totalProducts: prodRow.cnt,
          lowStockCount: lowStockRow.cnt,
          recentSales,
          lowStockItems
        }
      }
    } catch (error: any) {
      logger.error('Dashboard error', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  getDailyReport: async (startDate: string, endDate: string) => {
    try {
      if (!validDate(startDate) || !validDate(endDate)) return { success: false, message: 'Choose a valid start and end date.', data: [] }
      if (startDate > endDate) return { success: false, message: 'Start date cannot be after end date.', data: [] }
      const data = await all(`
        WITH sale_costs AS (
          SELECT s.SaleID,
                 IFNULL(SUM(si.Quantity), 0) as itemsSold,
                 IFNULL(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0) as totalCost
          FROM Sales s
          LEFT JOIN SaleItems si ON s.SaleID = si.SaleID
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
          GROUP BY s.SaleID
        )
        SELECT date(s.SaleDate, 'localtime') as date,
               COUNT(*) as transactionCount,
               IFNULL(SUM(s.SubTotal), 0) as totalRevenue,
               IFNULL(SUM(s.DiscountAmount), 0) as totalDiscount,
               IFNULL(SUM(s.TaxAmount), 0) as totalTax,
               IFNULL(SUM(s.NetTotal), 0) as netRevenue,
               IFNULL(SUM(sc.itemsSold), 0) as itemsSold,
               ROUND(IFNULL(SUM(sc.totalCost), 0), 2) as totalCost,
               ROUND(IFNULL(SUM((s.SubTotal - s.DiscountAmount) - IFNULL(sc.totalCost, 0)), 0), 2) as grossProfit,
               CASE
                 WHEN IFNULL(SUM(s.SubTotal - s.DiscountAmount), 0) > 0
                 THEN ROUND((SUM((s.SubTotal - s.DiscountAmount) - IFNULL(sc.totalCost, 0)) / SUM(s.SubTotal - s.DiscountAmount)) * 100, 2)
                 ELSE 0
               END as profitMargin
        FROM Sales s
        LEFT JOIN sale_costs sc ON s.SaleID = sc.SaleID
        WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
        GROUP BY date(s.SaleDate, 'localtime')
        ORDER BY date DESC
      `, [startDate, endDate, startDate, endDate])
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getProductReport: async (startDate: string, endDate: string) => {
    try {
      if (!validDate(startDate) || !validDate(endDate)) return { success: false, message: 'Choose a valid start and end date.', data: [] }
      if (startDate > endDate) return { success: false, message: 'Start date cannot be after end date.', data: [] }
      const data = await all(`
        WITH product_lines AS (
          SELECT si.ProductID as productId,
                 si.ProductName as productName,
                 c.CategoryName as categoryName,
                 si.Quantity as quantity,
                 (si.Quantity * si.UnitPrice) as grossRevenue,
                 CASE
                   WHEN s.SubTotal > 0 THEN (si.Quantity * si.UnitPrice / s.SubTotal) * s.DiscountAmount
                   ELSE 0
                 END as allocatedDiscount,
                 si.Quantity * COALESCE(si.UnitCost, 0) as totalCost
          FROM SaleItems si
          JOIN Sales s ON si.SaleID = s.SaleID
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
          WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
        )
        SELECT productId,
               productName,
               categoryName,
               SUM(quantity) as totalQuantitySold,
               ROUND(SUM(grossRevenue), 2) as grossRevenue,
               ROUND(SUM(allocatedDiscount), 2) as totalDiscount,
               ROUND(SUM(grossRevenue - allocatedDiscount), 2) as totalRevenue,
               ROUND(SUM(totalCost), 2) as totalCost,
               ROUND(SUM((grossRevenue - allocatedDiscount) - totalCost), 2) as grossProfit,
               CASE
                 WHEN SUM(grossRevenue - allocatedDiscount) > 0
                 THEN ROUND((SUM((grossRevenue - allocatedDiscount) - totalCost) / SUM(grossRevenue - allocatedDiscount)) * 100, 2)
                 ELSE 0
               END as profitMargin
        FROM product_lines
        GROUP BY productId, productName, categoryName
        ORDER BY totalRevenue DESC
      `, [startDate, endDate])
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getCashierReport: async (startDate: string, endDate: string) => {
    try {
      if (!validDate(startDate) || !validDate(endDate)) return { success: false, message: 'Choose a valid start and end date.', data: [] }
      if (startDate > endDate) return { success: false, message: 'Start date cannot be after end date.', data: [] }
      const data = await all(`
        WITH sale_costs AS (
          SELECT s.SaleID,
                 IFNULL(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0) as totalCost
          FROM Sales s
          LEFT JOIN SaleItems si ON s.SaleID = si.SaleID
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
          GROUP BY s.SaleID
        )
        SELECT u.UserID as userId, u.FullName as cashierName,
               COUNT(*) as transactionCount,
               IFNULL(SUM(s.NetTotal), 0) as totalRevenue,
               IFNULL(SUM(s.DiscountAmount), 0) as totalDiscount,
               ROUND(IFNULL(SUM(s.PaidAmount - s.ChangeAmount), 0), 2) as collectedAmount,
               ROUND(IFNULL(SUM(CASE
                 WHEN s.NetTotal > (s.PaidAmount - s.ChangeAmount) THEN s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                 ELSE 0
               END), 0), 2) as outstandingAmount,
               ROUND(IFNULL(SUM(sc.totalCost), 0), 2) as totalCost,
               ROUND(IFNULL(SUM((s.SubTotal - s.DiscountAmount) - IFNULL(sc.totalCost, 0)), 0), 2) as grossProfit
        FROM Sales s
        JOIN Users u ON s.UserID = u.UserID
        LEFT JOIN sale_costs sc ON s.SaleID = sc.SaleID
        WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
        GROUP BY u.UserID, u.FullName
        ORDER BY totalRevenue DESC
      `, [startDate, endDate, startDate, endDate])
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  exportDataExcel: async (parentWindow?: BrowserWindow | null) => {
    try {
      const generatedAt = new Date().toLocaleString()

      const salesSummary = await get(`
        WITH sale_costs AS (
          SELECT s.SaleID,
                 IFNULL(SUM(si.Quantity), 0) as itemsSold,
                 IFNULL(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0) as totalCost
          FROM Sales s
          LEFT JOIN SaleItems si ON s.SaleID = si.SaleID
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          WHERE s.IsVoided = 0
          GROUP BY s.SaleID
        )
        SELECT COUNT(*) as transactionCount,
               IFNULL(SUM(s.SubTotal), 0) as grossSales,
               IFNULL(SUM(s.DiscountAmount), 0) as totalDiscount,
               IFNULL(SUM(s.TaxAmount), 0) as totalTax,
               IFNULL(SUM(s.NetTotal), 0) as netRevenue,
               ROUND(IFNULL(SUM(s.PaidAmount - s.ChangeAmount), 0), 2) as collectedAmount,
               ROUND(IFNULL(SUM(CASE
                 WHEN s.NetTotal > (s.PaidAmount - s.ChangeAmount) THEN s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                 ELSE 0
               END), 0), 2) as outstandingAmount,
               IFNULL(SUM(sc.itemsSold), 0) as itemsSold,
               ROUND(IFNULL(SUM(sc.totalCost), 0), 2) as totalCost,
               ROUND(IFNULL(SUM((s.SubTotal - s.DiscountAmount) - IFNULL(sc.totalCost, 0)), 0), 2) as grossProfit
        FROM Sales s
        LEFT JOIN sale_costs sc ON s.SaleID = sc.SaleID
        WHERE s.IsVoided = 0
      `)

      const counts = await get(`
        SELECT
          (SELECT COUNT(*) FROM Products) as productCount,
          (SELECT COUNT(*) FROM Products WHERE IsActive = 1) as activeProductCount,
          (SELECT COUNT(*) FROM Customers) as customerCount,
          (SELECT COUNT(*) FROM Sales WHERE IsVoided = 0) as saleCount,
          (SELECT COUNT(*) FROM Sales WHERE IsVoided = 1) as voidedSaleCount
      `)

      const inventoryValue = await get(`
        SELECT ROUND(IFNULL(SUM(PurchasePrice * StockQuantity), 0), 2) as stockCost,
               ROUND(IFNULL(SUM(SellingPrice * StockQuantity), 0), 2) as stockRetailValue,
               ROUND(IFNULL(SUM((SellingPrice - PurchasePrice) * StockQuantity), 0), 2) as stockProfitPotential
        FROM Products
      `)

      const summaryRows = [
        { metric: 'Generated At', value: generatedAt },
        { metric: 'Products', value: counts.productCount },
        { metric: 'Active Products', value: counts.activeProductCount },
        { metric: 'Customers', value: counts.customerCount },
        { metric: 'Sales', value: counts.saleCount },
        { metric: 'Voided Sales', value: counts.voidedSaleCount },
        { metric: 'Items Sold', value: salesSummary.itemsSold },
        { metric: 'Gross Sales', value: salesSummary.grossSales },
        { metric: 'Discounts', value: salesSummary.totalDiscount },
        { metric: 'Tax', value: salesSummary.totalTax },
        { metric: 'Net Revenue', value: salesSummary.netRevenue },
        { metric: 'Collected Amount', value: salesSummary.collectedAmount },
        { metric: 'Outstanding Amount', value: salesSummary.outstandingAmount },
        { metric: 'Total Cost', value: salesSummary.totalCost },
        { metric: 'Gross Profit', value: salesSummary.grossProfit },
        { metric: 'Stock Cost', value: inventoryValue.stockCost },
        { metric: 'Stock Retail Value', value: inventoryValue.stockRetailValue },
        { metric: 'Stock Profit Potential', value: inventoryValue.stockProfitPotential }
      ]

      const dailySales = await all(`
        WITH sale_costs AS (
          SELECT s.SaleID,
                 IFNULL(SUM(si.Quantity), 0) as itemsSold,
                 IFNULL(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0) as totalCost
          FROM Sales s
          LEFT JOIN SaleItems si ON s.SaleID = si.SaleID
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          WHERE s.IsVoided = 0
          GROUP BY s.SaleID
        )
        SELECT date(s.SaleDate, 'localtime') as date,
               COUNT(*) as transactionCount,
               IFNULL(SUM(s.SubTotal), 0) as totalRevenue,
               IFNULL(SUM(s.DiscountAmount), 0) as totalDiscount,
               IFNULL(SUM(s.TaxAmount), 0) as totalTax,
               IFNULL(SUM(s.NetTotal), 0) as netRevenue,
               IFNULL(SUM(sc.itemsSold), 0) as itemsSold,
               ROUND(IFNULL(SUM(sc.totalCost), 0), 2) as totalCost,
               ROUND(IFNULL(SUM((s.SubTotal - s.DiscountAmount) - IFNULL(sc.totalCost, 0)), 0), 2) as grossProfit
        FROM Sales s
        LEFT JOIN sale_costs sc ON s.SaleID = sc.SaleID
        WHERE s.IsVoided = 0
        GROUP BY date(s.SaleDate, 'localtime')
        ORDER BY date DESC
      `)

      const salesDetail = await all(`
        WITH item_totals AS (
          SELECT si.SaleID,
                 COUNT(si.SaleItemID) as itemCount,
                 IFNULL(SUM(si.Quantity), 0) as itemsSold,
                 ROUND(IFNULL(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0), 2) as totalCost,
                 GROUP_CONCAT(si.ProductName || ' x' || si.Quantity, ', ') as itemSummary
          FROM SaleItems si
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          GROUP BY si.SaleID
        )
        SELECT s.InvoiceNumber as invoiceNumber,
               s.SaleDate as saleDate,
               c.AccountNumber as customerAccountNumber,
               c.FullName as customerName,
               u.FullName as cashierName,
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
               ROUND(s.PaidAmount - s.ChangeAmount, 2) as collectedAmount,
               ROUND(CASE
                 WHEN s.NetTotal > (s.PaidAmount - s.ChangeAmount) THEN s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                 ELSE 0
               END, 2) as amountDue,
               s.PaymentStatus as paymentStatus,
               CASE WHEN s.IsVoided = 1 THEN 'Yes' ELSE 'No' END as isVoided,
               ROUND(IFNULL((s.SubTotal - s.DiscountAmount) - IFNULL(it.totalCost, 0), 0), 2) as grossProfit
        FROM Sales s
        JOIN Users u ON s.UserID = u.UserID
        LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
        LEFT JOIN item_totals it ON s.SaleID = it.SaleID
        ORDER BY s.SaleDate DESC
      `)

      const saleItems = await all(`
        SELECT s.InvoiceNumber as invoiceNumber,
               s.SaleDate as saleDate,
               si.ProductName as productName,
               si.Quantity as quantity,
               si.UnitPrice as unitPrice,
               si.UnitCost as unitCost,
               si.LineDiscount as lineDiscount,
               si.LineTotal as lineTotal,
               ROUND((si.LineTotal - (si.Quantity * si.UnitCost)), 2) as lineProfit
        FROM SaleItems si
        JOIN Sales s ON si.SaleID = s.SaleID
        ORDER BY s.SaleDate DESC, si.SaleItemID ASC
      `)

      const productProfit = await all(`
        WITH product_lines AS (
          SELECT si.ProductID as productId,
                 si.ProductName as productName,
                 c.CategoryName as categoryName,
                 si.Quantity as quantity,
                 (si.Quantity * si.UnitPrice) as grossRevenue,
                 CASE
                   WHEN s.SubTotal > 0 THEN (si.Quantity * si.UnitPrice / s.SubTotal) * s.DiscountAmount
                   ELSE 0
                 END as allocatedDiscount,
                 si.Quantity * COALESCE(si.UnitCost, 0) as totalCost
          FROM SaleItems si
          JOIN Sales s ON si.SaleID = s.SaleID
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
          WHERE s.IsVoided = 0
        )
        SELECT productId,
               productName,
               categoryName,
               SUM(quantity) as totalQuantitySold,
               ROUND(SUM(grossRevenue), 2) as grossRevenue,
               ROUND(SUM(allocatedDiscount), 2) as totalDiscount,
               ROUND(SUM(grossRevenue - allocatedDiscount), 2) as totalRevenue,
               ROUND(SUM(totalCost), 2) as totalCost,
               ROUND(SUM((grossRevenue - allocatedDiscount) - totalCost), 2) as grossProfit
        FROM product_lines
        GROUP BY productId, productName, categoryName
        ORDER BY totalRevenue DESC
      `)

      const inventory = await all(`
        SELECT p.ProductID as productId,
               p.ProductName as productName,
               p.Barcode as barcode,
               c.CategoryName as categoryName,
               p.Brand as brand,
               p.PurchasePrice as purchasePrice,
               p.SellingPrice as sellingPrice,
               p.StockQuantity as stockQuantity,
               p.ReorderLevel as reorderLevel,
               ROUND(p.PurchasePrice * p.StockQuantity, 2) as stockCost,
               ROUND(p.SellingPrice * p.StockQuantity, 2) as stockRetailValue,
               ROUND((p.SellingPrice - p.PurchasePrice) * p.StockQuantity, 2) as stockProfitPotential,
               CASE WHEN p.IsActive = 1 THEN 'Active' ELSE 'Inactive' END as status,
               p.CreatedAt as createdAt,
               p.UpdatedAt as updatedAt
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        ORDER BY p.IsActive DESC, p.ProductName ASC
      `)

      const customers = await all(`
        SELECT c.AccountNumber as accountNumber,
               c.FullName as fullName,
               c.FatherName as fatherName,
               c.Phone as phone,
               c.Email as email,
               c.Address as address,
               COUNT(s.SaleID) as invoiceCount,
               ROUND(IFNULL(SUM(s.NetTotal), 0), 2) as totalAmount,
               ROUND(IFNULL(SUM(s.PaidAmount - s.ChangeAmount), 0), 2) as paidAmount,
               ROUND(IFNULL(SUM(CASE
                 WHEN s.NetTotal > (s.PaidAmount - s.ChangeAmount) THEN s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                 ELSE 0
               END), 0), 2) as amountToBePaid,
               MAX(s.SaleDate) as lastSaleDate,
               CASE WHEN c.IsActive = 1 THEN 'Active' ELSE 'Inactive' END as status
        FROM Customers c
        LEFT JOIN Sales s ON c.CustomerID = s.CustomerID AND s.IsVoided = 0
        GROUP BY c.CustomerID
        ORDER BY amountToBePaid DESC, c.FullName ASC
      `)

      const payments = await all(`
        SELECT p.PaymentDate as paymentDate,
               s.InvoiceNumber as invoiceNumber,
               c.FullName as customerName,
               p.PaymentMethod as paymentMethod,
               p.Amount as amount,
               p.ReferenceNo as referenceNo,
               p.Notes as notes
        FROM Payments p
        JOIN Sales s ON p.SaleID = s.SaleID
        LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
        ORDER BY p.PaymentDate DESC
      `)

      const stockHistory = await all(`
        SELECT it.CreatedAt as createdAt,
               p.ProductName as productName,
               it.TransactionType as transactionType,
               it.QuantityChange as quantityChange,
               it.OldStock as oldStock,
               it.NewStock as newStock,
               u.Username as username,
               it.Reason as reason,
               s.InvoiceNumber as invoiceNumber
        FROM InventoryTransactions it
        JOIN Products p ON it.ProductID = p.ProductID
        JOIN Users u ON it.UserID = u.UserID
        LEFT JOIN Sales s ON it.SaleID = s.SaleID
        ORDER BY it.CreatedAt DESC
      `)

      const backupLogs = await all(`
        SELECT b.BackupDate as backupDate,
               b.BackupPath as backupPath,
               b.FileSizeBytes as fileSizeBytes,
               u.Username as createdBy,
               b.Status as status,
               CASE WHEN b.IsAutomatic = 1 THEN 'Automatic' ELSE 'Manual' END as backupType,
               b.VerifiedAt as verifiedAt,
               b.LastRestoredAt as lastRestoredAt,
               b.ErrorMessage as errorMessage
        FROM BackupLogs b
        LEFT JOIN Users u ON b.CreatedByUserID = u.UserID
        ORDER BY b.BackupDate DESC
      `)

      const sheets: ExcelSheet[] = [
        {
          name: 'Summary',
          columns: [{ key: 'metric', header: 'Metric' }, { key: 'value', header: 'Value' }],
          rows: summaryRows
        },
        {
          name: 'Daily Sales',
          columns: [
            { key: 'date', header: 'Date' },
            { key: 'transactionCount', header: 'Transactions' },
            { key: 'itemsSold', header: 'Items Sold' },
            { key: 'totalRevenue', header: 'Gross Sales' },
            { key: 'totalDiscount', header: 'Discounts' },
            { key: 'totalTax', header: 'Tax' },
            { key: 'netRevenue', header: 'Net Revenue' },
            { key: 'totalCost', header: 'Cost' },
            { key: 'grossProfit', header: 'Profit' }
          ],
          rows: dailySales
        },
        {
          name: 'Sales Detail',
          columns: [
            { key: 'invoiceNumber', header: 'Invoice' },
            { key: 'saleDate', header: 'Date' },
            { key: 'customerAccountNumber', header: 'Customer Account' },
            { key: 'customerName', header: 'Customer' },
            { key: 'cashierName', header: 'Cashier' },
            { key: 'itemCount', header: 'Item Count' },
            { key: 'itemsSold', header: 'Items Sold' },
            { key: 'itemSummary', header: 'Items' },
            { key: 'subTotal', header: 'Subtotal' },
            { key: 'discountAmount', header: 'Discount' },
            { key: 'discountPercent', header: 'Discount %' },
            { key: 'taxAmount', header: 'Tax' },
            { key: 'netTotal', header: 'Net Total' },
            { key: 'paidAmount', header: 'Tendered' },
            { key: 'changeAmount', header: 'Change' },
            { key: 'collectedAmount', header: 'Collected' },
            { key: 'amountDue', header: 'Due' },
            { key: 'grossProfit', header: 'Profit' },
            { key: 'paymentStatus', header: 'Payment Status' },
            { key: 'isVoided', header: 'Voided' }
          ],
          rows: salesDetail
        },
        {
          name: 'Sale Items',
          columns: [
            { key: 'invoiceNumber', header: 'Invoice' },
            { key: 'saleDate', header: 'Date' },
            { key: 'productName', header: 'Product' },
            { key: 'quantity', header: 'Quantity' },
            { key: 'unitPrice', header: 'Unit Price' },
            { key: 'unitCost', header: 'Unit Cost' },
            { key: 'lineDiscount', header: 'Line Discount' },
            { key: 'lineTotal', header: 'Line Total' },
            { key: 'lineProfit', header: 'Line Profit' }
          ],
          rows: saleItems
        },
        {
          name: 'Product Profit',
          columns: [
            { key: 'productId', header: 'Product ID' },
            { key: 'productName', header: 'Product' },
            { key: 'categoryName', header: 'Category' },
            { key: 'totalQuantitySold', header: 'Qty Sold' },
            { key: 'grossRevenue', header: 'Gross Sales' },
            { key: 'totalDiscount', header: 'Discounts' },
            { key: 'totalRevenue', header: 'Net Sales' },
            { key: 'totalCost', header: 'Cost' },
            { key: 'grossProfit', header: 'Profit' }
          ],
          rows: productProfit
        },
        {
          name: 'Inventory',
          columns: [
            { key: 'productId', header: 'Product ID' },
            { key: 'productName', header: 'Product' },
            { key: 'barcode', header: 'Barcode' },
            { key: 'categoryName', header: 'Category' },
            { key: 'brand', header: 'Brand' },
            { key: 'purchasePrice', header: 'Purchase Price' },
            { key: 'sellingPrice', header: 'Selling Price' },
            { key: 'stockQuantity', header: 'Stock Qty' },
            { key: 'reorderLevel', header: 'Reorder Level' },
            { key: 'stockCost', header: 'Stock Cost' },
            { key: 'stockRetailValue', header: 'Stock Retail Value' },
            { key: 'stockProfitPotential', header: 'Stock Profit Potential' },
            { key: 'status', header: 'Status' },
            { key: 'createdAt', header: 'Created At' },
            { key: 'updatedAt', header: 'Updated At' }
          ],
          rows: inventory
        },
        {
          name: 'Customers Dues',
          columns: [
            { key: 'accountNumber', header: 'Account Number' },
            { key: 'fullName', header: 'Customer' },
            { key: 'fatherName', header: 'Father Name' },
            { key: 'phone', header: 'Phone' },
            { key: 'email', header: 'Email' },
            { key: 'address', header: 'Address' },
            { key: 'invoiceCount', header: 'Invoices' },
            { key: 'totalAmount', header: 'Total Amount' },
            { key: 'paidAmount', header: 'Collected' },
            { key: 'amountToBePaid', header: 'Amount To Be Paid' },
            { key: 'lastSaleDate', header: 'Last Sale' },
            { key: 'status', header: 'Status' }
          ],
          rows: customers
        },
        {
          name: 'Payments',
          columns: [
            { key: 'paymentDate', header: 'Payment Date' },
            { key: 'invoiceNumber', header: 'Invoice' },
            { key: 'customerName', header: 'Customer' },
            { key: 'paymentMethod', header: 'Method' },
            { key: 'amount', header: 'Amount' },
            { key: 'referenceNo', header: 'Reference' },
            { key: 'notes', header: 'Notes' }
          ],
          rows: payments
        },
        {
          name: 'Stock History',
          columns: [
            { key: 'createdAt', header: 'Created At' },
            { key: 'productName', header: 'Product' },
            { key: 'transactionType', header: 'Type' },
            { key: 'quantityChange', header: 'Qty Change' },
            { key: 'oldStock', header: 'Old Stock' },
            { key: 'newStock', header: 'New Stock' },
            { key: 'username', header: 'User' },
            { key: 'reason', header: 'Reason' },
            { key: 'invoiceNumber', header: 'Invoice' }
          ],
          rows: stockHistory
        },
        {
          name: 'Backup Logs',
          columns: [
            { key: 'backupDate', header: 'Backup Date' },
            { key: 'backupPath', header: 'Backup Path' },
            { key: 'fileSizeBytes', header: 'File Size Bytes' },
            { key: 'createdBy', header: 'Created By' },
            { key: 'status', header: 'Status' },
            { key: 'backupType', header: 'Backup Type' },
            { key: 'verifiedAt', header: 'Verified At' },
            { key: 'lastRestoredAt', header: 'Last Restored At' },
            { key: 'errorMessage', header: 'Error Message' }
          ],
          rows: backupLogs
        }
      ]

      const saveDialogOptions = {
        title: 'Save Excel Data Export',
        defaultPath: excelExportFileName(),
        filters: [{ name: 'Excel workbook', extensions: ['xls'] }]
      }
      const saveResult = parentWindow
        ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions)

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, message: 'Excel export cancelled.' }
      }

      const workbook = buildExcelWorkbook(sheets)
      fs.writeFileSync(saveResult.filePath, workbook, 'utf8')

      return {
        success: true,
        message: 'Excel data export saved successfully.',
        data: {
          filePath: saveResult.filePath,
          sheets: sheets.length,
          sales: salesSummary.transactionCount
        }
      }
    } catch (error: any) {
      logger.error('Failed to export Excel data', error)
      return { success: false, message: publicErrorMessage(error, 'Could not export the Excel data file.') }
    }
  },

  exportSalesPdf: async (startDate: string, endDate: string, parentWindow?: BrowserWindow | null) => {
    let reportWindow: BrowserWindow | null = null

    try {
      if (!validDate(startDate) || !validDate(endDate)) {
        return { success: false, message: 'Choose a valid start and end date.' }
      }
      if (startDate > endDate) {
        return { success: false, message: 'Start date cannot be after end date.' }
      }

      const settingsRows = await all('SELECT SettingKey, SettingValue FROM Settings')
      const settings: Record<string, string> = {}
      for (const row of settingsRows) settings[row.SettingKey] = row.SettingValue

      const summary = await get(`
        WITH sale_costs AS (
          SELECT s.SaleID,
                 IFNULL(SUM(si.Quantity), 0) as itemsSold,
                 IFNULL(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0) as totalCost
          FROM Sales s
          LEFT JOIN SaleItems si ON s.SaleID = si.SaleID
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
          GROUP BY s.SaleID
        )
        SELECT COUNT(*) as transactionCount,
               IFNULL(SUM(SubTotal), 0) as grossSales,
               IFNULL(SUM(DiscountAmount), 0) as totalDiscount,
               IFNULL(SUM(TaxAmount), 0) as totalTax,
               IFNULL(SUM(NetTotal), 0) as netRevenue,
               IFNULL(AVG(NetTotal), 0) as averageTicket,
               ROUND(IFNULL(SUM(PaidAmount - ChangeAmount), 0), 2) as collectedAmount,
               ROUND(IFNULL(SUM(CASE
                 WHEN NetTotal > (PaidAmount - ChangeAmount) THEN NetTotal - (PaidAmount - ChangeAmount)
                 ELSE 0
               END), 0), 2) as outstandingAmount,
               IFNULL(SUM(sc.itemsSold), 0) as itemsSold,
               ROUND(IFNULL(SUM(sc.totalCost), 0), 2) as totalCost,
               ROUND(IFNULL(SUM((SubTotal - DiscountAmount) - IFNULL(sc.totalCost, 0)), 0), 2) as grossProfit
        FROM Sales s
        LEFT JOIN sale_costs sc ON s.SaleID = sc.SaleID
        WHERE date(SaleDate, 'localtime') >= ? AND date(SaleDate, 'localtime') <= ? AND IsVoided = 0
      `, [startDate, endDate, startDate, endDate]) as any

      const daily = (await reportService.getDailyReport(startDate, endDate)).data as any[]
      const products = (await reportService.getProductReport(startDate, endDate)).data as any[]
      const cashiers = (await reportService.getCashierReport(startDate, endDate)).data as any[]
      const payments = await all(`
        SELECT PaymentMethod as paymentMethod,
               COUNT(*) as paymentCount,
               ROUND(IFNULL(SUM(CASE
                 WHEN p.Amount > s.NetTotal THEN s.NetTotal
                 ELSE p.Amount
               END), 0), 2) as totalAmount
        FROM Payments p
        JOIN Sales s ON p.SaleID = s.SaleID
        WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
        GROUP BY PaymentMethod
        ORDER BY totalAmount DESC
      `, [startDate, endDate]) as any[]
      const sales = await all(`
        WITH item_totals AS (
          SELECT si.SaleID,
                 COUNT(si.SaleItemID) as itemCount,
                 IFNULL(SUM(si.Quantity), 0) as itemsSold,
                 ROUND(IFNULL(SUM(si.Quantity * COALESCE(si.UnitCost, 0)), 0), 2) as totalCost,
                 GROUP_CONCAT(si.ProductName || ' x' || si.Quantity, ', ') as itemSummary
          FROM SaleItems si
          LEFT JOIN Products p ON si.ProductID = p.ProductID
          GROUP BY si.SaleID
        )
        SELECT s.InvoiceNumber as invoiceNumber,
               s.SaleDate as saleDate,
               c.FullName as customerName,
               u.FullName as cashierName,
               IFNULL(it.itemCount, 0) as itemCount,
               IFNULL(it.itemsSold, 0) as itemsSold,
               it.itemSummary as itemSummary,
               s.SubTotal as subTotal,
               s.DiscountAmount as discountAmount,
               s.TaxAmount as taxAmount,
               s.NetTotal as netTotal,
               s.PaidAmount as paidAmount,
               s.ChangeAmount as changeAmount,
               ROUND(s.PaidAmount - s.ChangeAmount, 2) as collectedAmount,
               ROUND(CASE
                 WHEN s.NetTotal > (s.PaidAmount - s.ChangeAmount) THEN s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                 ELSE 0
               END, 2) as amountDue,
               ROUND(IFNULL((s.SubTotal - s.DiscountAmount) - IFNULL(it.totalCost, 0), 0), 2) as grossProfit
        FROM Sales s
        JOIN Users u ON s.UserID = u.UserID
        LEFT JOIN Customers c ON s.CustomerID = c.CustomerID
        LEFT JOIN item_totals it ON s.SaleID = it.SaleID
        WHERE date(s.SaleDate, 'localtime') >= ? AND date(s.SaleDate, 'localtime') <= ? AND s.IsVoided = 0
        ORDER BY s.SaleDate DESC
      `, [startDate, endDate]) as any[]

      const saveDialogOptions = {
        title: 'Save Sales Report PDF',
        defaultPath: reportFileName(startDate, endDate),
        filters: [{ name: 'PDF document', extensions: ['pdf'] }]
      }
      const saveResult = parentWindow
        ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions)
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, message: 'Report export cancelled.' }
      }

      const html = buildSalesReportHtml({
        startDate,
        endDate,
        generatedAt: new Date().toLocaleString(),
        settings,
        summary,
        daily,
        products,
        cashiers,
        payments,
        sales
      })

      reportWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true
        }
      })
      await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdf = await reportWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: {
          marginType: 'custom',
          top: 0.35,
          bottom: 0.35,
          left: 0.35,
          right: 0.35
        }
      })
      fs.writeFileSync(saveResult.filePath, pdf)

      return {
        success: true,
        message: 'Sales report PDF saved successfully.',
        data: {
          filePath: saveResult.filePath,
          transactionCount: summary.transactionCount,
          netRevenue: summary.netRevenue
        }
      }
    } catch (error: any) {
      logger.error('Failed to export sales PDF', error)
      return { success: false, message: publicErrorMessage(error, 'Could not export the sales report.') }
    } finally {
      reportWindow?.close()
    }
  }
}
