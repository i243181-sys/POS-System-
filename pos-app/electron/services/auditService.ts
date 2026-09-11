import { all, run, type Db } from '../database/database'
import { logger } from '../utils/logger'
import { publicErrorMessage } from '../utils/safeErrors'

export const auditService = {
  // When called inside withTx(), pass the tx as `client` so the audit write
  // commits/rolls back atomically with the rest of the work.
  log: async (
    action: string,
    entityName: string,
    description: string,
    userId?: number,
    entityId?: string,
    client?: Db
  ): Promise<void> => {
    try {
      const exec = client ? (sql: string, params: unknown[]) => client.run(sql, params) : run
      await exec(
        'INSERT INTO AuditLogs (UserID, Action, EntityName, EntityID, Description) VALUES ($1, $2, $3, $4, $5)',
        [userId ?? null, action, entityName, entityId ?? null, description]
      )
    } catch (error) {
      logger.error('Failed to write audit log', error)
      throw error
    }
  },

  getLogs: async (limit = 100) => {
    try {
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100
      const data = await all(
        'SELECT a.*, u.Username as userName FROM AuditLogs a LEFT JOIN Users u ON a.UserID = u.UserID ORDER BY a.CreatedAt DESC LIMIT $1',
        [safeLimit]
      )
      return { success: true, data, message: '' }
    } catch (error: any) {
      logger.error('Error fetching audit logs', error)
      return { success: false, message: publicErrorMessage(error), data: [] }
    }
  }
}
