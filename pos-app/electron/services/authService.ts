import { getDb } from '../database/database'
import { auditService } from './auditService'
import bcrypt from 'bcryptjs'
import { logger } from '../utils/logger'
import type { InitialAdminRequest, LoginRequest, LoginResponse, ServiceResult } from '../../shared/types'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LIMIT = 5
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function loginKey(username: string) {
  return username.trim().toLowerCase() || 'unknown'
}

function isRateLimited(username: string) {
  const key = loginKey(username)
  const now = Date.now()
  const entry = loginAttempts.get(key)

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS })
    return false
  }

  return entry.count >= LOGIN_LIMIT
}

function recordLoginFailure(username: string) {
  const key = loginKey(username)
  const now = Date.now()
  const entry = loginAttempts.get(key)

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }

  entry.count += 1
}

function clearLoginFailures(username: string) {
  loginAttempts.delete(loginKey(username))
}

function hasAdminUser() {
  const db = getDb()
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM Users u
    JOIN Roles r ON u.RoleID = r.RoleID
    WHERE r.RoleName = 'Admin'
  `).get() as { count: number }
  return row.count > 0
}

function validateInitialAdmin(req: InitialAdminRequest) {
  const username = String(req.username ?? '').trim()
  const fullName = String(req.fullName ?? '').trim()
  const plainPassword = String(req.plainPassword ?? '')

  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
    return { error: 'Username must be 3-50 letters, numbers, dots, dashes, or underscores.' }
  }
  if (fullName.length < 2 || fullName.length > 100) {
    return { error: 'Full name must be between 2 and 100 characters.' }
  }
  if (plainPassword.length < 12 || plainPassword.length > 128) {
    return { error: 'Admin password must be between 12 and 128 characters.' }
  }

  return { username, fullName, plainPassword }
}

export const authService = {
  getSetupStatus: (): { success: boolean; message: string; data: { setupRequired: boolean } } => {
    try {
      return {
        success: true,
        message: '',
        data: { setupRequired: !hasAdminUser() }
      }
    } catch (error: any) {
      logger.error('Setup status check failed', error)
      return { success: false, message: 'Could not check setup status.', data: { setupRequired: false } }
    }
  },

  createInitialAdmin: async (req: InitialAdminRequest): Promise<ServiceResult> => {
    try {
      const db = getDb()
      const validated = validateInitialAdmin(req)
      if (validated.error || !validated.username || !validated.fullName || !validated.plainPassword) {
        return { success: false, message: validated.error || 'Invalid admin account details.' }
      }

      const passwordHash = await bcrypt.hash(validated.plainPassword, 12)
      const transaction = db.transaction(() => {
        if (hasAdminUser()) throw new Error('Initial setup is already complete.')

        db.prepare("INSERT OR IGNORE INTO Roles (RoleName) VALUES ('Admin')").run()
        const role = db.prepare("SELECT RoleID FROM Roles WHERE RoleName = 'Admin'").get() as { RoleID: number } | undefined
        if (!role) throw new Error('Admin role could not be prepared.')

        const existing = db.prepare('SELECT 1 FROM Users WHERE Username = ? COLLATE NOCASE').get(validated.username)
        if (existing) throw new Error('Username already exists.')

        const info = db.prepare(`
          INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status)
          VALUES (?, ?, ?, ?, 'Active')
        `).run(validated.username, passwordHash, validated.fullName, role.RoleID)
        const adminId = Number(info.lastInsertRowid)
        auditService.log('INITIAL_ADMIN_CREATED', 'User', `Created initial admin user ${validated.username}`, adminId, String(adminId))
      })

      transaction()
      clearLoginFailures(validated.username)
      return { success: true, message: 'Admin account created. Sign in to continue.' }
    } catch (error: any) {
      logger.error('Initial admin setup failed', error)
      return { success: false, message: error?.message || 'Could not create the initial admin account.' }
    }
  },

  login: async (req: LoginRequest): Promise<LoginResponse> => {
    try {
      const username = String(req.username ?? '').trim()
      const password = String(req.password ?? '')

      if (!username || !password) {
        return { success: false, message: 'Invalid username or password' }
      }

      if (isRateLimited(username)) {
        auditService.log('LOGIN_RATE_LIMITED', 'User', 'Too many login attempts for one account name')
        return { success: false, message: 'Too many login attempts. Please try again later.' }
      }

      const db = getDb()
      
      const user = db.prepare(`
        SELECT u.*, r.RoleName
        FROM Users u
        JOIN Roles r ON u.RoleID = r.RoleID
        WHERE u.Username = ? COLLATE NOCASE
      `).get(username) as any

      if (!user) {
        recordLoginFailure(username)
        auditService.log('LOGIN_FAILED', 'User', 'Unknown username attempted login')
        return { success: false, message: 'Invalid username or password' }
      }

      if (user.Status === 'Inactive') {
        return { success: false, message: 'Account is inactive. Contact admin.' }
      }

      if (!['Admin', 'Cashier'].includes(user.RoleName)) {
        return { success: false, message: 'This role is no longer allowed to sign in.' }
      }

      if (user.Status === 'Locked') {
        if (user.LockedUntil && new Date(user.LockedUntil) > new Date()) {
          return { success: false, message: `Account locked until ${new Date(user.LockedUntil).toLocaleString()}` }
        } else {
          const unlockExpired = db.transaction(() => {
            db.prepare(`UPDATE Users SET Status = 'Active', FailedLoginAttempts = 0, LockedUntil = NULL WHERE UserID = ?`).run(user.UserID)
            auditService.log('ACCOUNT_UNLOCKED', 'User', 'Expired lock was cleared during login', user.UserID)
          })
          unlockExpired()
        }
      }

      const isValid = await bcrypt.compare(password, user.PasswordHash)

      if (!isValid) {
        recordLoginFailure(username)
        const attempts = user.FailedLoginAttempts + 1
        const maxAttempts = 5 // Could be fetched from Settings table
        
        if (attempts >= maxAttempts) {
          const lockTime = new Date(Date.now() + 30 * 60000).toISOString() // lock for 30 mins
          const lockAccount = db.transaction(() => {
            db.prepare(`UPDATE Users SET Status = 'Locked', FailedLoginAttempts = ?, LockedUntil = ? WHERE UserID = ?`).run(attempts, lockTime, user.UserID)
            auditService.log('ACCOUNT_LOCKED', 'User', `Account locked after ${attempts} failed attempts`, user.UserID)
          })
          lockAccount()
          return { success: false, message: 'Account locked due to too many failed attempts. Try again in 30 minutes.' }
        } else {
          const recordFailedPassword = db.transaction(() => {
            db.prepare(`UPDATE Users SET FailedLoginAttempts = ? WHERE UserID = ?`).run(attempts, user.UserID)
            auditService.log('LOGIN_FAILED', 'User', `Invalid password attempt ${attempts} for ${user.Username}`, user.UserID)
          })
          recordFailedPassword()
          return { success: false, message: 'Invalid username or password' }
        }
      }

      // Success
      clearLoginFailures(username)
      const recordSuccess = db.transaction(() => {
        db.prepare(`UPDATE Users SET FailedLoginAttempts = 0, LastLoginAt = datetime('now') WHERE UserID = ?`).run(user.UserID)
        auditService.log('LOGIN_SUCCESS', 'User', 'User logged in successfully', user.UserID)
      })
      recordSuccess()

      return {
        success: true,
        message: 'Login successful',
        user: {
          userId: user.UserID,
          username: user.Username,
          fullName: user.FullName,
          roleId: user.RoleID,
          roleName: user.RoleName,
          status: user.Status,
          failedLoginAttempts: 0,
          createdAt: user.CreatedAt
        }
      }

    } catch (error: any) {
      logger.error('Login error', error)
      return { success: false, message: 'An internal error occurred during login' }
    }
  }
}
