import { useCallback, useEffect, useState } from 'react'
import { BarChart3, CreditCard, RefreshCcw, Search, TrendingUp, Users } from 'lucide-react'
import type { DebtSummary } from '../../../shared/types'

import { Notice, currency, unwrap, StatCard, NoticeBar } from './shared'

export function DebtsScreen() {
  const [debts, setDebts] = useState<DebtSummary[]>([])
  const [paymentCustomer, setPaymentCustomer] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [saving, setSaving] = useState(false)
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

  const recordPayment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const result = await window.api?.recordDebtPayment?.(Number(paymentCustomer), Number(paymentAmount))
      if (!result?.success) throw new Error(result?.message || 'Payment service unavailable.')
      setPaymentAmount('')
      setNotice({ tone: 'success', text: result.message })
      await load()
    } catch (error: any) {
      setNotice({ tone: 'error', text: error.message || 'Payment failed.' })
    } finally { setSaving(false) }
  }

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
      <form onSubmit={recordPayment} className="flex items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex-1 text-sm font-medium">Receive account payment
          <select required value={paymentCustomer} onChange={e => setPaymentCustomer(e.target.value)} className="mt-2 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Choose customer account</option>
            {debts.map(debt => <option key={debt.customerId} value={debt.customerId}>{debt.customerAccountNumber} · {debt.customerName} · {currency.format(debt.amountToBePaid)} due</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Cash received
          <input required type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="mt-2 block h-11 w-40 rounded-lg border border-slate-300 px-3" />
        </label>
        <button disabled={saving || !paymentCustomer} className="h-11 rounded-lg bg-indigo-600 px-4 font-semibold text-white">{saving ? 'Saving…' : 'Record Payment'}</button>
      </form>
      <p className="text-xs text-slate-500">Payments settle the oldest outstanding bills first. Enter the exact cash received; overpayments are rejected.</p>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-xl font-semibold">Customer Debts</h2>
            <p className="text-sm font-semibold text-slate-500">{currency.format(totalPaid)} collected against pending bills</p>
          </div>
          <div className="flex gap-2">
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 outline-none focus:border-indigo-400"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customer, account, phone..."
              />
            </div>
            <button onClick={() => { void load().catch(error => setNotice({ tone: 'error', text: error.message })) }} className="flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 font-semibold text-white">
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
                      <p className="font-semibold text-indigo-700">{accountLabel}</p>
                      <p className="text-xs font-semibold text-slate-400">Customer #{debt.customerId}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{debt.customerName}</p>
                      {debt.customerFatherName && <p className="text-xs font-semibold text-slate-500">Father: {debt.customerFatherName}</p>}
                      {debt.customerPhone && <p className="text-xs font-semibold text-slate-500">{debt.customerPhone}</p>}
                    </td>
                    <td className="px-5 py-4 text-right font-bold">{debt.invoiceCount}</td>
                    <td className="px-5 py-4 text-right font-bold">{currency.format(debt.totalAmount)}</td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-700">{currency.format(debt.paidAmount)}</td>
                    <td className="px-5 py-4 text-right text-lg font-semibold text-rose-700">{currency.format(debt.amountToBePaid)}</td>
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

