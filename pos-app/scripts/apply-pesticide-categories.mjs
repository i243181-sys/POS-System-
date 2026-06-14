import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const appDataDir = path.join(os.homedir(), '.config', 'securestore-pos')
const liveDbPath = process.argv[2] || path.join(appDataDir, 'SecureStorePOS.db')
const devDbPath = path.resolve('data', 'securestore-pos.sqlite')

const categories = [
  ['Wheat', 'Pesticides, herbicides, fungicides, seed treatment, and crop inputs for wheat'],
  ['Sugar Cane', 'Crop protection and nutrition products for sugar cane'],
  ['Cotton', 'Insecticides, herbicides, fungicides, and growth support products for cotton'],
  ['Rice / Paddy', 'Crop protection and field inputs for rice and paddy'],
  ['Maize / Corn', 'Pesticides and crop inputs for maize and corn'],
  ['Vegetables', 'Crop protection products for vegetable crops'],
  ['Fruits & Orchards', 'Pesticides, fungicides, and nutrition products for fruit crops and orchards'],
  ['Herbicides', 'Weed control products for field and row crops'],
  ['Insecticides', 'Products for control of insects, borers, sucking pests, and mites'],
  ['Fungicides', 'Products for fungal disease control and seed or foliar protection'],
  ['Fertilizers & Micronutrients', 'Foliar feeds, micronutrients, and soil nutrition products'],
  ['Seeds & Field Supplies', 'Seeds, sprayers, safety items, and other field supplies']
]

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName))
}

function productCount(db) {
  if (!tableExists(db, 'Products')) return 0
  return db.prepare('SELECT COUNT(*) as count FROM Products').get().count
}

function applyCategories(dbPath) {
  if (!fs.existsSync(dbPath)) return null

  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  if (!tableExists(db, 'Categories')) {
    db.close()
    throw new Error(`Categories table does not exist in ${dbPath}`)
  }
  if (productCount(db) > 0) {
    db.close()
    throw new Error(`Refusing to replace categories in ${dbPath} because products already exist.`)
  }

  const update = db.transaction(() => {
    db.prepare('DELETE FROM Categories').run()
    if (tableExists(db, 'sqlite_sequence')) {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'Categories'").run()
    }
    const insert = db.prepare('INSERT INTO Categories (CategoryName, Description, IsActive) VALUES (?, ?, 1)')
    for (const category of categories) insert.run(...category)
  })

  update()
  const rows = db.prepare('SELECT CategoryName FROM Categories ORDER BY CategoryID').all()
  db.close()

  return { dbPath, categories: rows.map((row) => row.CategoryName) }
}

const results = [applyCategories(liveDbPath), applyCategories(devDbPath)].filter(Boolean)
if (results.length === 0) {
  throw new Error(`No SecureStore POS database found. Checked ${liveDbPath} and ${devDbPath}.`)
}

for (const result of results) {
  console.log(`Updated categories in: ${result.dbPath}`)
  console.log(result.categories.join(', '))
}
