// Launch the packaged renderer with real preload, IPC, services and a temporary DB.
const { app, dialog } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'securestore-ui-'))
process.env.POS_DATA_DIR = temp
process.env.NODE_ENV = 'production'
delete process.env.ELECTRON_RENDERER_URL
delete process.env.POS_INITIAL_ADMIN_PASSWORD
delete process.env.POS_INITIAL_CASHIER_PASSWORD
const artifactDir = path.resolve('artifacts')
fs.mkdirSync(artifactDir, { recursive: true })
dialog.showSaveDialog = async (...args) => ({ canceled: false, filePath: path.join(artifactDir, path.basename(args.at(-1).defaultPath)) })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const deadline = setTimeout(() => { console.error('UI smoke timed out'); app.exit(1) }, 90000)
let mainWindow
app.on('browser-window-created', (_event, window) => {
  if (mainWindow) return
  mainWindow = window
  window.webContents.on('did-finish-load', () => run(window).catch(error => {
    console.error(error)
    app.exit(1)
  }))
})
async function run(window) {
  const js = async code => { try { return await window.webContents.executeJavaScript(code, true) } catch (error) { console.error('Failed renderer step:', code); throw error } }
  const waitFor = async code => {
    for (let i = 0; i < 150; i++) { if (await js(code)) return; await delay(100) }
    throw new Error(`UI condition not met: ${code}\n${await js('document.body.innerText')}`)
  }
  const click = text => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw Error('Button unavailable: ' + ${JSON.stringify(text)}); b.click(); })()`)
  const fill = (index, value) => js(`(() => { const input = document.querySelectorAll('input')[${index}]; if (!input) throw Error('Input missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles: true})); })()`)
  await waitFor("document.body.innerText.includes('Create admin') || document.body.innerText.includes('Sign in')")
  if (!(await js("document.body.innerText.includes('Create admin')"))) {
    console.log('PASS: Existing PostgreSQL database opened the production sign-in screen.')
    clearTimeout(deadline)
    app.quit()
    return
  }
  assert.equal(await js('typeof window.require'), 'undefined')
  await fill(0, 'admin')
  await fill(1, 'UI Test Administrator')
  await fill(2, 'UI-test-passphrase-123!')
  await fill(3, 'UI-test-passphrase-123!')
  await click('Create admin')
  await waitFor("document.body.innerText.includes('Sign in') && !document.body.innerText.includes('Confirm password')")
  await fill(0, 'admin')
  await fill(1, 'UI-test-passphrase-123!')
  await click('Sign in')
  await waitFor("document.body.innerText.includes('Checkout') && document.body.innerText.includes('Products')")
  const created = await js(`(async () => { const c = await window.api.getCategories(); return window.api.createProduct({productName:'UI Test Product',categoryId:c.data[0].categoryId,purchasePrice:25,sellingPrice:50,stockQuantity:10,reorderLevel:2},9999); })()`)
  assert.equal(created.success, true, created.message)
  // Exercise navigation and its data-loading IPC.
  for (const text of ['Products', 'Stock', 'Backups', 'Debts', 'Reports', 'Users', 'Settings', 'My Account', 'Checkout']) {
    await click(text)
    await delay(200)
    assert.ok(!(await js('document.body.innerText')).includes('Something went wrong.'))
  }
  await waitFor("document.body.innerText.includes('UI Test Product')")
  await js(`(() => { const card = [...document.querySelectorAll('button')].find(b => b.textContent.includes('UI Test Product')); if (!card) throw Error('Product card missing'); card.click(); })()`)
  await waitFor("document.body.innerText.includes('Review Bill')")
  // Amount received is a named field in checkout.
  await js(`(() => { const input = [...document.querySelectorAll('input')].find(i => i.placeholder === 'Amount received'); if (!input) throw Error('Payment input missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'50'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await click('Review Bill')
  await waitFor("!!document.querySelector('[role=dialog]')")
  await js(`(() => { const buttons = [...document.querySelectorAll('[role=dialog] button')]; const b = buttons.find(b => /Complete|Confirm|Save Sale/.test(b.textContent)); if (!b) throw Error('Complete sale button missing: ' + buttons.map(b=>b.textContent)); b.click(); })()`)
  await waitFor("document.body.innerText.includes('Purchase receipt')")
  const sales = await js('window.api.getTodaySales()')
  assert.equal(sales.success, true)
  assert.equal(sales.data.length, 1)
  assert.equal(sales.data[0].NetTotal, 50)
  assert.equal(await js("document.querySelector('.print-receipt').textContent.includes('UI Test Product')"), true)
  const pdf = await window.webContents.printToPDF({ printBackground: true })
  fs.writeFileSync(path.join(artifactDir, 'receipt.pdf'), pdf)
  assert.ok(pdf.length > 1000)
  console.log('Receipt PDF generated.')
  await click('Close')
  console.log('Checkout controls verified.')
  await click('My Account')
  await fill(0, 'UI-test-passphrase-123!')
  await fill(1, 'UI-new-passphrase-123!')
  await fill(2, 'UI-new-passphrase-123!')
  await click('Change Password')
  await waitFor("document.body.innerText.includes('Password changed successfully')")
  await click('Users')
  await delay(200)
  await fill(0, 'cashier')
  await fill(1, 'UI Test Cashier')
  await fill(2, 'UI-cashier-password!')
  await click('Create User')
  await waitFor("document.querySelector('tbody').innerText.includes('UI Test Cashier')")
  await click('Deactivate')
  await waitFor("document.querySelector('tbody').innerText.includes('Inactive')")
  await click('Activate')
  await waitFor("!document.querySelector('tbody').innerText.includes('Inactive')")
  const debt = await js(`(async () => {
    const p = (await window.api.getProducts()).data[0];
    return window.api.completeSale({ userId:9999, cartItems:[{productId:p.productId,quantity:1,lineDiscount:0}], paidAmount:10, paymentMethod:'Cash', customerName:'UI Customer', customerFatherName:'Parent', customerPhone:'03001234567' });
  })()`)
  assert.equal(debt.success, true, debt.message)
  await click('Debts')
  await waitFor("document.body.innerText.includes('UI Customer')")
  await js(`(() => { const select = document.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,String(${debt.customerId})); select.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await fill(0, '40')
  await click('Record Payment')
  await waitFor("document.body.innerText.includes('Payment recorded')")
  assert.equal((await js('window.api.getCustomerDebts()')).data.length, 0)
  const report = await js("window.api.exportSalesPdf('2020-01-01','2030-12-31')")
  assert.equal(report.success, true, report.message)
  assert.ok(fs.statSync(report.data.filePath).size > 1000)
  const workbook = await js('window.api.exportDataExcel()')
  assert.equal(workbook.success, true, workbook.message)
  assert.ok(fs.readFileSync(workbook.data.filePath, 'utf8').includes('UI Test Product'))
  assert.ok(!fs.readFileSync(workbook.data.filePath, 'utf8').includes('PasswordHash'))
  console.log('Account, users, repayment, PDF report and workbook verified.')
  const backup = await js('window.api.createBackup(9999)')
  assert.equal(backup.success, true, backup.message)
  console.log('PASS: Linux window, setup/login, all navigation screens, product selection, checkout, real IPC/SQLite, password change, users, repayment, receipt/report PDF, workbook and backup.')
  clearTimeout(deadline)
  app.quit()
}
app.on('will-quit', () => { clearTimeout(deadline); fs.rmSync(temp, {recursive:true,force:true}) })
require('../out/main/main.js')
