import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, LockKeyhole, Shield, UserPlus, Users } from 'lucide-react'
import type { User } from '../../../shared/types'

import { Notice, unwrap, isSuccess, StatCard, NoticeBar } from './shared'

export function UsersScreen({ userId }: { userId: number }) {
  const [busy, setBusy] = useState(false)
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

  const perform = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try { await action() } catch (error: any) { setNotice({ tone: 'error', text: error.message || 'User operation failed.' }) }
    finally { setBusy(false) }
  }
  const toggleStatus = async (target: User) => {
    const response = await window.api?.updateUser?.({ userId: target.userId, fullName: target.fullName, roleId: target.roleId, status: target.status === 'Active' ? 'Inactive' : 'Active' }, userId)
    if (!response?.success) throw new Error(response?.message || 'User update unavailable.')
    setNotice({ tone: 'success', text: response.message })
    await load()
  }

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
        <div className="overflow-hidden rounded-xl border border-white bg-white shadow-sm">
          <h2 className="border-b border-slate-100 p-5 text-xl font-semibold">User Management</h2>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.userId}>
                    <td className="px-4 py-3"><p className="font-semibold">{user.fullName}</p><p className="text-xs text-slate-500">{user.username}</p></td>
                    <td className="px-4 py-3">{user.roleName}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : user.status === 'Locked' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{user.status}</span></td>
                    <td className="px-4 py-3">{user.status !== 'Locked' && <button disabled={busy || user.userId === userId} onClick={() => { void perform(() => toggleStatus(user)) }} className="mr-2 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold">{user.status === 'Active' ? 'Deactivate' : 'Activate'}</button>}{user.status === 'Locked' && <button disabled={busy} onClick={() => { void perform(() => unlock(user.userId)) }} className="rounded-xl border border-emerald-200 px-3 py-1.5 font-bold text-emerald-700">Unlock</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-xl border border-white bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><UserPlus className="h-5 w-5 text-indigo-600" />Create User</h3>
          <div className="grid gap-3">
            <input className="h-11 rounded-xl border border-slate-200 px-3" placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            <input className="h-11 rounded-xl border border-slate-200 px-3" placeholder="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
            <input className="h-11 rounded-xl border border-slate-200 px-3" type="password" placeholder="Temporary password" value={form.plainPassword} onChange={(event) => setForm({ ...form, plainPassword: event.target.value })} />
            <select className="h-11 rounded-xl border border-slate-200 px-3" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: Number(event.target.value) })}>
              {roles.map((role) => <option key={role.RoleID ?? role.roleId} value={role.RoleID ?? role.roleId}>{role.RoleName ?? role.roleName}</option>)}
            </select>
            <button disabled={busy} onClick={() => { void perform(create) }} className="h-11 rounded-xl bg-indigo-600 font-semibold text-white">Create User</button>
          </div>
        </div>
      </div>
    </section>
  )
}

