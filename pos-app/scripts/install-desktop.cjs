const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appDir = path.resolve(__dirname, '..')
const dataDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
const applications = path.join(dataDir, 'applications')
// Desktop Entry Exec quoting is not shell quoting. Escape its reserved characters.
const quoteExec = value => '"' + value.replace(/[\\"`$]/g, '\\$&').replace(/%/g, '%%') + '"'
if (/[\r\n]/.test(appDir)) throw new Error('Installation directory must not contain newlines.')
fs.mkdirSync(applications, { recursive: true })
const target = path.join(applications, 'securestore-pos.desktop')
fs.writeFileSync(target, `[Desktop Entry]\nVersion=1.0\nType=Application\nName=SecureStore POS\nComment=Inventory, checkout and customer accounts\nExec=${quoteExec(path.join(appDir, 'run.sh'))}\nIcon=${path.join(appDir, 'public', 'securestore-pos.svg')}\nTerminal=false\nCategories=Office;Finance;\nStartupNotify=true\nStartupWMClass=securestore-pos\n`, { mode: 0o644 })
console.log(`Installed application-menu entry: ${target}`)
