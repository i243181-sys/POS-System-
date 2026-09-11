import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArchiveRestore, CheckCircle2, Package, Plus, Save, Search } from 'lucide-react'
import type { Category, Product } from '../../../shared/types'

import { useAsyncAction, Notice, currency, unwrap, isSuccess, StatCard, NoticeBar } from './shared'

export function ProductsScreen({ userId }: { userId: number }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const { run, busy } = useAsyncAction(setNotice)
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
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
            <h2 className="text-xl font-semibold">Product Management</h2>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 outline-none focus:border-indigo-400" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, brand, or category..." />
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
                      <p className="font-semibold">{product.productName}</p>
                      <p className="text-xs font-semibold text-slate-500">{product.brand || 'No brand'}{product.isActive ? '' : ' · hidden from checkout'}</p>
                    </td>
                    <td className="px-4 py-3">{product.categoryName || product.categoryId}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-indigo-600">{currency.format(product.sellingPrice)}</p>
                      <p className="text-xs font-semibold text-slate-500">Cost {currency.format(product.purchasePrice)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.stockQuantity <= product.reorderLevel ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                        {product.stockQuantity}
                      </span>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Reorder at {product.reorderLevel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEdit(product)} className="rounded-xl border border-slate-200 px-3 py-1.5 font-bold hover:bg-slate-50">Edit</button>
                        {product.isActive ? (
                          <button disabled={busy} onClick={() => { void run(() => deactivate(product)) }} className="rounded-xl border border-rose-200 px-3 py-1.5 font-bold text-rose-700 hover:bg-rose-50">Deactivate</button>
                        ) : (
                          <button disabled={busy} onClick={() => { void run(() => activate(product)) }} className="rounded-xl border border-emerald-200 px-3 py-1.5 font-bold text-emerald-700 hover:bg-emerald-50">Activate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-white bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Plus className="h-5 w-5 text-indigo-600" />
            {editing ? 'Edit Product' : 'Add Product'}
          </h3>
          <div className="mb-4 rounded-xl border border-indigo-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Preview</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">{form.productName || 'New product'}</p>
            <p className="text-sm font-semibold text-slate-500">{form.brand || 'Generic'} · {selectedCategoryName}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-slate-500">Sale Price</p>
                <p className="font-semibold text-indigo-600">{currency.format(form.sellingPrice || 0)}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-slate-500">Stock</p>
                <p className="font-semibold text-emerald-600">{form.stockQuantity || 0}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-bold text-slate-500">Margin</p>
                <p className={`font-semibold ${previewMargin >= 0 ? 'text-cyan-700' : 'text-rose-700'}`}>
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
              <button disabled={busy} onClick={() => { void run(save) }} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white">
                <Save className="h-4 w-4" />
                Save
              </button>
              <button onClick={reset} className="h-11 rounded-xl border border-slate-200 font-semibold">Clear</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

