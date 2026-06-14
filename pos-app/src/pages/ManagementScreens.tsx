import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  Boxes,
  CheckCircle2,
  CreditCard,
  Database,
  LockKeyhole,
  Package,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Shield,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wrench
} from 'lucide-react'
import type { Category, DebtSummary, Product, User } from '../../shared/types'

type ServiceResponse<T> = {
  success?: boolean
  message?: string
  data?: T
}

type Notice = {
  tone: 'success' | 'error' | 'info'
  text: string
}

const currency = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' })

function unwrap<T>(response: any, fallback: T): T {
  if (Array.isArray(response)) return response as T
  if (response?.data !== undefined) return response.data as T
  return fallback
}

function isSuccess(response: any) {
  return response?.success !== false
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'indigo'
}: {
  label: string
  value: string | number
  icon: typeof Package
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan'
}) {
  const tones = {
    indigo: 'from-indigo-50 text-indigo-700 bg-indigo-100',
    emerald: 'from-emerald-50 text-emerald-700 bg-emerald-100',
    amber: 'from-amber-50 text-amber-700 bg-amber-100',
    rose: 'from-rose-50 text-rose-700 bg-rose-100',
    cyan: 'from-cyan-50 text-cyan-700 bg-cyan-100'
  }

  return (
    <div className={`rounded-3xl border border-white bg-gradient-to-br ${tones[tone].split(' ')[0]} to-white p-5 shadow-xl`}>
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone].split(' ').slice(1).join(' ')}`}>
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-500">{label}</p>
          <p className="text-2xl font-black text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  )
}

function NoticeBar({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null

  return (
    <div
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold ${
        notice.tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : notice.tone === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-800'
            : 'border-indigo-200 bg-indigo-50 text-indigo-800'
      }`}
    >
      {notice.text}
      <button onClick={onClose} className="rounded-lg px-2 py-1 hover:bg-black/5">
        Close
      </button>
    </div>
  )
}

export function ProductsScreen({ userId }: { userId: number }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState({
    productName: '',
    categoryId: 1,
    brand: '',
    purchasePrice: 0,
    sellingPrice: 0,
    stockQuantity: 0,
    reorderLevel: 10,
    isActive: true
  })

  const load = useCallback(async () => {
    const [productResponse, categoryResponse] = await Promise.all([
      window.api?.getStockProducts?.() ?? window.api?.getProducts?.(),
      window.api?.getCategories?.()
    ])
    const nextCategories = unwrap<Category[]>(categoryResponse, [])
    setProducts(unwrap<Product[]>(productResponse, []))
    setCategories(nextCategories)
    setForm((current) => ({
      ...current,
      categoryId: current.categoryId || nextCategories[0]?.categoryId || 1
    }))
  }, [])

  useEffect(() => {
    load().catch((error) => setNotice({ tone: 'error', text: error.message }))
  }, [load])

  const filtered = products.filter((product) =>
    [product.productName, product.brand, product.categoryName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query.toLowerCase()))
  )

  const activeProducts = products.filter((product) => product.isActive)
  const inactiveProducts = products.filter((product) => !product.isActive)
  const lowStock = activeProducts.filter((product) => product.stockQuantity <= product.reorderLevel).length
  const selectedCategoryName =
    categories.find((category) => category.categoryId === form.categoryId)?.categoryName || 'Uncategorized'
  const previewMargin = form.sellingPrice > 0
    ? ((form.sellingPrice - form.purchasePrice) / form.sellingPrice) * 100
    : 0

  const openEdit = (product: Product) => {
    setEditing(product)
    setForm({
      productName: product.productName,
      categoryId: product.categoryId,
      brand: product.brand || '',
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      stockQuantity: product.stockQuantity,
      reorderLevel: product.reorderLevel,
      isActive: product.isActive
    })
  }

  const reset = () => {
    setEditing(null)
    setForm({
      productName: '',
      categoryId: categories[0]?.categoryId || 1,
      brand: '',
      purchasePrice: 0,
      sellingPrice: 0,
      stockQuantity: 0,
      reorderLevel: 10,
      isActive: true
    })
  }

  const save = async () => {
    if (!form.productName.trim()) {
      setNotice({ tone: 'error', text: 'Product name is required.' })
      return
    }
    if (!form.categoryId) {
      setNotice({ tone: 'error', text: 'Choose a category.' })
      return
    }
    if (form.purchasePrice < 0) {
      setNotice({ tone: 'error', text: 'Purchase price cannot be negative.' })
      return
    }
    if (form.sellingPrice <= 0) {
      setNotice({ tone: 'error', text: 'Selling price must be greater than 0.' })
      return
    }
    if (form.purchasePrice > form.sellingPrice) {
      setNotice({ tone: 'error', text: 'Selling price should be equal to or higher than purchase price.' })
      return
    }
    if (form.stockQuantity < 0) {
      setNotice({ tone: 'error', text: 'Stock cannot be negative.' })
      return
    }
    if (form.reorderLevel < 0) {
      setNotice({ tone: 'error', text: 'Reorder level cannot be negative.' })
      return
    }

    const request = {
      ...form,
      productName: form.productName.trim(),
      categoryId: Number(form.categoryId),
      brand: form.brand.trim() || undefined
    }
    const response = editing
      ? await window.api?.updateProduct?.({ ...request, productId: editing.productId }, userId)
      : await window.api?.createProduct?.(request, userId)

    if (!isSuccess(response)) {
      setNotice({ tone: 'error', text: response?.message || 'Product save failed.' })
      return
    }

    setNotice({ tone: 'success', text: response?.message || 'Product saved.' })
    reset()
    await load()
  }

  const deactivate = async (product: Product) => {
    if (!product.isActive) {
      setNotice({ tone: 'info', text: 'This product is already hidden from checkout.' })
      return
    }

    const response = await window.api?.deactivateProduct?.(product.productId, userId)
    setNotice({
      tone: isSuccess(response) ? 'success' : 'error',
      text: response?.message || 'Product deactivated.'
    })
    await load()
  }

  const activate = async (product: Product) => {
    if (product.isActive) {
      setNotice({ tone: 'info', text: 'This product is already active in checkout.' })
      return
    }

    const response = await window.api?.activateProduct?.(product.productId, userId)
    setNotice({
      tone: isSuccess(response) ? 'success' : 'error',
      text: response?.message || 'Product activated.'
    })
    await load()
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Products" value={products.length} icon={Package} />
        <StatCard label="Active" value={activeProducts.length} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Low Stock" value={lowStock} icon={AlertTriangle} tone="amber" />
        <StatCard label="Inactive" value={inactiveProducts.length} icon={ArchiveRestore} tone="rose" />
      </div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px] gap-4">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
            <h2 className="text-xl font-black">Product Management</h2>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 outline-none focus:border-indigo-400" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, brand, or category..." />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Prices</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((product) => (
                  <tr key={product.productId} className={`hover:bg-indigo-50/50 ${!product.isActive ? 'text-slate-400' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-black">{product.productName}</p>
                      <p className="text-xs font-semibold text-slate-500">{product.brand || 'No brand'}{product.isActive ? '' : ' · hidden from checkout'}</p>
                    </td>
                    <td className="px-4 py-3">{product.categoryName || product.categoryId}</td>
                    <td className="px-4 py-3">
                      <p className="font-black text-indigo-600">{currency.format(product.sellingPrice)}</p>
                      <p className="text-xs font-semibold text-slate-500">Cost {currency.format(product.purchasePrice)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${product.stockQuantity <= product.reorderLevel ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                        {product.stockQuantity}
                      </span>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Reorder at {product.reorderLevel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${product.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEdit(product)} className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold hover:bg-slate-50">Edit</button>
                        {product.isActive ? (
                          <button onClick={() => deactivate(product)} className="rounded-xl border border-rose-200 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-50">Deactivate</button>
                        ) : (
                          <button onClick={() => activate(product)} className="rounded-xl border border-emerald-200 px-3 py-1.5 font-bold text-emerald-700 hover:bg-emerald-50">Activate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-auto rounded-3xl border border-white bg-white p-5 shadow-xl">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black">
            <Plus className="h-5 w-5 text-indigo-600" />
            {editing ? 'Edit Product' : 'Add Product'}
          </h3>
          <div className="mb-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-cyan-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-indigo-500">Preview</p>
            <p className="mt-2 text-xl font-black text-slate-950">{form.productName || 'New product'}</p>
            <p className="text-sm font-semibold text-slate-500">{form.brand || 'Generic'} · {selectedCategoryName}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-slate-500">Sale Price</p>
                <p className="font-black text-indigo-600">{currency.format(form.sellingPrice || 0)}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-slate-500">Stock</p>
                <p className="font-black text-emerald-600">{form.stockQuantity || 0}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-slate-500">Margin</p>
                <p className={`font-black ${previewMargin >= 0 ? 'text-cyan-700' : 'text-rose-700'}`}>
                  {Number.isFinite(previewMargin) ? previewMargin.toFixed(1) : '0.0'}%
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-bold text-slate-600">
              Product name
              <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" placeholder="Example: Roundup Herbicide 1L" value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} />
            </label>
            <label className="grid gap-1.5 text-sm font-bold text-slate-600">
              Brand / supplier
              <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" placeholder="Example: Bayer, Syngenta, Local" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
            </label>
            <label className="grid gap-1.5 text-sm font-bold text-slate-600">
              Category
              <select className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: Number(event.target.value) })}>
                {categories.map((category) => (
                  <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm font-bold text-slate-600">
                Purchase price
                <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="0" step="0.01" placeholder="0.00" value={form.purchasePrice} onChange={(event) => setForm({ ...form, purchasePrice: Number(event.target.value) })} />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-600">
                Selling price
                <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="0" step="0.01" placeholder="0.00" value={form.sellingPrice} onChange={(event) => setForm({ ...form, sellingPrice: Number(event.target.value) })} />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-600">
                {editing ? 'Current stock' : 'Opening stock'}
                <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="0" step="1" placeholder="0" value={form.stockQuantity} onChange={(event) => setForm({ ...form, stockQuantity: Number(event.target.value) })} />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-600">
                Reorder level
                <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="0" step="1" placeholder="10" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: Number(event.target.value) })} />
              </label>
            </div>
            {editing && (
              <>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                  <span>
                    Active in checkout
                    <span className="block text-xs font-semibold text-slate-500">Inactive products stay in reports but cannot be sold.</span>
                  </span>
                  <input
                    className="h-5 w-5 accent-indigo-600"
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                  />
                </label>
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  Stock changes made here are saved as an inventory adjustment so stock history stays traceable.
                </p>
              </>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={save} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 font-black text-white">
                <Save className="h-4 w-4" />
                Save
              </button>
              <button onClick={reset} className="h-11 rounded-xl border border-slate-200 font-black">Clear</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function BackupScreen({ userId }: { userId: number }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [exporting, setExporting] = useState(false)

  const createBackup = async () => {
    setNotice(null)
    setBackingUp(true)
    try {
      if (!window.api?.createBackup) throw new Error('Backup service is not available in this desktop app.')
      const response = await window.api.createBackup(userId)
      if (isSuccess(response)) {
        setNotice({ tone: 'success', text: response?.message || 'Backup created successfully.' })
        return
      }
      setNotice({ tone: 'error', text: response?.message || 'Backup creation failed.' })
    } catch (error: any) {
      setNotice({ tone: 'error', text: error?.message || 'Backup creation failed.' })
    } finally {
      setBackingUp(false)
    }
  }

  const exportExcel = async () => {
    setNotice(null)
    setExporting(true)
    try {
      if (!window.api?.exportDataExcel) throw new Error('Excel export service is not available in this desktop app.')
      const response = await window.api.exportDataExcel()
      setNotice({
        tone: isSuccess(response) ? 'success' : response?.message?.includes('cancelled') ? 'info' : 'error',
        text: response?.message || 'Excel export finished.'
      })
    } catch (error: any) {
      setNotice({ tone: 'error', text: error?.message || 'Excel export failed.' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="grid w-full max-w-5xl grid-cols-2 gap-4">
          <div className="rounded-3xl border border-white bg-white p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                <ArchiveRestore className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-black text-slate-950">Manual Backup</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Save a verified copy of the full POS database in the backup folder.
                </p>
              </div>
            </div>
            <button onClick={createBackup} disabled={backingUp || exporting} className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-indigo-600 font-black text-white hover:bg-indigo-700 disabled:opacity-50">
              {backingUp ? 'Creating Backup...' : 'Create Manual Backup'}
            </button>
          </div>

          <div className="rounded-3xl border border-white bg-white p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Database className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-black text-slate-950">Excel Export</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Export sales, profit, inventory, customers, payments, and stock history into separate Excel sheets.
                </p>
              </div>
            </div>
            <button onClick={exportExcel} disabled={backingUp || exporting} className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-700 disabled:opacity-50">
              {exporting ? 'Exporting Excel...' : 'Export Excel File'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function StockScreen({ userId }: { userId: number }) {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')
  const [quantityChange, setQuantityChange] = useState(0)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
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
        <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 className="text-xl font-black">Stock Levels</h2>
              <p className="text-sm font-bold text-slate-500">{inactiveProducts.length} inactive SKU{inactiveProducts.length === 1 ? '' : 's'} hidden from checkout</p>
            </div>
            <input className="h-11 w-80 rounded-2xl border border-slate-200 bg-slate-50 px-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stock..." />
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
                      <p className="font-black">{product.productName}</p>
                      <p className="text-xs text-slate-500">{product.categoryName}{product.brand ? ` · ${product.brand}` : ''}{!product.isActive ? ' · hidden from checkout' : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-black">{product.stockQuantity}</td>
                    <td className="px-4 py-3 text-right font-bold">{compactMoney(product.purchasePrice)}</td>
                    <td className="px-4 py-3 text-right font-black text-amber-700">{compactMoney(stockCostOf(product))}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-700">{compactMoney(stockRetailValueOf(product))}</td>
                    <td className="px-4 py-3 text-right">{product.reorderLevel}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${!product.isActive ? 'bg-slate-100 text-slate-600' : product.stockQuantity === 0 ? 'bg-rose-100 text-rose-700' : product.stockQuantity <= product.reorderLevel ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {!product.isActive ? 'Inactive' : product.stockQuantity === 0 ? 'Out' : product.stockQuantity <= product.reorderLevel ? 'Low' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-3xl border border-white bg-white p-5 shadow-xl">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black"><Wrench className="h-5 w-5 text-indigo-600" />Stock Adjustment</h3>
          <div className="grid gap-3">
            <select className="h-11 rounded-xl border border-slate-200 px-3" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value ? Number(event.target.value) : '')}>
              <option value="">Choose product</option>
              {products.map((product) => <option key={product.productId} value={product.productId}>{product.productName}{product.isActive ? '' : ' (inactive)'}</option>)}
            </select>
            {selected && (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-slate-950">{selected.productName}</p>
                    <p className={selected.isActive ? 'text-emerald-700' : 'text-slate-500'}>{selected.isActive ? 'Active in checkout' : 'Inactive and hidden from checkout'}</p>
                  </div>
                  <span className="rounded-xl bg-white px-3 py-1 font-black text-slate-950">{selected.stockQuantity} units</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Unit cost</p>
                    <p className="text-sm font-black text-slate-950">{compactMoney(selected.purchasePrice)}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Stock cost</p>
                    <p className="text-sm font-black text-amber-700">{compactMoney(stockCostOf(selected))}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Retail value</p>
                    <p className="text-sm font-black text-indigo-700">{compactMoney(stockRetailValueOf(selected))}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2">
                    <p className="font-bold text-slate-500">Potential profit</p>
                    <p className={`text-sm font-black ${moneyTone(stockProfitPotentialOf(selected))}`}>{compactMoney(stockProfitPotentialOf(selected))}</p>
                  </div>
                </div>
              </div>
            )}
            <input className="h-11 rounded-xl border border-slate-200 px-3 disabled:bg-slate-100 disabled:text-slate-400" type="number" value={quantityChange} onChange={(event) => setQuantityChange(Number(event.target.value))} placeholder="+10 or -3" disabled={!!selected && !selected.isActive} />
            <textarea className="min-h-24 rounded-xl border border-slate-200 p-3 disabled:bg-slate-100 disabled:text-slate-400" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason is required for audit log..." disabled={!!selected && !selected.isActive} />
            {adjustmentPreview && (
              <div className={`rounded-xl border p-3 text-sm font-bold ${adjustmentPreview.nextStock < 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-cyan-200 bg-cyan-50 text-slate-700'}`}>
                <div className="flex justify-between gap-3"><span>New stock</span><strong>{adjustmentPreview.nextStock}</strong></div>
                <div className="flex justify-between gap-3"><span>Cost change</span><strong className={moneyTone(adjustmentPreview.costDelta)}>{compactMoney(adjustmentPreview.costDelta)}</strong></div>
                <div className="flex justify-between gap-3"><span>New stock cost</span><strong>{compactMoney(adjustmentPreview.nextCost)}</strong></div>
              </div>
            )}
            <button onClick={adjust} disabled={!!selected && !selected.isActive} className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Apply Adjustment</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={activateSelected} disabled={!selected || selected.isActive} className="h-11 rounded-xl border border-emerald-200 bg-emerald-50 font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Activate</button>
              <button onClick={deactivateSelected} disabled={!selected || !selected.isActive} className="h-11 rounded-xl border border-rose-200 bg-rose-50 font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">Deactivate</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

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

function dateOnly(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function formatDateTime(value: string) {
  return value ? new Date(value).toLocaleString() : ''
}

function moneyTone(value: number) {
  return value < 0 ? 'text-rose-700' : 'text-emerald-700'
}

function compactMoney(value: number) {
  return currency.format(Number(value || 0))
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100
}

function stockCostOf(product: Product) {
  return roundMoney(Number(product.stockCost ?? Number(product.purchasePrice || 0) * Number(product.stockQuantity || 0)))
}

function stockRetailValueOf(product: Product) {
  return roundMoney(Number(product.stockRetailValue ?? Number(product.sellingPrice || 0) * Number(product.stockQuantity || 0)))
}

function stockProfitPotentialOf(product: Product) {
  return roundMoney(Number(product.stockProfitPotential ?? stockRetailValueOf(product) - stockCostOf(product)))
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
      className={`h-10 rounded-xl px-4 text-sm font-black transition ${
        activeTab === tab ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between rounded-3xl border border-white bg-white p-5 shadow-xl">
        <div>
          <h2 className="text-xl font-black">Reports & Analytics</h2>
          <p className="text-sm font-semibold text-slate-500">
            Date range report from {from} to {to}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => setPreset(1)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 hover:bg-slate-50">Today</button>
          <button onClick={() => setPreset(7)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 hover:bg-slate-50">7 Days</button>
          <button onClick={() => setPreset(30)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 hover:bg-slate-50">30 Days</button>
          <input className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <button onClick={load} disabled={loading} className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:opacity-50">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={exportPdf} disabled={exporting || loading} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">
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
        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-xl">
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
                        <p className="font-black text-slate-950">{product.productName}</p>
                        <p className="text-xs font-semibold text-slate-500">{product.categoryName || 'Uncategorized'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{product.totalQuantitySold}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(product.grossRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{compactMoney(product.totalDiscount)}</td>
                      <td className="px-4 py-3 text-right font-black text-indigo-700">{compactMoney(product.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(product.totalCost)}</td>
                      <td className={`px-4 py-3 text-right font-black ${moneyTone(product.grossProfit)}`}>{compactMoney(product.grossProfit)}</td>
                      <td className={`px-4 py-3 text-right font-black ${moneyTone(product.grossProfit)}`}>{Number(product.profitMargin || 0).toFixed(1)}%</td>
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
                        <p className="font-black text-indigo-700">{sale.invoiceNumber}</p>
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
                      <td className="px-4 py-3 text-right font-black text-indigo-700">{compactMoney(sale.netTotal)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{compactMoney(sale.collectedAmount ?? Math.max(0, sale.paidAmount - sale.changeAmount))}</td>
                      <td className={`px-4 py-3 text-right font-black ${sale.amountDue > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{compactMoney(sale.amountDue)}</td>
                      <td className={`px-4 py-3 text-right font-black ${moneyTone(sale.grossProfit)}`}>{compactMoney(sale.grossProfit)}</td>
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
                      <td className="px-4 py-3 font-black">{day.date}</td>
                      <td className="px-4 py-3 text-right font-bold">{day.transactionCount}</td>
                      <td className="px-4 py-3 text-right font-bold">{day.itemsSold}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(day.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{compactMoney(day.totalDiscount)}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(day.totalTax)}</td>
                      <td className="px-4 py-3 text-right font-black text-indigo-700">{compactMoney(day.netRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold">{compactMoney(day.totalCost)}</td>
                      <td className={`px-4 py-3 text-right font-black ${moneyTone(day.grossProfit)}`}>{compactMoney(day.grossProfit)}</td>
                      <td className={`px-4 py-3 text-right font-black ${moneyTone(day.grossProfit)}`}>{Number(day.profitMargin || 0).toFixed(1)}%</td>
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
                      <td className="px-4 py-3 font-black">{cashier.cashierName}</td>
                      <td className="px-4 py-3 text-right font-bold">{cashier.transactionCount}</td>
                      <td className="px-4 py-3 text-right font-black text-indigo-700">{compactMoney(cashier.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{compactMoney(cashier.collectedAmount)}</td>
                      <td className={`px-4 py-3 text-right font-black ${cashier.outstandingAmount > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{compactMoney(cashier.outstandingAmount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{compactMoney(cashier.totalDiscount)}</td>
                      <td className={`px-4 py-3 text-right font-black ${moneyTone(cashier.grossProfit)}`}>{compactMoney(cashier.grossProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          <div className="rounded-3xl border border-white bg-white p-5 shadow-xl">
            <p className="text-xs font-black uppercase tracking-wide text-indigo-500">Range Insight</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">{Number(summary.margin || 0).toFixed(1)}% margin</h3>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Gross sales</span><strong>{compactMoney(summary.grossSales)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Discounts</span><strong className="text-amber-700">{compactMoney(summary.discounts)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Tax</span><strong>{compactMoney(summary.tax)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Net before cost</span><strong>{compactMoney(summary.grossSales - summary.discounts)}</strong></div>
              <div className="flex justify-between"><span className="font-semibold text-slate-500">Cost</span><strong>{compactMoney(summary.totalCost)}</strong></div>
              <div className="h-px bg-slate-100" />
              <div className="flex justify-between text-base"><span className="font-black">Profit / loss</span><strong className={moneyTone(summary.grossProfit)}>{compactMoney(summary.grossProfit)}</strong></div>
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white p-5 shadow-xl">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-600">Best Product</p>
            {bestProduct ? (
              <div className="mt-3">
                <h3 className="text-lg font-black">{bestProduct.productName}</h3>
                <p className="text-sm font-semibold text-slate-500">{bestProduct.categoryName || 'Uncategorized'}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Qty</p><p className="text-lg font-black">{bestProduct.totalQuantitySold}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Sales</p><p className="text-lg font-black text-indigo-700">{compactMoney(bestProduct.totalRevenue)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Cost</p><p className="text-lg font-black">{compactMoney(bestProduct.totalCost)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="font-bold text-slate-500">Profit</p><p className={`text-lg font-black ${moneyTone(bestProduct.grossProfit)}`}>{compactMoney(bestProduct.grossProfit)}</p></div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-slate-500">No product sales in this range.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-3xl border border-white bg-white p-5 shadow-xl">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Latest Matching Sale</p>
            {selectedSale ? (
              <div className="mt-3 text-sm">
                <h3 className="text-lg font-black text-indigo-700">{selectedSale.invoiceNumber}</h3>
                <p className="font-semibold text-slate-500">{formatDateTime(selectedSale.saleDate)}</p>
                <p className="mt-3 font-black">{selectedSale.customerName || 'Walk-in customer'}</p>
                <p className="text-slate-500">{selectedSale.cashierName} · {selectedSale.paymentStatus}</p>
                <p className="mt-3 rounded-2xl bg-slate-50 p-3 font-semibold text-slate-700">{selectedSale.itemSummary || 'No item summary available.'}</p>
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

export function DebtsScreen() {
  const [debts, setDebts] = useState<DebtSummary[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    const response = await window.api?.getCustomerDebts?.()
    if (response?.success === false) throw new Error(response.message || 'Could not load customer debts.')
    setDebts(unwrap<DebtSummary[]>(response, []))
  }, [])

  useEffect(() => {
    load().catch((error) => setNotice({ tone: 'error', text: error.message }))
  }, [load])

  const filtered = debts.filter((debt) =>
    [debt.customerId, debt.customerAccountNumber, debt.customerName, debt.customerFatherName, debt.customerPhone]
      .filter((value) => value !== undefined && value !== null)
      .some((value) => String(value).toLowerCase().includes(query.toLowerCase()))
  )
  const totalBill = debts.reduce((sum, debt) => sum + Number(debt.totalAmount || 0), 0)
  const totalPaid = debts.reduce((sum, debt) => sum + Number(debt.paidAmount || 0), 0)
  const totalDue = debts.reduce((sum, debt) => sum + Number(debt.amountToBePaid || 0), 0)
  const invoiceCount = debts.reduce((sum, debt) => sum + Number(debt.invoiceCount || 0), 0)

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Customers" value={debts.length} icon={Users} />
        <StatCard label="Open Bills" value={invoiceCount} icon={CreditCard} tone="amber" />
        <StatCard label="Total Bill" value={currency.format(totalBill)} icon={BarChart3} tone="cyan" />
        <StatCard label="To Be Paid" value={currency.format(totalDue)} icon={TrendingUp} tone="rose" />
      </div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-xl font-black">Customer Debts</h2>
            <p className="text-sm font-semibold text-slate-500">{currency.format(totalPaid)} collected against pending bills</p>
          </div>
          <div className="flex gap-2">
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 outline-none focus:border-indigo-400"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customer, account, phone..."
              />
            </div>
            <button onClick={load} className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 font-black text-white">
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Account</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3 text-right">Bills</th>
                <th className="px-5 py-3 text-right">Total Amount</th>
                <th className="px-5 py-3 text-right">Collected</th>
                <th className="px-5 py-3 text-right">Amount To Be Paid</th>
                <th className="px-5 py-3">Last Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-slate-500" colSpan={7}>No outstanding customer debts found.</td>
                </tr>
              ) : filtered.map((debt) => {
                const accountLabel = debt.customerAccountNumber || `#${debt.customerId}`
                return (
                  <tr key={debt.customerId} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-black text-indigo-700">{accountLabel}</p>
                      <p className="text-xs font-semibold text-slate-400">Customer #{debt.customerId}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950">{debt.customerName}</p>
                      {debt.customerFatherName && <p className="text-xs font-semibold text-slate-500">Father: {debt.customerFatherName}</p>}
                      {debt.customerPhone && <p className="text-xs font-semibold text-slate-500">{debt.customerPhone}</p>}
                    </td>
                    <td className="px-5 py-4 text-right font-bold">{debt.invoiceCount}</td>
                    <td className="px-5 py-4 text-right font-bold">{currency.format(debt.totalAmount)}</td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-700">{currency.format(debt.paidAmount)}</td>
                    <td className="px-5 py-4 text-right text-lg font-black text-rose-700">{currency.format(debt.amountToBePaid)}</td>
                    <td className="px-5 py-4 font-semibold text-slate-600">{debt.lastSaleDate ? new Date(debt.lastSaleDate).toLocaleString() : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export function UsersScreen({ userId }: { userId: number }) {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [form, setForm] = useState({ username: '', plainPassword: '', fullName: '', roleId: 0 })

  const load = useCallback(async () => {
    const [userResponse, roleResponse] = await Promise.all([
      window.api?.getUsers?.(),
      window.api?.getRoles?.()
    ])
    const allowedRoles = unwrap<any[]>(roleResponse, []).filter((role) =>
      ['Admin', 'Cashier'].includes(String(role.RoleName ?? role.roleName))
    )
    const cashierRole = allowedRoles.find((role) => String(role.RoleName ?? role.roleName) === 'Cashier')
    setUsers(unwrap<User[]>(userResponse, []))
    setRoles(allowedRoles)
    setForm((current) => ({
      ...current,
      roleId: current.roleId || cashierRole?.RoleID || cashierRole?.roleId || allowedRoles[0]?.RoleID || allowedRoles[0]?.roleId || 0
    }))
  }, [])

  useEffect(() => { load().catch((error) => setNotice({ tone: 'error', text: error.message })) }, [load])

  const create = async () => {
    if (!form.username || !form.plainPassword || !form.fullName) {
      setNotice({ tone: 'error', text: 'Username, full name, and password are required.' })
      return
    }
    if (!form.roleId) {
      setNotice({ tone: 'error', text: 'Choose Admin or Cashier role.' })
      return
    }
    const response = await window.api?.createUser?.(form, userId)
    setNotice({ tone: isSuccess(response) ? 'success' : 'error', text: response?.message || 'User saved.' })
    if (isSuccess(response)) {
      const cashierRole = roles.find((role) => String(role.RoleName ?? role.roleName) === 'Cashier')
      setForm({
        username: '',
        plainPassword: '',
        fullName: '',
        roleId: cashierRole?.RoleID || cashierRole?.roleId || roles[0]?.RoleID || roles[0]?.roleId || 0
      })
    }
    await load()
  }

  const unlock = async (targetId: number) => {
    const response = await window.api?.unlockUser?.(targetId, userId)
    setNotice({ tone: isSuccess(response) ? 'success' : 'error', text: response?.message || 'User unlocked.' })
    await load()
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Users" value={users.length} icon={Users} />
        <StatCard label="Active" value={users.filter((u) => u.status === 'Active').length} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Locked" value={users.filter((u) => u.status === 'Locked').length} icon={LockKeyhole} tone="rose" />
        <StatCard label="Roles" value={roles.length} icon={Shield} tone="cyan" />
      </div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-xl">
          <h2 className="border-b border-slate-100 p-5 text-xl font-black">User Management</h2>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.userId}>
                    <td className="px-4 py-3"><p className="font-black">{user.fullName}</p><p className="text-xs text-slate-500">{user.username}</p></td>
                    <td className="px-4 py-3">{user.roleName}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${user.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : user.status === 'Locked' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{user.status}</span></td>
                    <td className="px-4 py-3">{user.status === 'Locked' && <button onClick={() => unlock(user.userId)} className="rounded-xl border border-emerald-200 px-3 py-1.5 font-bold text-emerald-700">Unlock</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-3xl border border-white bg-white p-5 shadow-xl">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-black"><UserPlus className="h-5 w-5 text-indigo-600" />Create User</h3>
          <div className="grid gap-3">
            <input className="h-11 rounded-xl border border-slate-200 px-3" placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            <input className="h-11 rounded-xl border border-slate-200 px-3" placeholder="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
            <input className="h-11 rounded-xl border border-slate-200 px-3" type="password" placeholder="Temporary password" value={form.plainPassword} onChange={(event) => setForm({ ...form, plainPassword: event.target.value })} />
            <select className="h-11 rounded-xl border border-slate-200 px-3" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: Number(event.target.value) })}>
              {roles.map((role) => <option key={role.RoleID ?? role.roleId} value={role.RoleID ?? role.roleId}>{role.RoleName ?? role.roleName}</option>)}
            </select>
            <button onClick={create} className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 font-black text-white">Create User</button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SettingsScreen({ userId }: { userId: number }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [backups, setBackups] = useState<any[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [saving, setSaving] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [verifyingPath, setVerifyingPath] = useState('')
  const filledSettings = {
    ShopName: 'SecureStore POS',
    ShopAddress: 'Store address',
    ShopPhone: '',
    ShopEmail: '',
    Currency: 'PKR',
    CurrencySymbol: 'Rs',
    TaxPercent: '0',
    SessionTimeoutMinutes: '30',
    CashierMaxDiscountPercent: '5',
    BackupFolderPath: 'Backups',
    AutoBackupEnabled: 'true',
    BackupRetentionDays: '30',
    MinimumDataRetentionDays: '365',
    LowStockThreshold: '10',
    ReceiptHeaderMessage: 'Original sale receipt',
    ReceiptFooterMessage: 'Thank you for shopping with us!',
    ReceiptShowPhone: 'true',
    ReceiptShowAddress: 'true',
    InvoicePrefix: 'POS',
    ...settings
  }

  const load = useCallback(async () => {
    setSettings(unwrap<Record<string, string>>(await window.api?.getSettings?.(), {}))
    setBackups(unwrap<any[]>(await window.api?.getBackupHistory?.(), []))
  }, [])

  useEffect(() => { load().catch((error) => setNotice({ tone: 'error', text: error.message })) }, [load])

  const update = (key: string, value: string) => setSettings((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    if (!filledSettings.ShopName.trim() || !filledSettings.ShopAddress.trim() || !filledSettings.ShopPhone.trim()) {
      setNotice({ tone: 'error', text: 'Shop name, address, and phone are required.' })
      return
    }
    if (filledSettings.ShopEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(filledSettings.ShopEmail)) {
      setNotice({ tone: 'error', text: 'Enter a valid shop email or leave it blank.' })
      return
    }
    if (Number(filledSettings.TaxPercent) < 0 || Number(filledSettings.TaxPercent) > 100) {
      setNotice({ tone: 'error', text: 'Tax percent must be between 0 and 100.' })
      return
    }
    const backupRetentionDays = Number(filledSettings.BackupRetentionDays)
    if (!Number.isInteger(backupRetentionDays) || backupRetentionDays < 7 || backupRetentionDays > 3650) {
      setNotice({ tone: 'error', text: 'Backup retention must be between 7 and 3650 days.' })
      return
    }
    setSaving(true)
    const response = await window.api?.updateSettings?.(filledSettings, userId)
    setSaving(false)
    setNotice({ tone: isSuccess(response) ? 'success' : 'error', text: response?.message || 'Settings saved.' })
    if (isSuccess(response)) await load()
  }

  const backup = async () => {
    setBackingUp(true)
    const response = await window.api?.createBackup?.(userId)
    setBackingUp(false)
    setNotice({ tone: isSuccess(response) ? 'success' : 'error', text: response?.message || 'Backup finished.' })
    await load()
  }

  const verifyBackup = async (backupPath: string) => {
    if (!backupPath) return
    setVerifyingPath(backupPath)
    const response = await window.api?.verifyBackup?.(backupPath)
    setVerifyingPath('')
    setNotice({ tone: isSuccess(response) ? 'success' : 'error', text: response?.message || 'Backup verification completed.' })
    await load()
  }

  const restoreBackup = async (backupPath: string) => {
    if (!backupPath) return
    const confirmed = window.confirm('Restore this backup? The app will first create a safety backup of the current database. Restart the app after restore before taking new sales.')
    if (!confirmed) return
    setRestoring(true)
    const response = await window.api?.restoreBackup?.(backupPath, userId)
    setRestoring(false)
    setNotice({ tone: isSuccess(response) ? 'success' : 'error', text: response?.message || 'Restore completed.' })
    await load()
  }

  const restoreFromFile = async () => {
    const confirmed = window.confirm('Select and restore a backup file? The app will verify the file and create a safety backup first.')
    if (!confirmed) return
    setRestoring(true)
    const response = await window.api?.restoreBackupFromFile?.(userId)
    setRestoring(false)
    setNotice({ tone: isSuccess(response) ? 'success' : 'error', text: response?.message || 'Restore completed.' })
    await load()
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 p-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px] gap-4">
        <div className="min-h-0 overflow-auto rounded-3xl border border-white bg-white p-5 shadow-xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black"><Settings className="h-5 w-5 text-indigo-600" />Store Settings</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">These values are used on receipts, checkout tax, backups, and admin controls.</p>
            </div>
            <button onClick={save} disabled={saving} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-5 font-black text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          <div className="grid gap-5">
            <div className="rounded-2xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-black text-slate-950">Store Identity</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Shop name
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" value={filledSettings.ShopName} onChange={(event) => update('ShopName', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Phone
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" value={filledSettings.ShopPhone} onChange={(event) => update('ShopPhone', event.target.value)} />
                </label>
                <label className="col-span-2 grid gap-2 text-sm font-bold text-slate-600">
                  Address
                  <textarea className="min-h-20 rounded-xl border border-slate-200 p-3 font-semibold text-slate-950" value={filledSettings.ShopAddress} onChange={(event) => update('ShopAddress', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Email
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" value={filledSettings.ShopEmail} onChange={(event) => update('ShopEmail', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Invoice prefix
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold uppercase text-slate-950" maxLength={12} value={filledSettings.InvoicePrefix} onChange={(event) => update('InvoicePrefix', event.target.value.toUpperCase())} />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-black text-slate-950">Receipt Customization</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Header message
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" value={filledSettings.ReceiptHeaderMessage} onChange={(event) => update('ReceiptHeaderMessage', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Footer message
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" value={filledSettings.ReceiptFooterMessage} onChange={(event) => update('ReceiptFooterMessage', event.target.value)} />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={filledSettings.ReceiptShowAddress !== 'false'} onChange={(event) => update('ReceiptShowAddress', String(event.target.checked))} />
                  Show address on receipt
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={filledSettings.ReceiptShowPhone !== 'false'} onChange={(event) => update('ReceiptShowPhone', String(event.target.checked))} />
                  Show phone on receipt
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-black text-slate-950">Operations</h3>
              <div className="grid grid-cols-3 gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Currency
                  <input className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold text-slate-500" value="PKR" readOnly />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Tax percent
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="0" max="100" step="0.01" value={filledSettings.TaxPercent} onChange={(event) => update('TaxPercent', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Cashier max discount %
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="0" max="100" step="0.01" value={filledSettings.CashierMaxDiscountPercent} onChange={(event) => update('CashierMaxDiscountPercent', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Session timeout minutes
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="5" max="480" step="1" value={filledSettings.SessionTimeoutMinutes} onChange={(event) => update('SessionTimeoutMinutes', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Low stock threshold
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="0" step="1" value={filledSettings.LowStockThreshold} onChange={(event) => update('LowStockThreshold', event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Data retention days
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="365" step="1" value={filledSettings.MinimumDataRetentionDays} onChange={(event) => update('MinimumDataRetentionDays', event.target.value)} />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-black text-slate-950">Backup</h3>
              <div className="grid grid-cols-[1fr_auto_180px] gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Backup folder
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" value={filledSettings.BackupFolderPath} onChange={(event) => update('BackupFolderPath', event.target.value)} />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={filledSettings.AutoBackupEnabled === 'true'} onChange={(event) => update('AutoBackupEnabled', String(event.target.checked))} />
                  Auto backup
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-600">
                  Keep auto backups
                  <input className="h-11 rounded-xl border border-slate-200 px-3 font-semibold text-slate-950" type="number" min="7" max="3650" step="1" value={filledSettings.BackupRetentionDays} onChange={(event) => update('BackupRetentionDays', event.target.value)} />
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-3xl border border-white bg-white p-5 shadow-xl">
          <h3 className="mb-4 text-lg font-black">Receipt Preview</h3>
          <div className="rounded-2xl border border-slate-200 p-4 text-sm">
            <div className="border-b border-slate-100 pb-3 text-center">
              <p className="text-lg font-black text-slate-950">{filledSettings.ShopName}</p>
              {filledSettings.ReceiptHeaderMessage && <p className="font-semibold text-slate-500">{filledSettings.ReceiptHeaderMessage}</p>}
              {filledSettings.ReceiptShowAddress !== 'false' && <p className="font-semibold text-slate-500">{filledSettings.ShopAddress}</p>}
              {filledSettings.ReceiptShowPhone !== 'false' && <p className="font-semibold text-slate-500">{filledSettings.ShopPhone}</p>}
            </div>
            <div className="grid gap-2 py-3">
              <div className="flex justify-between"><span>Invoice</span><strong>{filledSettings.InvoicePrefix}-20260521-000001</strong></div>
              <div className="flex justify-between"><span>Sample product</span><strong>{currency.format(1250)}</strong></div>
              <div className="flex justify-between"><span>Tax ({filledSettings.TaxPercent}%)</span><strong>{currency.format(1250 * (Number(filledSettings.TaxPercent) / 100))}</strong></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base"><span className="font-black">Total</span><strong>{currency.format(1250 + 1250 * (Number(filledSettings.TaxPercent) / 100))}</strong></div>
            </div>
            {filledSettings.ReceiptFooterMessage && <p className="rounded-xl bg-slate-50 p-3 text-center font-bold text-slate-600">{filledSettings.ReceiptFooterMessage}</p>}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-xl">
          <div className="border-b border-slate-100 p-5">
            <h3 className="flex items-center gap-2 text-lg font-black"><Database className="h-5 w-5 text-cyan-600" />Backup & Recovery</h3>
            <button onClick={backup} disabled={backingUp || restoring} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 font-black text-white disabled:opacity-50">
              <ArchiveRestore className="h-4 w-4" /> {backingUp ? 'Creating Backup...' : 'Create Manual Backup'}
            </button>
            <button onClick={restoreFromFile} disabled={backingUp || restoring} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-black text-slate-900 disabled:opacity-50">
              <ArchiveRestore className="h-4 w-4" /> {restoring ? 'Restoring...' : 'Restore From Backup File'}
            </button>
            <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              Backups are verified with SQLite integrity checks and SHA-256 checksums. Restore creates a safety backup first.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {backups.length === 0 ? <p className="text-sm font-semibold text-slate-500">No backups logged yet.</p> : backups.map((backupRow) => (
              <div key={backupRow.BackupID ?? backupRow.backupId} className="mb-3 rounded-2xl border border-slate-100 p-3">
                <p className="truncate font-black">{backupRow.BackupPath ?? backupRow.backupPath}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {backupRow.BackupDate ?? backupRow.backupDate} · {backupRow.Status ?? backupRow.status}
                  {(backupRow.IsAutomatic ?? backupRow.isAutomatic) ? ' · Automatic' : ' · Manual'}
                </p>
                {(backupRow.ChecksumSha256 ?? backupRow.checksumSha256) && (
                  <p className="mt-1 truncate text-xs font-semibold text-slate-400">SHA-256: {backupRow.ChecksumSha256 ?? backupRow.checksumSha256}</p>
                )}
                {(backupRow.LastRestoredAt ?? backupRow.lastRestoredAt) && (
                  <p className="mt-1 text-xs font-bold text-emerald-700">Restored: {backupRow.LastRestoredAt ?? backupRow.lastRestoredAt}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => verifyBackup(backupRow.BackupPath ?? backupRow.backupPath)} disabled={verifyingPath === (backupRow.BackupPath ?? backupRow.backupPath) || restoring} className="h-9 rounded-xl border border-slate-200 text-xs font-black text-slate-700 disabled:opacity-50">
                    {verifyingPath === (backupRow.BackupPath ?? backupRow.backupPath) ? 'Checking...' : 'Verify'}
                  </button>
                  <button onClick={() => restoreBackup(backupRow.BackupPath ?? backupRow.backupPath)} disabled={(backupRow.Status ?? backupRow.status) !== 'Success' || restoring || backingUp} className="h-9 rounded-xl bg-amber-500 text-xs font-black text-white disabled:opacity-50">
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </section>
  )
}
