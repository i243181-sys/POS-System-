// One-shot codemod: fixes for the async session API and db helper param arrays
const fs = require('fs')
const base = '/home/mughees-haider/Projects/POSsystem/pos-app'

// ── handlers.ts ──
const handlersFile = `${base}/electron/ipc/handlers.ts`
let h = fs.readFileSync(handlersFile, 'utf8')

h = h.replace(
  "import { getDb } from '../database/database'",
  "import { get } from '../database/database'"
)

h = h.replace(
  `function getSessionTimeoutMinutes() {
  try {
    const row = getDb().prepare("SELECT SettingValue FROM Settings WHERE SettingKey = 'SessionTimeoutMinutes'").get() as any
    const timeout = Number(row?.SettingValue || 30)
    return Number.isInteger(timeout) ? timeout : 30
  } catch {
    return 30
  }
}`,
  `async function getSessionTimeoutMinutes() {
  try {
    const row = await get("SELECT SettingValue FROM Settings WHERE SettingKey = 'SessionTimeoutMinutes'") as any
    const timeout = Number(row?.SettingValue || 30)
    return Number.isInteger(timeout) ? timeout : 30
  } catch {
    return 30
  }
}`
)

h = h.replace(
  'handle(channel, () => safelyInvoke(() => handler(requireSession())))',
  'handle(channel, () => safelyInvoke(async () => handler(await requireSession())))'
)
h = h.replace(
  'handle(channel, () => safelyInvoke(() => handler(requireRole(roles))))',
  'handle(channel, () => safelyInvoke(async () => handler(await requireRole(roles))))'
)

h = h.replace(
  'handlePublic(IPC.AUTH_SESSION_STATUS, () => ({ success: true, data: requireSession(false) }))',
  'handlePublic(IPC.AUTH_SESSION_STATUS, async () => ({ success: true, data: await requireSession(false) }))'
)

h = h.replace(
  `  handle(IPC.AUTH_CHANGE_PASSWORD, (_, _userId, currentPlain, newPlain) =>
    safelyInvoke(() => {
      const user = requireSession()
      return userService.changePassword(user.userId, String(currentPlain ?? ''), String(newPlain ?? ''))
    })
  )`,
  `  handle(IPC.AUTH_CHANGE_PASSWORD, (_, _userId, currentPlain, newPlain) =>
    safelyInvoke(async () => {
      const user = await requireSession()
      return userService.changePassword(user.userId, String(currentPlain ?? ''), String(newPlain ?? ''))
    })
  )`
)

// requireSession()/requireRole() inside safelyInvoke bodies -> await
h = h.replace(/safelyInvoke\(\(\) => \{\n(\s*)const user = requireSession\(\)/g,
  'safelyInvoke(async () => {\n$1const user = await requireSession()')
h = h.replace(/safelyInvoke\(\(\) => \{\n(\s*)const user = requireRole\((\[[^\]]*\])\)/g,
  'safelyInvoke(async () => {\n$1const user = await requireRole($2)')
h = h.replace(/safelyInvoke\(\(\) => \{\n(\s*)requireRole\((\[[^\]]*\])\)/g,
  'safelyInvoke(async () => {\n$1await requireRole($2)')
h = h.replace(/safelyInvoke\(async () => \{\n(\s*)const user = await requireRole\((\[[^\]]*\])\)(\n\s*const response = await)/g,
  'safelyInvoke(async () => {\n$1const user = await requireRole($2)$3')

// Backups read file filters keep .db extension; handled in backupService rewrite.
fs.writeFileSync(handlersFile, h)

// ── main.ts ──
const mainFile = `${base}/electron/main.ts`
let m = fs.readFileSync(mainFile, 'utf8')
m = m.replace('  runMigrations(db)\n', '  await runMigrations(db)\n')
fs.writeFileSync(mainFile, m)

// ── userService.ts ──
const userFile = `${base}/electron/services/userService.ts`
let u = fs.readFileSync(userFile, 'utf8')
u = u.replace("import { all, get, run, withTx, type Db } from '../database/database'",
  "import { all, get, withTx, type Db } from '../database/database'")
fs.writeFileSync(userFile, u)

// ── reportService.ts ──
const reportFile = `${base}/electron/services/reportService.ts`
let r = fs.readFileSync(reportFile, 'utf8')
// wrap multi-value param lists in arrays
r = r.replace(/, startDate, endDate, startDate, endDate\) as any/g, ', [startDate, endDate, startDate, endDate]) as any')
r = r.replace(/, startDate, endDate, startDate, endDate\)\n/g, ', [startDate, endDate, startDate, endDate])\n')
r = r.replace(/, startDate, endDate\) as any\[\]/g, ', [startDate, endDate]) as any[]')
r = r.replace(/, startDate, endDate\)\n/g, ', [startDate, endDate])\n')
r = r.replace(/, today\) as any/g, ', [today]) as any')
// remove invalid casts
r = r.replace(/` as any\[\]\)/g, '`)')
r = r.replace(/` as Record<string, unknown>\)/g, '`)')
r = r.replace(/` as Array<Record<string, unknown>>\)/g, '`)')
// settings query via async helper
r = r.replace(
  "const settingsRows = db.prepare('SELECT SettingKey, SettingValue FROM Settings').all() as any[]",
  "const settingsRows = await all('SELECT SettingKey, SettingValue FROM Settings')"
)
fs.writeFileSync(reportFile, r)

console.log('codemod done')