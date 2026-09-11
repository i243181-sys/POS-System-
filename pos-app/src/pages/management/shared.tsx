import { useRef, useState } from 'react'
import { Package } from 'lucide-react'
import type { Product } from '../../../shared/types'
import { databaseDate } from '../../../shared/dates'

export type ServiceResponse<T> = {
  success?: boolean
  message?: string
  data?: T
}

export type Notice = {
  tone: 'success' | 'error' | 'info'
  text: string
}

export const currency = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' })

export function unwrap<T>(response: any, fallback: T): T {
  if (!response) throw new Error('Desktop connection unavailable. Restart SecureStore POS.')
  if (response.success === false) throw new Error(response.message || 'The operation failed.')
  if (Array.isArray(response)) return response as T
  if (response?.data !== undefined) return response.data as T
  return fallback
}

export function isSuccess(response: any) {
  return response?.success === true
}

export function StatCard({
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[tone].split(' ').slice(1).join(' ')}`}>
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-500">{label}</p>
          <p className="text-2xl font-semibold text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  )
}

export function NoticeBar({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null

  return (
    <div role="status" aria-live="polite"
      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold ${
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

export function dateOnly(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

export function formatDateTime(value: string) {
  return value ? databaseDate(value).toLocaleString() : ''
}

export function moneyTone(value: number) {
  return value < 0 ? 'text-rose-700' : 'text-emerald-700'
}

export function compactMoney(value: number) {
  return currency.format(Number(value || 0))
}

export function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100
}

export function stockCostOf(product: Product) {
  return roundMoney(Number(product.stockCost ?? Number(product.purchasePrice || 0) * Number(product.stockQuantity || 0)))
}

export function stockRetailValueOf(product: Product) {
  return roundMoney(Number(product.stockRetailValue ?? Number(product.sellingPrice || 0) * Number(product.stockQuantity || 0)))
}

export function stockProfitPotentialOf(product: Product) {
  return roundMoney(Number(product.stockProfitPotential ?? stockRetailValueOf(product) - stockCostOf(product)))
}


export function useAsyncAction(setNotice: (notice: Notice) => void) {
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try { await action() }
    catch (error: unknown) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The operation failed. Please try again.' }) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return { run, busy }
}
