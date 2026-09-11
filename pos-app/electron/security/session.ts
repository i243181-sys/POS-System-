import type { User, UserRole } from '../../shared/types'
import { get } from '../database/database'
import { PublicError } from '../utils/safeErrors'

type Session = {
  user: User
  expiresAt: number
  timeoutMs: number
}

let currentSession: Session | null = null

export function startSession(user: User, timeoutMinutes = 30) {
  const timeoutMs = Math.max(5, Math.min(timeoutMinutes, 480)) * 60 * 1000
  currentSession = {
    user,
    timeoutMs,
    expiresAt: Date.now() + timeoutMs
  }
}

export function endSession() {
  currentSession = null
}

export async function requireSession(touch = true): Promise<User> {
  if (!currentSession) throw new PublicError('Please sign in again.')
  if (Date.now() > currentSession.expiresAt) {
    endSession()
    throw new PublicError('Your session expired. Please sign in again.')
  }

  const account = await get(
    'SELECT u.status AS status, u.roleid AS roleid, r.rolename AS rolename FROM users u JOIN roles r ON u.roleid = r.roleid WHERE u.userid = $1',
    [currentSession.user.userId]
  ) as { status: string; roleid: number; rolename: UserRole } | undefined
  if (!account || account.status !== 'Active' || Number(account.roleid) !== Number(currentSession.user.roleId)) {
    endSession()
    throw new PublicError('Your account changed. Please sign in again.')
  }
  if (touch) currentSession.expiresAt = Date.now() + currentSession.timeoutMs
  return currentSession.user
}

export async function requireRole(allowedRoles: UserRole[]): Promise<User> {
  const user = await requireSession()
  if (!user.roleName || !allowedRoles.includes(user.roleName)) {
    throw new PublicError('You do not have permission to perform this action.')
  }
  return user
}
