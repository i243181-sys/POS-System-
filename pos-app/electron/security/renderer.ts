import { app } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'

export function isAllowedRendererUrl(target: string): boolean {
  try {
    const url = new URL(target)
    const dev = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    if (dev) {
      const expected = new URL(dev)
      return ['http:', 'https:'].includes(expected.protocol) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname) && url.origin === expected.origin
    }
    const expected = pathToFileURL(path.join(__dirname, '../renderer/index.html'))
    return url.protocol === 'file:' && url.pathname === expected.pathname && url.host === expected.host && !url.search
  } catch {
    return false
  }
}
