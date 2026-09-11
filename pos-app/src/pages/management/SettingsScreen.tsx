import { useCallback, useEffect, useState } from 'react'
import { ArchiveRestore, Database, Save, Settings } from 'lucide-react'

import { useAsyncAction, Notice, currency, unwrap, isSuccess, NoticeBar } from './shared'

export function SettingsScreen({ userId }: { userId: number }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [backups, setBackups] = useState<any[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const { run, busy } = useAsyncAction(setNotice)
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
        <div className="min-h-0 overflow-auto rounded-xl border border-white bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold"><Settings className="h-5 w-5 text-indigo-600" />Store Settings</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">These values are used on receipts, checkout tax, backups, and admin controls.</p>
            </div>
            <button onClick={() => { void run(async () => { try { await save() } finally { setSaving(false) } }) }} disabled={busy || saving} className="flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          <div className="grid gap-5">
            <div className="rounded-xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-semibold text-slate-950">Store Identity</h3>
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

            <div className="rounded-xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-semibold text-slate-950">Receipt Customization</h3>
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

            <div className="rounded-xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-semibold text-slate-950">Operations</h3>
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

            <div className="rounded-xl border border-slate-100 p-4">
              <h3 className="mb-4 text-base font-semibold text-slate-950">Backup</h3>
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
        <div className="rounded-xl border border-white bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Receipt Preview</h3>
          <div className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="border-b border-slate-100 pb-3 text-center">
              <p className="text-lg font-semibold text-slate-950">{filledSettings.ShopName}</p>
              {filledSettings.ReceiptHeaderMessage && <p className="font-semibold text-slate-500">{filledSettings.ReceiptHeaderMessage}</p>}
              {filledSettings.ReceiptShowAddress !== 'false' && <p className="font-semibold text-slate-500">{filledSettings.ShopAddress}</p>}
              {filledSettings.ReceiptShowPhone !== 'false' && <p className="font-semibold text-slate-500">{filledSettings.ShopPhone}</p>}
            </div>
            <div className="grid gap-2 py-3">
              <div className="flex justify-between"><span>Invoice</span><strong>{filledSettings.InvoicePrefix}-20260521-000001</strong></div>
              <div className="flex justify-between"><span>Sample product</span><strong>{currency.format(1250)}</strong></div>
              <div className="flex justify-between"><span>Tax ({filledSettings.TaxPercent}%)</span><strong>{currency.format(1250 * (Number(filledSettings.TaxPercent) / 100))}</strong></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base"><span className="font-semibold">Total</span><strong>{currency.format(1250 + 1250 * (Number(filledSettings.TaxPercent) / 100))}</strong></div>
            </div>
            {filledSettings.ReceiptFooterMessage && <p className="rounded-xl bg-slate-50 p-3 text-center font-bold text-slate-600">{filledSettings.ReceiptFooterMessage}</p>}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Database className="h-5 w-5 text-cyan-600" />Backup & Recovery</h3>
            <button onClick={() => { void run(async () => { try { await backup() } finally { setBackingUp(false) } }) }} disabled={busy || backingUp || restoring} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 font-semibold text-white disabled:opacity-50">
              <ArchiveRestore className="h-4 w-4" /> {backingUp ? 'Creating Backup...' : 'Create Manual Backup'}
            </button>
            <button onClick={() => { void run(async () => { try { await restoreFromFile() } finally { setRestoring(false) } }) }} disabled={busy || backingUp || restoring} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-900 disabled:opacity-50">
              <ArchiveRestore className="h-4 w-4" /> {restoring ? 'Restoring...' : 'Restore From Backup File'}
            </button>
            <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              Backups are verified with SQLite integrity checks and SHA-256 checksums. Restore creates a safety backup first.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {backups.length === 0 ? <p className="text-sm font-semibold text-slate-500">No backups logged yet.</p> : backups.map((backupRow) => (
              <div key={backupRow.BackupID ?? backupRow.backupId} className="mb-3 rounded-xl border border-slate-100 p-3">
                <p className="truncate font-semibold">{backupRow.BackupPath ?? backupRow.backupPath}</p>
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
                  <button onClick={() => { void run(async () => { try { await verifyBackup(backupRow.BackupPath ?? backupRow.backupPath) } finally { setVerifyingPath('') } }) }} disabled={busy || verifyingPath === (backupRow.BackupPath ?? backupRow.backupPath) || restoring} className="h-9 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50">
                    {verifyingPath === (backupRow.BackupPath ?? backupRow.backupPath) ? 'Checking...' : 'Verify'}
                  </button>
                  <button onClick={() => { void run(async () => { try { await restoreBackup(backupRow.BackupPath ?? backupRow.backupPath) } finally { setRestoring(false) } }) }} disabled={busy || (backupRow.Status ?? backupRow.status) !== 'Success' || restoring || backingUp} className="h-9 rounded-xl bg-amber-500 text-xs font-semibold text-white disabled:opacity-50">
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
