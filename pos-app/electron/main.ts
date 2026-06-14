import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { closeDb, initDb } from './database/database'
import { runMigrations } from './database/migrations'
import { registerIpcHandlers } from './ipc/handlers'
import { logger } from './utils/logger'
import { backupService } from './services/backupService'

app.commandLine.appendSwitch('disable-dev-shm-usage')
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function isAllowedRendererUrl(targetUrl: string) {
  try {
    const parsed = new URL(targetUrl)

    if (process.env.ELECTRON_RENDERER_URL) {
      const devUrl = new URL(process.env.ELECTRON_RENDERER_URL)
      return parsed.origin === devUrl.origin
    }

    return parsed.protocol === 'file:'
  } catch {
    return false
  }
}

async function bootstrap() {
  logger.info('Bootstrapping application...')

  // 1. Initialise Database
  const db = initDb()
  runMigrations(db)
  await (await import('./database/seeder')).seedDatabase(db)

  // 2. Register IPC Handlers
  registerIpcHandlers()
  backupService.startAutoBackupScheduler()
  logger.info('IPC Handlers registered.')

  // 3. Create Browser Window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  // Prevent title from changing to generic text
  mainWindow.setTitle('SecureStore POS')

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((error) => logger.warn(`Could not open external URL: ${(error as Error).message}`))
    }

    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url)) {
      event.preventDefault()
      logger.warn(`Blocked navigation away from SecureStore POS: ${url}`)
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    logger.info('Main window is ready and shown.')
  })

  // Load the Vite dev server URL in development, or the local HTML in production
  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
    if (!['localhost', '127.0.0.1', '::1'].includes(rendererUrl.hostname)) {
      throw new Error('Refusing to load a non-local renderer URL.')
    }
    logger.info(`Loading Dev URL: ${rendererUrl.origin}`)
    mainWindow.loadURL(rendererUrl.toString())
  } else {
    logger.info('Loading Production index.html')
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

if (hasSingleInstanceLock) {
  app.whenReady().then(bootstrap).catch(err => {
    logger.error('Failed to bootstrap app', err)
    app.quit()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  backupService.stopAutoBackupScheduler()
  closeDb()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})
