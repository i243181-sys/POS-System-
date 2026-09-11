import './config'
import { app, BrowserWindow, dialog } from 'electron'
import path from 'path'
import { closeDb, initDb } from './database/database'
import { runMigrations } from './database/migrations'
import { registerIpcHandlers } from './ipc/handlers'
import { logger } from './utils/logger'
import { isAllowedRendererUrl } from './security/renderer'
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

async function bootstrap() {
  logger.info('Bootstrapping application...')

  // 1. Initialise Database
  const db = initDb()
  await runMigrations(db)
  await (await import('./database/seeder')).seedDatabase(db)

  // 2. Register IPC Handlers
  backupService.startAutoBackupScheduler()

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

  registerIpcHandlers(mainWindow)
  logger.info('IPC handlers registered.')
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  mainWindow.webContents.session.setPermissionCheckHandler(() => false)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault())

  const preventNavigation = (event: Electron.Event, url: string) => {
    if (!isAllowedRendererUrl(url)) {
      event.preventDefault()
      logger.warn('Blocked navigation away from SecureStore POS.')
    }
  }
  mainWindow.webContents.on('will-navigate', preventNavigation)
  mainWindow.webContents.on('will-redirect', preventNavigation)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    logger.info('Main window is ready and shown.')
  })

  // Load the Vite dev server URL in development, or the local HTML in production
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
    if (!isAllowedRendererUrl(rendererUrl.toString())) {
      throw new Error('Refusing to load a non-local renderer URL.')
    }
    logger.info(`Loading Dev URL: ${rendererUrl.origin}`)
    await mainWindow.loadURL(rendererUrl.toString())
  } else {
    logger.info('Loading Production index.html')
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
    logger.info('Main window shown after renderer load.')
  }
}

if (hasSingleInstanceLock) {
  app.whenReady().then(bootstrap).catch(err => {
    logger.error('Failed to bootstrap app', err)
    dialog.showErrorBox('SecureStore POS could not start', 'Check the application Logs folder in your data directory. Verify configuration and file permissions, then try again.')
    app.exit(1)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (backupService.isBusy()) {
    event.preventDefault()
    backupService.stopAutoBackupScheduler()
    setTimeout(() => app.quit(), 100)
    return
  }
  backupService.stopAutoBackupScheduler()
  closeDb()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) { app.relaunch(); app.exit(0) }
})
