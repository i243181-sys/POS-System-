import { getDb } from '../database/database'
import { auditService } from './auditService'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'
import bcrypt from 'bcryptjs'
import type { CreateUserRequest, UpdateUserRequest, ServiceResult } from '../../shared/types'

const BCRYPT_ROUNDS = 12

export const userService = {
  getAllRoles: () => {
    try {
      const db = getDb()
      return {
        success: true,
        data: db.prepare("SELECT * FROM Roles WHERE RoleName IN ('Admin', 'Cashier') ORDER BY RoleID").all(),
        message: ''
      }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  getAllUsers: () => {
    try {
      const db = getDb()
      const users = db.prepare(`
        SELECT u.UserID as userId, u.Username as username, u.FullName as fullName, 
               u.RoleID as roleId, r.RoleName as roleName, u.Status as status, 
               u.FailedLoginAttempts as failedLoginAttempts, u.LastLoginAt as lastLoginAt, u.CreatedAt as createdAt
        FROM Users u
        JOIN Roles r ON u.RoleID = r.RoleID
        WHERE r.RoleName IN ('Admin', 'Cashier')
        ORDER BY u.Username
      `).all()
      return { success: true, data: users, message: '' }
    } catch (error: any) {
      logger.error('Error fetching users', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  },

  create: async (req: CreateUserRequest, adminId: number): Promise<ServiceResult> => {
    try {
      const db = getDb()
      const username = String(req.username ?? '').trim()
      const fullName = String(req.fullName ?? '').trim()
      const plainPassword = String(req.plainPassword ?? '')

      if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
        return { success: false, message: 'Username must be 3-50 letters, numbers, dots, dashes, or underscores.' }
      }
      if (fullName.length < 2 || fullName.length > 100) {
        return { success: false, message: 'Full name must be between 2 and 100 characters.' }
      }
      if (plainPassword.length < 8 || plainPassword.length > 128) {
        return { success: false, message: 'Password must be between 8 and 128 characters.' }
      }

      const existing = db.prepare('SELECT 1 FROM Users WHERE Username = ? COLLATE NOCASE').get(username)
      if (existing) return { success: false, message: 'Username already exists' }

      const role = db.prepare("SELECT RoleName FROM Roles WHERE RoleID = ? AND RoleName IN ('Admin', 'Cashier')").get(req.roleId)
      if (!role) return { success: false, message: 'Only Admin and Cashier users can be created.' }

      const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS)
      const transaction = db.transaction(() => {
        const info = db.prepare(`
          INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status)
          VALUES (?, ?, ?, ?, 'Active')
        `).run(username, hash, fullName, req.roleId)

        auditService.log('USER_CREATED', 'User', `Created user ${username}`, adminId, info.lastInsertRowid.toString())
      })
      transaction()
      return { success: true, message: 'User created successfully' }
    } catch (error: any) {
      logger.error('Error creating user', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  update: (req: UpdateUserRequest, adminId: number): ServiceResult => {
    try {
      const db = getDb()
      const fullName = String(req.fullName ?? '').trim()
      if (fullName.length < 2 || fullName.length > 100) {
        return { success: false, message: 'Full name must be between 2 and 100 characters.' }
      }
      if (!['Active', 'Inactive', 'Locked'].includes(String(req.status))) {
        return { success: false, message: 'Choose a valid account status.' }
      }
      const role = db.prepare("SELECT 1 FROM Roles WHERE RoleID = ? AND RoleName IN ('Admin', 'Cashier')").get(req.roleId)
      if (!role) return { success: false, message: 'Choose Admin or Cashier role.' }

      const transaction = db.transaction(() => {
        const update = db.prepare(`
          UPDATE Users SET FullName = ?, RoleID = ?, Status = ?, UpdatedAt = datetime('now')
          WHERE UserID = ?
        `).run(fullName, req.roleId, req.status, req.userId)
        if (update.changes !== 1) throw new Error('User not found.')

        auditService.log('USER_UPDATED', 'User', `Updated user ID ${req.userId}`, adminId, req.userId.toString())
      })
      transaction()
      return { success: true, message: 'User updated successfully' }
    } catch (error: any) {
      logger.error('Error updating user', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  unlock: (userId: number, adminId: number): ServiceResult => {
    try {
      const db = getDb()
      const transaction = db.transaction(() => {
        const update = db.prepare(`UPDATE Users SET Status = 'Active', FailedLoginAttempts = 0, LockedUntil = NULL WHERE UserID = ?`).run(userId)
        if (update.changes !== 1) throw new Error('User not found.')
        auditService.log('USER_UNLOCKED', 'User', `Unlocked user ID ${userId}`, adminId, userId.toString())
      })
      transaction()
      return { success: true, message: 'User unlocked successfully' }
    } catch (error: any) {
      return { success: false, message: publicErrorMessage(error) }
    }
  },

  changePassword: async (userId: number, currentPlain: string, newPlain: string): Promise<ServiceResult> => {
    try {
      const db = getDb()
      if (!Number.isInteger(userId) || userId <= 0) return { success: false, message: 'Invalid user.' }
      if (String(newPlain ?? '').length < 8 || String(newPlain ?? '').length > 128) {
        return { success: false, message: 'New password must be between 8 and 128 characters.' }
      }
      const user = db.prepare('SELECT PasswordHash FROM Users WHERE UserID = ?').get(userId) as any
      if (!user) return { success: false, message: 'User not found' }

      const isValid = await bcrypt.compare(currentPlain, user.PasswordHash)
      if (!isValid) return { success: false, message: 'Incorrect current password' }

      const newHash = await bcrypt.hash(newPlain, BCRYPT_ROUNDS)
      const transaction = db.transaction(() => {
        const update = db.prepare("UPDATE Users SET PasswordHash = ?, UpdatedAt = datetime('now') WHERE UserID = ?").run(newHash, userId)
        if (update.changes !== 1) throw new Error('User not found.')
        auditService.log('PASSWORD_CHANGED', 'User', 'User changed their password', userId, userId.toString())
      })
      transaction()
      return { success: true, message: 'Password changed successfully' }
    } catch (error: any) {
      logger.error('Error changing password', error)
      return { success: false, message: publicErrorMessage(error) }
    }
  }
}
