// Minimal frontend logic for products + backups

function showTab(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'))
  const el = document.getElementById(id)
  if (el) el.classList.remove('hidden')
}

async function login() {
  // simple stub: call getProducts to verify API
  try {
    const products = await window.api.getProducts()
    if (products?.length >= 0) {
      document.getElementById('login').classList.add('hidden')
      document.getElementById('app').classList.remove('hidden')
      document.getElementById('currentUser').textContent = 'Local'
      loadProducts('')
    }
  } catch (e) {
    document.getElementById('loginMessage').textContent = 'Unable to connect to backend'
  }
}

// Products
async function loadProducts(term) {
  const list = document.getElementById('products')
  list.innerHTML = 'Loading...'
  try {
    const products = term ? await window.api.searchProducts(term) : await window.api.getProducts()
    list.innerHTML = ''
    for (const p of products || []) {
      const item = document.createElement('div')
      item.className = 'list-item'
      item.textContent = `${p.productName} (${p.stockQuantity})`
      item.onclick = () => showProduct(p)
      list.appendChild(item)
    }
  } catch (err) {
    list.innerHTML = 'Error loading products'
  }
}

function showProduct(p) {
  document.getElementById('productId').value = p.productId
  document.getElementById('productName').value = p.productName || ''
  document.getElementById('barcode').value = p.barcode || ''
  document.getElementById('brand').value = p.brand || ''
  document.getElementById('purchasePrice').value = p.purchasePrice || 0
  document.getElementById('sellingPrice').value = p.sellingPrice || 0
  document.getElementById('stockQuantity').value = p.stockQuantity || 0
  document.getElementById('reorderLevel').value = p.reorderLevel || 0
  // load backups
  loadProductBackups(p.productId)
}

async function loadProductBackups(productId) {
  const container = document.getElementById('productBackups')
  container.innerHTML = 'Loading backups...'
  try {
    const res = await window.api.getProductBackups(productId)
    if (!res || !res.success) {
      container.innerHTML = 'No backups or error.'
      return
    }
    const rows = res.data || []
    if (!rows.length) {
      container.innerHTML = '<em>No backups found for this product.</em>'
      return
    }
    container.innerHTML = ''
    for (const r of rows) {
      const div = document.createElement('div')
      div.className = 'backup-item'
      const btn = document.createElement('button')
      btn.textContent = `${r.Action} — ${new Date(r.CreatedAt).toLocaleString()}`
      btn.onclick = () => viewBackupFile(r.DataPath)
      div.appendChild(btn)
      const meta = document.createElement('small')
      meta.textContent = `Checksum: ${r.ChecksumSha256 || ''}`
      div.appendChild(meta)
      container.appendChild(div)
    }
  } catch (e) {
    container.innerHTML = 'Error loading backups.'
  }
}

async function viewBackupFile(path) {
  const container = document.getElementById('productBackups')
  const viewer = document.createElement('pre')
  viewer.style.maxHeight = '300px'
  viewer.style.overflow = 'auto'
  viewer.textContent = 'Loading file...'
  container.appendChild(viewer)
  try {
    const res = await window.api.readProductBackupFile(path)
    if (!res || !res.success) {
      viewer.textContent = 'Unable to read file: ' + (res?.message || 'error')
      return
    }
    viewer.textContent = JSON.stringify(res.data, null, 2)
  } catch (e) {
    viewer.textContent = 'Error reading file'
  }
}

// Provide minimal stubs for other actions used by index.html so absence of full app doesn't break
function saveProduct() { document.getElementById('productMessage').textContent = 'Save not implemented in this demo' }
function adjustStock() { document.getElementById('productMessage').textContent = 'Adjust not implemented in this demo' }
function backup() { window.api.createBackup(1).then(r => document.getElementById('backupMessage').textContent = r?.message || 'done') }

// expose for debugging
window.showTab = showTab
window.login = login
window.loadProducts = loadProducts
window.saveProduct = saveProduct
window.adjustStock = adjustStock
window.backup = backup
