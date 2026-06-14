import { createLogger, format, transports } from 'winston'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

const logDir = path.join(app.getPath('userData'), 'Logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

function redactSensitive(value: unknown) {
  return String(value ?? '')
    .replace(/(password|plainPassword|token|accessToken|refreshToken|authorization|cookie|apiKey|secret|privateKey)\s*[:=]\s*([^,\s}]+)/gi, '$1=[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
}

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }: Record<string, any>) =>
      stack
        ? `[${timestamp}] ${level.toUpperCase()}: ${redactSensitive(message)}\n${redactSensitive(stack)}`
        : `[${timestamp}] ${level.toUpperCase()}: ${redactSensitive(message)}`)
  ),
  transports: [
    new transports.File({
      filename: path.join(logDir, 'pos-error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 30,
    }),
    new transports.File({
      filename: path.join(logDir, 'pos-combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 365, // Keep 1 year of logs
    }),
  ],
})

// Also log to console in dev mode
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(format.colorize(), format.simple())
  }))
}
