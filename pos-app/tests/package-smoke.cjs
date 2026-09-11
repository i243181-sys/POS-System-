const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'securestore-package-'))
const env = { ...process.env, POS_DATA_DIR: temp, NODE_ENV: 'production' }
for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'POS_INITIAL_ADMIN_PASSWORD', 'POS_INITIAL_CASHIER_PASSWORD']) delete env[key]
const child = spawn(path.resolve('release/linux-unpacked/securestore-pos'), [], { env, stdio: ['ignore', 'ignore', 'pipe'] })
let ready = false
let stderr = ''
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
const poll = setInterval(() => {
  const file = path.join(temp, 'Logs', 'pos-combined.log')
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('Main window is ready and shown.')) {
    ready = true
    child.kill('SIGTERM')
  }
}, 250)
const deadline = setTimeout(() => { child.kill('SIGTERM') }, 20000)
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('close', () => {
  clearInterval(poll); clearTimeout(deadline)
  if (ready) console.log('PASS: packaged Linux x64 application initialized its private SQLite DB and showed its production window.')
  else { console.error('Packaged startup failed.', stderr); process.exitCode = 1 }
  fs.rmSync(temp, { recursive: true, force: true })
})
