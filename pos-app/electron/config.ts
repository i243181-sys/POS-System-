import { app } from 'electron'
import fs from 'fs'
import path from 'path'

process.umask(0o077)
if (process.env.POS_DATA_DIR) {
  if (!path.isAbsolute(process.env.POS_DATA_DIR)) throw new Error('POS_DATA_DIR must be an absolute directory.')
  fs.mkdirSync(process.env.POS_DATA_DIR, { recursive: true, mode: 0o700 })
  app.setPath('userData', process.env.POS_DATA_DIR)
}
