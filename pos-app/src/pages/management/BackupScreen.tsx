import { useState } from 'react'
import { ArchiveRestore, Database } from 'lucide-react'

import { Notice, isSuccess, NoticeBar } from './shared'

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
          <div className="rounded-xl border border-white bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <ArchiveRestore className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Manual Backup</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Save a verified copy of the full POS database in the backup folder.
                </p>
              </div>
            </div>
            <button onClick={createBackup} disabled={backingUp || exporting} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {backingUp ? 'Creating Backup...' : 'Create Manual Backup'}
            </button>
          </div>

          <div className="rounded-xl border border-white bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Database className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Excel Export</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Export sales, profit, inventory, customers, payments, and stock history into separate Excel sheets.
                </p>
              </div>
            </div>
            <button onClick={exportExcel} disabled={backingUp || exporting} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {exporting ? 'Exporting Excel...' : 'Export Excel File'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

