import { useState } from 'react'
import type { User } from '../../../shared/types'
import { NoticeBar, type Notice } from './shared'

export function AccountScreen({ user }: { user: User }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (password !== confirmation) { setNotice({ tone: 'error', text: 'New passwords do not match.' }); return }
    setSaving(true)
    try {
      const result = await window.api?.changePassword?.(user.userId, current, password)
      if (!result?.success) throw new Error(result?.message || 'Password service unavailable.')
      setCurrent(''); setPassword(''); setConfirmation('')
      setNotice({ tone: 'success', text: result.message })
    } catch (error: any) { setNotice({ tone: 'error', text: error.message || 'Could not change password.' }) }
    finally { setSaving(false) }
  }
  return <section className="mx-auto max-w-xl space-y-5 p-6">
    <div><h2 className="text-xl font-semibold">{user.fullName}</h2><p className="mt-1 text-sm text-slate-500">{user.username} · {user.roleName}</p></div>
    <NoticeBar notice={notice} onClose={() => setNotice(null)} />
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Change password</h3>
      <p className="text-sm text-slate-500">Use at least 12 characters. Passwords may contain at most 72 UTF-8 bytes.</p>
      {[
        { label: 'Current password', value: current, set: setCurrent, auto: 'current-password' },
        { label: 'New password', value: password, set: setPassword, auto: 'new-password' },
        { label: 'Confirm new password', value: confirmation, set: setConfirmation, auto: 'new-password' }
      ].map(field => <label key={field.label} className="block text-sm font-medium">{field.label}
        <input required type="password" autoComplete={field.auto} value={field.value} onChange={e => field.set(e.target.value)} className="mt-2 block h-11 w-full rounded-lg border border-slate-300 px-3" />
      </label>)}
      <button disabled={saving} className="h-11 rounded-lg bg-indigo-600 px-5 font-semibold text-white">{saving ? 'Saving…' : 'Change Password'}</button>
    </form>
  </section>
}
