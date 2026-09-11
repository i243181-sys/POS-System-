import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Boxes, CreditCard, Package, RefreshCcw, Search, TrendingDown, TrendingUp, Users } from 'lucide-react'

import { Notice, unwrap, isSuccess, StatCard, NoticeBar, dateOnly, formatDateTime, moneyTone, compactMoney } from './shared'

type ReportTab = 'daily' | 'products' | 'sales' | 'cashiers'

type DailyReportRow = {
  date: string
  transactionCount: number
  totalRevenue: number
  totalDiscount: number
  totalTax: number
  netRevenue: number
  itemsSold: number
  totalCost: number
  grossProfit: number
  profitMargin: number
}

type ProductReportRow = {
  productId: number
  productName: string
  categoryName?: string
  totalQuantitySold: number
  grossRevenue: number
  totalRevenue: number
  totalDiscount: number
  totalCost: number
  grossProfit: number
  profitMargin: number
}

type CashierReportRow = {
  userId: number
  cashierName: string
  transactionCount: number
  totalRevenue: number
  totalDiscount: number
  collectedAmount: number
  outstandingAmount: number
  totalCost: number
  grossProfit: number
}

type DetailedSaleRow = {
  saleId: number
  invoiceNumber: string
  customerName?: string
  customerPhone?: string
  cashierName: string
  saleDate: string
  itemCount: number
  itemsSold: number
  itemSummary?: string
  subTotal: number
  discountAmount: number
  discountPercent: number
  taxAmount: number
  netTotal: number
  paidAmount: number
  changeAmount: number
  amountDue: number
  paymentStatus: string
  paymentMethods: string
  collectedAmount?: number
  totalCost: number
  grossProfit: number
}

export function ReportsScreen() {
  const [from, setFrom] = useState(() => dateOnly(new Date(Date.now() - 6 * 86400000)))
  const [to, setTo] = useState(() => dateOnly(new Date()))
  const [daily, setDaily] = useState<DailyReportRow[]>([])
  const [products, setProducts] = useState<ProductReportRow[]>([])
  const [cashiers, setCashiers] = useState<CashierReportRow[]>([])
  const [sales, setSales] = useState<DetailedSaleRow[]>([])
  const [activeTab, setActiveTab] = useState<ReportTab>('products')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    if (!from || !to) {
      setNotice({ tone: 'error', text: 'Select a start and end date.' })
      return
    }
    if (from > to) {
      setNotice({ tone: 'error', text: 'Start date cannot be after end date.' })
      return
    }

    setLoading(true)
    try {
      const [dailyResponse, productResponse, cashierResponse, salesResponse] = await Promise.all([
        window.api?.getDailyReport?.(from, to),
        window.api?.getProductReport?.(from, to),
        window.api?.getCashierReport?.(from, to),
        window.api?.getSalesRange?.(from, to)
      ])

      const failed = [dailyResponse, productResponse, cashierResponse, salesResponse]
        .find((response) => response?.success === false)
      if (failed) throw new Error(failed.message || 'Could not load reports.')

      setDaily(unwrap<DailyReportRow[]>(dailyResponse, []))
      setProducts(unwrap<ProductReportRow[]>(productResponse, []))
      setCashiers(unwrap<CashierReportRow[]>(cashierResponse, []))
      setSales(unwrap<DetailedSaleRow[]>(salesResponse, []))
      setNotice(null)
    } catch (error: any) {
      setNotice({ tone: 'error', text: error?.message || 'Could not load reports.' })
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const setPreset = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - (days - 1))
    setFrom(dateOnly(start))
    setTo(dateOnly(end))
  }

  const summary = useMemo(() => {
    const transactions = daily.reduce((sum, row) => sum + Number(row.transactionCount || 0), 0)
    const netSales = daily.reduce((sum, row) => sum + Number(row.netRevenue || 0), 0)
    const grossSales = daily.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0)
    const discounts = daily.reduce((sum, row) => sum + Number(row.totalDiscount || 0), 0)
    const tax = daily.reduce((sum, row) => sum + Number(row.totalTax || 0), 0)
    const itemsSold = daily.reduce((sum, row) => sum + Number(row.itemsSold || 0), 0)
    const totalCost = daily.reduce((sum, row) => sum + Number(row.totalCost || 0), 0)
    const grossProfit = daily.reduce((sum, row) => sum + Number(row.grossProfit || 0), 0)
    const collected = sales.reduce((sum, row) => sum + Number(row.collectedAmount ?? Math.max(0, Number(row.paidAmount || 0) - Number(row.changeAmount || 0))), 0)
    const outstanding = sales.reduce((sum, row) => sum + Number(row.amountDue || 0), 0)
    const margin = grossSales - discounts > 0 ? (grossProfit / (grossSales - discounts)) * 100 : 0

    return {
      transactions,
      netSales,
      grossSales,
      discounts,
      tax,
      itemsSold,
      totalCost,
      grossProfit,
      collected,
      outstanding,
      margin,
      averageTicket: transactions ? netSales / transactions : 0
    }
  }, [daily, sales])

  const filteredProducts = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    if (!lowered) return products
    return products.filter((product) =>
      [product.productName, product.categoryName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lowered))
    )
  }, [products, query])

  const filteredSales = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    if (!lowered) return sales
    return sales.filter((sale) =>
      [sale.invoiceNumber, sale.customerName, sale.customerPhone, sale.cashierName, sale.itemSummary, sale.paymentStatus]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lowered))
    )
  }, [query, sales])

  const filteredCashiers = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    if (!lowered) return cashiers
    return cashiers.filter((cashier) => cashier.cashierName.toLowerCase().includes(lowered))
  }, [cashiers, query])

  const selectedSale = filteredSales[0]
  const bestProduct = products[0]

  const exportPdf = async () => {
    if (!from || !to) {
      setNotice({ tone: 'error', text: 'Select a start and end date before exporting.' })
      return
    }
    if (from > to) {
      setNotice({ tone: 'error', text: 'Start date cannot be after end date.' })
      return
    }

    setExporting(true)
    const response = await window.api?.exportSalesPdf?.(from, to)
    setExporting(false)
    setNotice({
      tone: isSuccess(response) ? 'success' : response?.message?.includes('cancelled') ? 'info' : 'error',
      text: response?.message || 'Report export finished.'
    })
  }

  const tabButton = (tab: ReportTab, label: string) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${
        activeTab === tab ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between rounded-xl border border-white bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold">Reports & Analytics</h2>
          <p className="text-sm font-semibold text-slate-500">
            Date range report from {from} to {to}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => setPreset(1)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Today</button>
          <button onClick={() => setPreset(7)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">7 Days</button>
          <button onClick={() => setPreset(30)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">30 Days</button>
          <input className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <button onClick={() => { void load().catch(error => setNotice({ tone: 'error', text: error.message })) }} disabled={loading} className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={exportPdf} disabled={exporting || loading} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
            {exporting ? 'Saving PDF...' : 'Save PDF'}
          </button>
        </div>
      </div>

      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Received Sales" value={compactMoney(summary.collected)} icon={CreditCard} tone="emerald" />
        <StatCard label="Total Sales" value={compactMoney(summary.netSales)} icon={BarChart3} />
        <StatCard label="Transactions" value={summary.transactions} icon={TrendingUp} tone="cyan" />
        <StatCard label="Profit / Loss" value={compactMoney(summary.grossProfit)} icon={summary.grossProfit < 0 ? TrendingDown : TrendingUp} tone={summary.grossProfit < 0 ? 'rose' : 'emerald'} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Items Sold" value={summary.itemsSold} icon={Boxes} tone="cyan" />
        <StatCard label="Total Cost" value={compactMoney(summary.totalCost)} icon={Package} tone="amber" />
        <StatCard label="Outstanding" value={compactMoney(summary.outstanding)} icon={AlertTriangle} tone={summary.outstanding > 0 ? 'rose' : 'emerald'} />
        <StatCard label="Avg Ticket" value={compactMoney(summary.averageTicket)} icon={Users} tone="indigo" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div className="flex flex-wrap gap-2">
              {tabButton('products', 'Product Profit')}
              {tabButton('sales', 'Sales Data')}
              {tabButton('daily', 'Daily Sales')}
              {tabButton('cashiers', 'Cashiers')}
            </div>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-400"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search report data..."
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {activeTab === 'products' && (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">Net Sales</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Profit / Loss</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr><td className="px-4 py-8 text-slate-500" colSpan={8}>No product sales for this date range.</td></tr>
                  ) : filteredProducts.map((product) => (
                    <tr key={product.productId} className="hover:bg-indigo-50/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{product.productName}</p>
                        <p className="text-xs font-semibold text-slate-500">{product.categoryName || 'Uncategorized'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{product.totalQuantitySold}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(product.grossRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{compactMoney(product.totalDiscount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700">{compactMoney(product.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(product.totalCost)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${moneyTone(product.grossProfit)}`}>{compactMoney(product.grossProfit)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${moneyTone(product.grossProfit)}`}>{Number(product.profitMargin || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'sales' && (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">Tax</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                    <th className="px-4 py-3 text-right">Due</th>
                    <th className="px-4 py-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSales.length === 0 ? (
                    <tr><td className="px-4 py-8 text-slate-500" colSpan={10}>No sales found for this date range.</td></tr>
                  ) : filteredSales.map((sale) => (
                    <tr key={sale.saleId} className="hover:bg-cyan-50/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-indigo-700">{sale.invoiceNumber}</p>
                        <p className="text-xs font-semibold text-slate-500">{formatDateTime(sale.saleDate)}</p>
                        <p className="text-xs font-semibold text-slate-500">{sale.cashierName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold">{sale.customerName || 'Walk-in'}</p>
                        {sale.customerPhone && <p className="text-xs text-slate-500">{sale.customerPhone}</p>}
                        <p className="mt-1 text-xs font-bold text-slate-500">{sale.paymentMethods}</p>
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="line-clamp-2 font-semibold text-slate-700">{sale.itemSummary || `${sale.itemCount} item(s)`}</p>
                        <p className="text-xs font-bold text-slate-500">{sale.itemsSold} units</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(sale.subTotal)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{compactMoney(sale.discountAmount)}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(sale.taxAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700">{compactMoney(sale.netTotal)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{compactMoney(sale.collectedAmount ?? Math.max(0, sale.paidAmount - sale.changeAmount))}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${sale.amountDue > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{compactMoney(sale.amountDue)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${moneyTone(sale.grossProfit)}`}>{compactMoney(sale.grossProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'daily' && (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Transactions</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">Tax</th>
                    <th className="px-4 py-3 text-right">Net Sales</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Profit</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {daily.length === 0 ? (
                    <tr><td className="px-4 py-8 text-slate-500" colSpan={10}>No daily sales for this date range.</td></tr>
                  ) : daily.map((day) => (
                    <tr key={day.date} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold">{day.date}</td>
                      <td className="px-4 py-3 text-right font-bold">{day.transactionCount}</td>
                      <td className="px-4 py-3 text-right font-bold">{day.itemsSold}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(day.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{compactMoney(day.totalDiscount)}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(day.totalTax)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700">{compactMoney(day.netRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(day.totalCost)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${moneyTone(day.grossProfit)}`}>{compactMoney(day.grossProfit)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${moneyTone(day.grossProfit)}`}>{Number(day.profitMargin || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'cashiers' && (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Cashier</th>
                    <th className="px-4 py-3 text-right">Transactions</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3 text-right">Discounts</th>
                    <th className="px-4 py-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCashiers.length === 0 ? (
                    <tr><td className="px-4 py-8 text-slate-500" colSpan={7}>No cashier sales for this date range.</td></tr>
                  ) : filteredCashiers.map((cashier) => (
                    <tr key={cashier.userId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold">{cashier.cashierName}</td>
                      <td className="px-4 py-3 text-right font-bold">{cashier.transactionCount}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700">{compactMoney(cashier.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{compactMoney(cashier.collectedAmount)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${cashier.outstandingAmount > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{compactMoney(cashier.outstandingAmount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{compactMoney(cashier.totalDiscount)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${moneyTone(cashier.grossProfit)}`}>{compactMoney(cashier.grossProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          <div className="rounded-xl border border-white bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Range Insight</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">{Number(summary.margin || 0).toFixed(1)}% margin</h3>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Gross sales</span><strong>{compactMoney(summary.grossSales)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Discounts</span><strong className="text-amber-700">{compactMoney(summary.discounts)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Tax</span><strong>{compactMoney(summary.tax)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Net before cost</span><strong>{compactMoney(summary.grossSales - summary.discounts)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Cost</span><strong>{compactMoney(summary.totalCost)}</strong></div>
              <div className="h-px bg-slate-100" />
              <div className="flex justify-between text-base"><span className="font-semibold">Profit / loss</span><strong className={moneyTone(summary.grossProfit)}>{compactMoney(summary.grossProfit)}</strong></div>
            </div>
          </div>

          <div className="rounded-xl border border-white bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600">Best Product</p>
            {bestProduct ? (
              <div className="mt-3">
                <h3 className="text-lg font-semibold">{bestProduct.productName}</h3>
                <p className="text-sm font-semibold text-slate-500">{bestProduct.categoryName || 'Uncategorized'}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Qty</p><p className="text-lg font-semibold">{bestProduct.totalQuantitySold}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Sales</p><p className="text-lg font-semibold text-indigo-700">{compactMoney(bestProduct.totalRevenue)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Cost</p><p className="text-lg font-semibold">{compactMoney(bestProduct.totalCost)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Profit</p><p className={`text-lg font-semibold ${moneyTone(bestProduct.grossProfit)}`}>{compactMoney(bestProduct.grossProfit)}</p></div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-slate-500">No product sales in this range.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest Matching Sale</p>
            {selectedSale ? (
              <div className="mt-3 text-sm">
                <h3 className="text-lg font-semibold text-indigo-700">{selectedSale.invoiceNumber}</h3>
                <p className="font-semibold text-slate-500">{formatDateTime(selectedSale.saleDate)}</p>
                <p className="mt-3 font-semibold">{selectedSale.customerName || 'Walk-in customer'}</p>
                <p className="text-slate-500">{selectedSale.cashierName} · {selectedSale.paymentStatus}</p>
                <p className="mt-3 rounded-xl bg-slate-50 p-3 font-semibold text-slate-700">{selectedSale.itemSummary || 'No item summary available.'}</p>
                <div className="mt-4 grid gap-2">
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Total</span><strong>{compactMoney(selectedSale.netTotal)}</strong></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Collected</span><strong className="text-emerald-700">{compactMoney(selectedSale.collectedAmount ?? Math.max(0, selectedSale.paidAmount - selectedSale.changeAmount))}</strong></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Due</span><strong className={selectedSale.amountDue > 0 ? 'text-rose-700' : 'text-slate-500'}>{compactMoney(selectedSale.amountDue)}</strong></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-500">Profit</span><strong className={moneyTone(selectedSale.grossProfit)}>{compactMoney(selectedSale.grossProfit)}</strong></div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-slate-500">No matching sale selected.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

