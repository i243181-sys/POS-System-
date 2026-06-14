import type { User, UserRole } from '../../shared/types'
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

export function requireSession(): User {
  if (!currentSession) throw new PublicError('Please sign in again.')
  if (Date.now() > currentSession.expiresAt) {
    endSession()
    throw new PublicError('Your session expired. Please sign in again.')
  }

  currentSession.expiresAt = Date.now() + currentSession.timeoutMs
  return currentSession.user
}

export function requireRole(allowedRoles: UserRole[]): User {
  const user = requireSession()
  if (!user.roleName || !allowedRoles.includes(user.roleName)) {
    throw new PublicError('You do not have permission to perform this action.')
  }
  return user
}
