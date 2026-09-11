import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, CreditCard, Package, TrendingDown, TrendingUp, Wrench } from 'lucide-react'
import type { Product } from '../../../shared/types'

import { useAsyncAction, Notice, unwrap, isSuccess, StatCard, NoticeBar, moneyTone, compactMoney, stockCostOf, stockRetailValueOf, stockProfitPotentialOf } from './shared'

export function StockScreen({ userId }: { userId: number }) {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')
  const [quantityChange, setQuantityChange] = useState(0)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const { run, busy } = useAsyncAction(setNotice)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    const response = await (window.api?.getStockProducts?.() ?? window.api?.getProducts?.())
    setProducts(unwrap<Product[]>(response, []))
  }, [])

  useEffect(() => {
    load().catch((error) => setNotice({ tone: 'error', text: error.message }))
  }, [load])

  const filtered = products.filter((product) =>
    [product.productName, product.brand, product.categoryName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query.toLowerCase()))
  )
  const selected = products.find((product) => product.productId === selectedProductId)
  const activeProducts = products.filter((product) => product.isActive)
  const inactiveProducts = products.filter((product) => !product.isActive)
  const stockSummary = useMemo(() => {
    return activeProducts.reduce(
      (summary, product) => ({
        units: summary.units + Number(product.stockQuantity || 0),
        totalCost: summary.totalCost + stockCostOf(product),
        retailValue: summary.retailValue + stockRetailValueOf(product),
        potentialProfit: summary.potentialProfit + stockProfitPotentialOf(product)
      }),
      { units: 0, totalCost: 0, retailValue: 0, potentialProfit: 0 }
    )
  }, [activeProducts])
  const adjustmentPreview = selected && quantityChange !== 0
    ? {
        nextStock: selected.stockQuantity + quantityChange,
        costDelta: quantityChange * Number(selected.purchasePrice || 0),
        nextCost: (selected.stockQuantity + quantityChange) * Number(selected.purchasePrice || 0)
      }
    : null

  const adjust = async () => {
    if (!selected) {
      setNotice({ tone: 'error', text: 'Choose a product before applying a stock adjustment.' })
      return
    }
    if (quantityChange === 0) {
      setNotice({ tone: 'error', text: 'Enter a non-zero quantity, for example +10 or -3.' })
      return
    }
    if (!reason.trim()) {
      setNotice({ tone: 'error', text: 'Provide a reason for the stock adjustment.' })
      return
    }
    if (reason.trim().length < 3) {
      setNotice({ tone: 'error', text: 'Reason must be at least 3 characters.' })
      return
    }
    if (!selected.isActive) {
      setNotice({ tone: 'error', text: 'Inactive products are removed from checkout and cannot be adjusted.' })
      return
    }

    const response = await window.api?.adjustStock?.({
      productId: selected.productId,
      quantityChange,
      reason,
      userId
    })

    setNotice({
      tone: isSuccess(response) ? 'success' : 'error',
      text: response?.message || 'Stock adjustment completed.'
    })
    setQuantityChange(0)
    setReason('')
    await load()
  }

  const deactivateSelected = async () => {
    if (!selected) {
      setNotice({ tone: 'error', text: 'Select a product before deactivating it.' })
      return
    }
    if (!selected.isActive) {
      setNotice({ tone: 'info', text: 'This product is already inactive and hidden from checkout.' })
      return
    }

    const response = await window.api?.deactivateProduct?.(selected.productId, userId)
    setNotice({
      tone: isSuccess(response) ? 'success' : 'error',
      text: response?.message || 'Product deactivated.'
    })
    await load()
  }

  const activateSelected = async () => {
    if (!selected) {
      setNotice({ tone: 'error', text: 'Select a product before activating it.' })
      return
    }
    if (selected.isActive) {
      setNotice({ tone: 'info', text: 'This product is already active in checkout.' })
      return
    }

    const response = await window.api?.activateProduct?.(selected.productId, userId)
    setNotice({
      tone: isSuccess(response) ? 'success' : 'error',
      text: response?.message || 'Product activated.'
    })
    await load()
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="All SKUs" value={products.length} icon={Boxes} />
        <StatCard label="Active Units" value={stockSummary.units} icon={TrendingDown} tone="cyan" />
        <StatCard label="Stock Cost" value={compactMoney(stockSummary.totalCost)} icon={Package} tone="amber" />
        <StatCard label="Retail Value" value={compactMoney(stockSummary.retailValue)} icon={CreditCard} />
        <StatCard label="Potential Profit" value={compactMoney(stockSummary.potentialProfit)} icon={TrendingUp} tone={stockSummary.potentialProfit < 0 ? 'rose' : 'emerald'} />
      </div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] gap-4">
        <div className="overflow-hidden rounded-xl border border-white bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 className="text-xl font-semibold">Stock Levels</h2>
              <p className="text-sm font-bold text-slate-500">{inactiveProducts.length} inactive SKU{inactiveProducts.length === 1 ? '' : 's'} hidden from checkout</p>
            </div>
            <input className="h-11 w-80 rounded-xl border border-slate-200 bg-slate-50 px-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stock..." />
          </div>
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Stock Cost</th>
                  <th className="px-4 py-3 text-right">Retail Value</th>
                  <th className="px-4 py-3 text-right">Reorder</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((product) => (
                  <tr
                    key={product.productId}
                    onClick={() => setSelectedProductId(product.productId)}
                    className={`cursor-pointer hover:bg-cyan-50 ${selectedProductId === product.productId ? 'bg-cyan-50' : ''} ${!product.isActive ? 'text-slate-400' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{product.productName}</p>
                      <p className="text-xs text-slate-500">{product.categoryName}{product.brand ? ` · ${product.brand}` : ''}{!product.isActive ? ' · hidden from checkout' : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{product.stockQuantity}</td>
                    <td className="px-4 py-3 text-right font-bold">{compactMoney(product.purchasePrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">{compactMoney(stockCostOf(product))}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-700">{compactMoney(stockRetailValueOf(product))}</td>
                    <td className="px-4 py-3 text-right">{product.reorderLevel}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${!product.isActive ? 'bg-slate-100 text-slate-600' : product.stockQuantity === 0 ? 'bg-rose-100 text-rose-700' : product.stockQuantity <= product.reorderLevel ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {!product.isActive ? 'Inactive' : product.stockQuantity === 0 ? 'Out' : product.stockQuantity <= product.reorderLevel ? 'Low' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-xl border border-white bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Wrench className="h-5 w-5 text-indigo-600" />Stock Adjustment</h3>
          <div className="grid gap-3">
            <select className="h-11 rounded-xl border border-slate-200 px-3" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value ? Number(event.target.value) : '')}>
              <option value="">Choose product</option>
              {products.map((product) => <option key={product.productId} value={product.productId}>{product.productName}{product.isActive ? '' : ' (inactive)'}</option>)}
            </select>
            {selected && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-slate-950">{selected.productName}</p>
                    <p className={selected.isActive ? 'text-emerald-700' : 'text-slate-500'}>{selected.isActive ? 'Active in checkout' : 'Inactive and hidden from checkout'}</p>
                  </div>
                  <span className="rounded-xl bg-white px-3 py-1 font-semibold text-slate-950">{selected.stockQuantity} units</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Unit cost</p>
                    <p className="text-sm font-semibold text-slate-950">{compactMoney(selected.purchasePrice)}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Stock cost</p>
                    <p className="text-sm font-semibold text-amber-700">{compactMoney(stockCostOf(selected))}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Retail value</p>
                    <p className="text-sm font-semibold text-indigo-700">{compactMoney(stockRetailValueOf(selected))}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Potential profit</p>
                    <p className={`text-sm font-semibold ${moneyTone(stockProfitPotentialOf(selected))}`}>{compactMoney(stockProfitPotentialOf(selected))}</p>
                  </div>
                </div>
              </div>
            )}
            <input className="h-11 rounded-xl border border-slate-200 px-3 disabled:bg-slate-100 disabled:text-slate-400" type="number" value={quantityChange} onChange={(event) => setQuantityChange(Number(event.target.value))} placeholder="+10 or -3" disabled={busy || !selected || !selected.isActive} />
            <textarea className="min-h-24 rounded-xl border border-slate-200 p-3 disabled:bg-slate-100 disabled:text-slate-400" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason is required for audit log..." disabled={busy || !selected || !selected.isActive} />
            {adjustmentPreview && (
              <div className={`rounded-xl border p-3 text-sm font-bold ${adjustmentPreview.nextStock < 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-cyan-200 bg-cyan-50 text-slate-700'}`}>
                <div className="flex justify-between gap-3"><span>New stock</span><strong>{adjustmentPreview.nextStock}</strong></div>
                <div className="flex justify-between gap-3"><span>Cost change</span><strong className={moneyTone(adjustmentPreview.costDelta)}>{compactMoney(adjustmentPreview.costDelta)}</strong></div>
                <div className="flex justify-between gap-3"><span>New stock cost</span><strong>{compactMoney(adjustmentPreview.nextCost)}</strong></div>
              </div>
            )}
            <button onClick={() => { void run(adjust) }} disabled={busy || !selected || !selected.isActive} className="h-11 rounded-xl bg-indigo-600 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Apply Adjustment</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { void run(activateSelected) }} disabled={busy || !selected || selected.isActive} className="h-11 rounded-xl border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Activate</button>
              <button onClick={() => { void run(deactivateSelected) }} disabled={busy || !selected || !selected.isActive} className="h-11 rounded-xl border border-rose-200 bg-rose-50 font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">Deactivate</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

