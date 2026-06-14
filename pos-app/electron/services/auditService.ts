import { getDb } from '../database/database'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'

export const auditService = {
  log: (
    action: string,
    entityName: string,
    description: string,
    userId?: number,
    entityId?: string
  ) => {
    try {
      const db = getDb()
      const stmt = db.prepare(`
        INSERT INTO AuditLogs (UserID, Action, EntityName, EntityID, Description)
        VALUES (?, ?, ?, ?, ?)
      `)
      stmt.run(userId ?? null, action, entityName, entityId ?? null, description)
    } catch (error) {
      logger.error('Failed to write audit log', error)
      throw error
    }
  },

  getLogs: (limit = 100) => {
    try {
      const db = getDb()
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100
      const stmt = db.prepare(`
        SELECT a.*, u.Username as userName
        FROM AuditLogs a
        LEFT JOIN Users u ON a.UserID = u.UserID
        ORDER BY a.CreatedAt DESC
        LIMIT ?
      `)
      return { success: true, data: stmt.all(safeLimit), message: '' }
    } catch (error: any) {
      logger.error('Error fetching audit logs', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
