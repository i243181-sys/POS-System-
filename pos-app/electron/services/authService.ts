import { passwordError } from '../security/password'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
import { get, withTx, type Db } from '../database/database'
import { auditService } from './auditService'
import bcrypt from 'bcryptjs'
import { logger } from '../utils/logger'
import { databaseDate } from '../../shared/dates'
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
  for (const [name, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(name)
  }
  if (loginAttempts.size >= 1000 && !loginAttempts.has(key)) return true
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
  for (const [name, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(name)
  }
  if (loginAttempts.size >= 1000 && !loginAttempts.has(key)) return
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

async function hasAdminUser() {
  const row = await get(`
    SELECT COUNT(*) as count
    FROM Users u
    JOIN Roles r ON u.RoleID = r.RoleID
    WHERE r.RoleName = 'Admin'
  `) as { count: number }
  return Number(row?.count ?? 0) > 0
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
  if (passwordError(plainPassword)) {
    return { error: passwordError(plainPassword)! }
  }

  return { username, fullName, plainPassword }
}

export const authService = {
  getSetupStatus: async (): Promise<{ success: boolean; message: string; data: { setupRequired: boolean } }> => {
    try {
      return {
        success: true,
        message: '',
        data: { setupRequired: !(await hasAdminUser()) }
      }
    } catch (error: any) {
      logger.error('Setup status check failed', error)
      return { success: false, message: 'Could not check setup status.', data: { setupRequired: false } }
    }
  },

  createInitialAdmin: async (req: InitialAdminRequest): Promise<ServiceResult> => {
    try {
      const validated = validateInitialAdmin(req)
      if (validated.error || !validated.username || !validated.fullName || !validated.plainPassword) {
        return { success: false, message: validated.error || 'Invalid admin account details.' }
      }

      const passwordHash = await bcrypt.hash(validated.plainPassword, 12)
      await withTx(async (tx: Db) => {
        if (await hasAdminUser()) throw new PublicError('Initial setup is already complete.')

        await tx.run("INSERT INTO Roles (RoleName) VALUES ('Admin') ON CONFLICT (RoleName) DO NOTHING")
        const role = await tx.get("SELECT RoleID FROM Roles WHERE RoleName = 'Admin'") as { roleid: number } | undefined
        if (!role) throw new PublicError('Admin role could not be prepared.')

        const existing = await tx.get('SELECT 1 FROM Users WHERE lower(Username) = lower($1)', [validated.username])
        if (existing) throw new PublicError('Username already exists.')

        const info = await tx.run(
          `INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status) VALUES ($1, $2, $3, $4, 'Active') RETURNING UserID`,
          [validated.username, passwordHash, validated.fullName, role.roleid]
        )
        const adminId = Number(info.rows[0].userid)
        await auditService.log('INITIAL_ADMIN_CREATED', 'User', `Created initial admin user ${validated.username}`, adminId, String(adminId), tx)
      })

      clearLoginFailures(validated.username)
      return { success: true, message: 'Admin account created. Sign in to continue.' }
    } catch (error: any) {
      logger.error('Initial admin setup failed', error)
      return { success: false, message: publicErrorMessage(error, 'Could not create the initial admin account.') }
    }
  },

  login: async (req: LoginRequest): Promise<LoginResponse> => {
    try {
      const username = String(req.username ?? '').trim()
      const password = String(req.password ?? '')

      if (!username || username.length > 50 || !password || password.length > 128) {
        return { success: false, message: 'Invalid username or password' }
      }

      if (isRateLimited(username)) {
        await auditService.log('LOGIN_RATE_LIMITED', 'User', 'Too many login attempts for one account name')
        return { success: false, message: 'Too many login attempts. Please try again later.' }
      }

      const user = await get(`
        SELECT u.UserID as "UserID",
               u.Username as "Username",
               u.PasswordHash as "PasswordHash",
               u.FullName as "FullName",
               u.RoleID as "RoleID",
               u.Status as "Status",
               u.FailedLoginAttempts as "FailedLoginAttempts",
               u.LockedUntil as "LockedUntil",
               u.CreatedAt as "CreatedAt",
               r.RoleName as "RoleName"
        FROM Users u
        JOIN Roles r ON u.RoleID = r.RoleID
        WHERE lower(u.Username) = lower($1)
      `, [username]) as any

      if (!user) {
        recordLoginFailure(username)
        await auditService.log('LOGIN_FAILED', 'User', 'Unknown username attempted login')
        return { success: false, message: 'Invalid username or password' }
      }

      if (user.Status === 'Inactive') {
        return { success: false, message: 'Account is inactive. Contact admin.' }
      }

      if (!['Admin', 'Cashier'].includes(user.RoleName)) {
        return { success: false, message: 'This role is no longer allowed to sign in.' }
      }

      if (user.Status === 'Locked') {
        if (user.LockedUntil && databaseDate(user.LockedUntil) > new Date()) {
          return { success: false, message: `Account locked until ${databaseDate(user.LockedUntil).toLocaleString()}` }
        } else {
          await withTx(async (tx: Db) => {
            await tx.run(`UPDATE Users SET Status = 'Active', FailedLoginAttempts = 0, LockedUntil = NULL WHERE UserID = $1`, [user.UserID])
            await auditService.log('ACCOUNT_UNLOCKED', 'User', 'Expired lock was cleared during login', user.UserID, undefined, tx)
          })
          user.Status = 'Active'
          user.FailedLoginAttempts = 0
        }
      }

      const isValid = await bcrypt.compare(password, user.PasswordHash)

      if (!isValid) {
        recordLoginFailure(username)
        const attempts = user.FailedLoginAttempts + 1
        const maxAttempts = 5 // Could be fetched from Settings table

        if (attempts >= maxAttempts) {
          const lockTime = new Date(Date.now() + 30 * 60000) // lock for 30 mins
          await withTx(async (tx: Db) => {
            await tx.run(`UPDATE Users SET Status = 'Locked', FailedLoginAttempts = $1, LockedUntil = $2 WHERE UserID = $3`, [attempts, lockTime, user.UserID])
            await auditService.log('ACCOUNT_LOCKED', 'User', `Account locked after ${attempts} failed attempts`, user.UserID, undefined, tx)
          })
          return { success: false, message: 'Account locked due to too many failed attempts. Try again in 30 minutes.' }
        } else {
          await withTx(async (tx: Db) => {
            await tx.run(`UPDATE Users SET FailedLoginAttempts = $1 WHERE UserID = $2`, [attempts, user.UserID])
            await auditService.log('LOGIN_FAILED', 'User', `Invalid password attempt ${attempts} for ${user.Username}`, user.UserID, undefined, tx)
          })
          return { success: false, message: 'Invalid username or password' }
        }
      }

      // Success
      clearLoginFailures(username)
      await withTx(async (tx: Db) => {
        await tx.run(`UPDATE Users SET FailedLoginAttempts = 0, LastLoginAt = now() WHERE UserID = $1`, [user.UserID])
        await auditService.log('LOGIN_SUCCESS', 'User', 'User logged in successfully', user.UserID, undefined, tx)
      })

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
