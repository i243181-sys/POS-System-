import { passwordError } from '../security/password'
import { all, get, withTx, type Db } from '../database/database'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { PublicError, publicErrorMessage } from '../utils/safeErrors'
import bcrypt from 'bcryptjs'
import type { CreateUserRequest, UpdateUserRequest, ServiceResult } from '../../shared/types'

const BCRYPT_ROUNDS = 12

export const userService = {
  getAllRoles: async () => {
    try {
      const data = await all("SELECT RoleID AS \"roleId\", RoleName AS \"roleName\" FROM Roles WHERE RoleName IN ('Admin', 'Cashier') ORDER BY RoleID")
      return { success: true, data, message: '' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getAllUsers: async () => {
    try {
      const users = await all(`
         SELECT u.UserID AS "userId", u.Username AS "username", u.FullName AS "fullName",
           u.RoleID AS "roleId", r.RoleName AS "roleName", u.Status AS "status",
           u.FailedLoginAttempts AS "failedLoginAttempts", u.LastLoginAt AS "lastLoginAt", u.CreatedAt AS "createdAt"
        FROM Users u
        JOIN Roles r ON u.RoleID = r.RoleID
        WHERE r.RoleName IN ('Admin', 'Cashier')
        ORDER BY u.Username
      `)
      return { success: true, data: users, message: '' }
    } catch (error: any) {
      logger.error('Error fetching users', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  create: async (req: CreateUserRequest, adminId: number): Promise<ServiceResult> => {
    try {
      const username = String(req.username ?? '').trim()
      const fullName = String(req.fullName ?? '').trim()
      const plainPassword = String(req.plainPassword ?? '')

      if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
        return { success: false, message: 'Username must be 3-50 letters, numbers, dots, dashes, or underscores.' }
      }
      if (fullName.length < 2 || fullName.length > 100) {
        return { success: false, message: 'Full name must be between 2 and 100 characters.' }
      }
      if (passwordError(plainPassword)) {
        return { success: false, message: passwordError(plainPassword)! }
      }

      const existing = await get('SELECT 1 FROM Users WHERE lower(Username) = lower($1)', [username])
      if (existing) return { success: false, message: 'Username already exists' }

      const role = await get("SELECT RoleName AS \"roleName\" FROM Roles WHERE RoleID = $1 AND RoleName IN ('Admin', 'Cashier')", [req.roleId])
      if (!role) return { success: false, message: 'Only Admin and Cashier users can be created.' }

      const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS)
      await withTx(async (tx: Db) => {
        const info = await tx.run(
          `INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status) VALUES ($1, $2, $3, $4, 'Active') RETURNING UserID`,
          [username, hash, fullName, req.roleId]
        )
        await auditService.log('USER_CREATED', 'User', `Created user ${username}`, adminId, String(info.rows[0].userid), tx)
      })
      return { success: true, message: 'User created successfully' }
    } catch (error: any) {
      logger.error('Error creating user', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  update: async (req: UpdateUserRequest, adminId: number): Promise<ServiceResult> => {
    try {
      if (!Number.isInteger(req.userId) || req.userId <= 0) return { success: false, message: 'Invalid user.' }
      if (!['Active', 'Inactive'].includes(req.status)) return { success: false, message: 'Invalid status.' }
      if (String(req.fullName ?? '').trim().length < 2 || String(req.fullName ?? '').trim().length > 100) {
        return { success: false, message: 'Full name must be between 2 and 100 characters.' }
      }
      const fullName = String(req.fullName ?? '').trim()
      const role = await get("SELECT RoleName AS \"roleName\" FROM Roles WHERE RoleID = $1 AND RoleName IN ('Admin', 'Cashier')", [req.roleId])
      if (!role) return { success: false, message: 'Choose Admin or Cashier role.' }

      await withTx(async (tx: Db) => {
        const target = await tx.get('SELECT r.RoleName AS "roleName" FROM Users u JOIN Roles r ON u.RoleID = r.RoleID WHERE u.UserID = $1', [req.userId]) as { roleName: string } | undefined
        const nextRole = await tx.get('SELECT RoleName AS "roleName" FROM Roles WHERE RoleID = $1', [req.roleId]) as { roleName: string }
        if (target?.roleName === 'Admin' && (nextRole.roleName !== 'Admin' || req.status !== 'Active')) {
          const another = await tx.get("SELECT 1 FROM Users u JOIN Roles r ON u.RoleID = r.RoleID WHERE r.RoleName = 'Admin' AND u.Status = 'Active' AND u.UserID != $1", [req.userId])
          if (!another) throw new PublicError('Keep at least one active administrator.')
        }
        const update = await tx.run(
          'UPDATE Users SET FullName = $1, RoleID = $2, Status = $3, UpdatedAt = now() WHERE UserID = $4',
          [fullName, req.roleId, req.status, req.userId]
        )
        if (update.rowCount !== 1) throw new PublicError('User not found.')
        await auditService.log('USER_UPDATED', 'User', `Updated user ID ${req.userId}`, adminId, req.userId.toString(), tx)
      })
      return { success: true, message: 'User updated successfully' }
    } catch (error: any) {
      logger.error('Error updating user', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  unlock: async (userId: number, adminId: number): Promise<ServiceResult> => {
    try {
      await withTx(async (tx: Db) => {
        const update = await tx.run(
          `UPDATE Users SET Status = 'Active', FailedLoginAttempts = 0, LockedUntil = NULL WHERE UserID = $1`,
          [userId]
        )
        if (update.rowCount !== 1) throw new PublicError('User not found.')
        await auditService.log('USER_UNLOCKED', 'User', `Unlocked user ID ${userId}`, adminId, userId.toString(), tx)
      })
      return { success: true, message: 'User unlocked successfully' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  changePassword: async (userId: number, currentPlain: string, newPlain: string): Promise<ServiceResult> => {
    try {
      if (!Number.isInteger(userId) || userId <= 0) return { success: false, message: 'Invalid user.' }
      if (passwordError(String(newPlain ?? ''))) {
        return { success: false, message: passwordError(String(newPlain ?? ''))! }
      }
      const user = await get('SELECT PasswordHash FROM Users WHERE UserID = $1', [userId])
      if (!user) return { success: false, message: 'User not found' }

      const isValid = await bcrypt.compare(currentPlain, user.PasswordHash)
      if (!isValid) return { success: false, message: 'Incorrect current password' }

      const newHash = await bcrypt.hash(newPlain, BCRYPT_ROUNDS)
      await withTx(async (tx: Db) => {
        const update = await tx.run('UPDATE Users SET PasswordHash = $1, UpdatedAt = now() WHERE UserID = $2', [newHash, userId])
        if (update.rowCount !== 1) throw new PublicError('User not found.')
        await auditService.log('PASSWORD_CHANGED', 'User', 'User changed their password', userId, userId.toString(), tx)
      })
      return { success: true, message: 'Password changed successfully' }
    } catch (error: any) {
      logger.error('Error changing password', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  }
}
