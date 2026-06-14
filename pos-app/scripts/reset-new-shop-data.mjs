import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BCRYPT_ROUNDS = 12
const appDataDir = path.join(os.homedir(), '.config', 'securestore-pos')
const liveDbPath = path.join(appDataDir, 'SecureStorePOS.db')
const devDbPath = path.resolve('data', 'securestore-pos.sqlite')
const explicitDbPaths = process.argv.slice(2)
const targetDbPaths = explicitDbPaths.length > 0 ? explicitDbPaths : [liveDbPath, devDbPath]
const shouldCleanAppData = explicitDbPaths.length === 0
const backupDir = path.join(appDataDir, 'Backups')
const logsDir = path.join(appDataDir, 'Logs')
const browserDataDirs = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Local Storage',
  'Session Storage',
  'Shared Dictionary',
  'blob_storage'
]

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

const defaultSettings = [
  ['ShopName', 'SecureStore POS', 'Shop display name'],
  ['ShopAddress', '123 Main Street, City', 'Shop address on receipts'],
  ['ShopPhone', '+1-555-0100', 'Shop phone number'],
  ['ShopEmail', 'store@securestore.com', 'Shop email address'],
  ['Currency', 'PKR', 'Currency code'],
  ['CurrencySymbol', 'Rs', 'Currency symbol'],
  ['TaxPercent', '0', 'Default tax percentage'],
  ['SessionTimeoutMinutes', '30', 'Session inactivity timeout'],
  ['MaxFailedLoginAttempts', '5', 'Max failed logins before lock'],
  ['BackupFolderPath', 'Backups', 'Folder for database backups'],
  ['AutoBackupEnabled', 'true', 'Enable automatic daily backup'],
  ['BackupRetentionDays', '30', 'Days to keep automatic backup files'],
  ['MinimumDataRetentionDays', '365', 'Minimum days to retain sales, customer, inventory, and audit data'],
  ['LowStockThreshold', '10', 'Default reorder level'],
  ['CashierMaxDiscountPercent', '5', 'Max discount cashier can apply'],
  ['AdminMaxDiscountPercent', '100', 'Max discount admin can apply'],
  ['ReceiptHeaderMessage', 'Original sale receipt', 'Receipt header text'],
  ['ReceiptFooterMessage', 'Thank you for shopping with us!', 'Receipt footer text'],
  ['ReceiptShowPhone', 'true', 'Show phone on receipts'],
  ['ReceiptShowAddress', 'true', 'Show address on receipts'],
  ['InvoicePrefix', 'POS', 'Invoice number prefix']
]

const resetTables = [
  'ProductBackups',
  'Payments',
  'SaleItems',
  'InventoryTransactions',
  'Sales',
  'Customers',
  'Products',
  'AuditLogs',
  'BackupLogs'
]

const countTables = [
  'Products',
  'Customers',
  'Sales',
  'SaleItems',
  'Payments',
  'InventoryTransactions',
  'AuditLogs',
  'BackupLogs',
  'ProductBackups',
  'Categories',
  'Users',
  'Settings'
]

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName))
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return columns.some((column) => column.name === columnName)
}

function tableCount(db, tableName) {
  if (!tableExists(db, tableName)) return 0
  return db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count
}

function counts(db) {
  return Object.fromEntries(countTables.map((table) => [table, tableCount(db, table)]))
}

function removeDirectoryFiles(dir) {
  let removed = 0
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    return removed
  }

  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.lstatSync(fullPath)
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true })
      removed += 1
    } else {
      fs.unlinkSync(fullPath)
      removed += 1
    }
  }

  return removed
}

function removeDbSidecars(dbPath) {
  let removed = 0
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${dbPath}${suffix}`
    if (fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sidecarPath)
      removed += 1
    }
  }
  return removed
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Roles (
      RoleID   INTEGER PRIMARY KEY AUTOINCREMENT,
      RoleName TEXT    NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS Users (
      UserID              INTEGER PRIMARY KEY AUTOINCREMENT,
      Username            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      PasswordHash        TEXT    NOT NULL,
      FullName            TEXT    NOT NULL,
      RoleID              INTEGER NOT NULL REFERENCES Roles(RoleID) ON DELETE RESTRICT,
      Status              TEXT    NOT NULL DEFAULT 'Active',
      FailedLoginAttempts INTEGER NOT NULL DEFAULT 0 CHECK (FailedLoginAttempts >= 0),
      LastLoginAt         TEXT,
      LockedUntil         TEXT,
      CreatedAt           TEXT    NOT NULL DEFAULT (datetime('now')),
      UpdatedAt           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON Users(Username);
    CREATE INDEX IF NOT EXISTS idx_users_role ON Users(RoleID);

    CREATE TABLE IF NOT EXISTS Categories (
      CategoryID   INTEGER PRIMARY KEY AUTOINCREMENT,
      CategoryName TEXT    NOT NULL UNIQUE,
      Description  TEXT,
      IsActive     INTEGER NOT NULL DEFAULT 1,
      CreatedAt    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Products (
      ProductID     INTEGER PRIMARY KEY AUTOINCREMENT,
      ProductName   TEXT    NOT NULL,
      CategoryID    INTEGER NOT NULL REFERENCES Categories(CategoryID) ON DELETE RESTRICT,
      Brand         TEXT,
      Barcode       TEXT,
      PurchasePrice REAL    NOT NULL DEFAULT 0 CHECK (PurchasePrice >= 0),
      SellingPrice  REAL    NOT NULL CHECK (SellingPrice > 0),
      StockQuantity INTEGER NOT NULL DEFAULT 0 CHECK (StockQuantity >= 0),
      ReorderLevel  INTEGER NOT NULL DEFAULT 10 CHECK (ReorderLevel >= 0),
      IsActive      INTEGER NOT NULL DEFAULT 1,
      CreatedAt     TEXT    NOT NULL DEFAULT (datetime('now')),
      UpdatedAt     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_name ON Products(ProductName);
    CREATE INDEX IF NOT EXISTS idx_products_category ON Products(CategoryID);
    CREATE INDEX IF NOT EXISTS idx_products_active ON Products(IsActive);
    CREATE INDEX IF NOT EXISTS idx_products_active_stock ON Products(IsActive, StockQuantity);

    CREATE TABLE IF NOT EXISTS Customers (
      CustomerID    INTEGER PRIMARY KEY AUTOINCREMENT,
      AccountNumber TEXT UNIQUE,
      FullName      TEXT    NOT NULL,
      FatherName    TEXT,
      Phone         TEXT,
      Email         TEXT,
      Address       TEXT,
      LoyaltyPoints REAL    NOT NULL DEFAULT 0,
      IsActive      INTEGER NOT NULL DEFAULT 1,
      CreatedAt     TEXT    NOT NULL DEFAULT (datetime('now')),
      UpdatedAt     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_customers_name ON Customers(FullName);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON Customers(Phone);
    CREATE INDEX IF NOT EXISTS idx_customers_active ON Customers(IsActive);

    CREATE TABLE IF NOT EXISTS Sales (
      SaleID          INTEGER PRIMARY KEY AUTOINCREMENT,
      InvoiceNumber   TEXT    NOT NULL UNIQUE,
      UserID          INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE RESTRICT,
      CustomerID      INTEGER REFERENCES Customers(CustomerID) ON DELETE SET NULL,
      SaleDate        TEXT    NOT NULL DEFAULT (datetime('now')),
      SubTotal        REAL    NOT NULL DEFAULT 0,
      DiscountAmount  REAL    NOT NULL DEFAULT 0,
      DiscountPercent REAL    NOT NULL DEFAULT 0,
      TaxAmount       REAL    NOT NULL DEFAULT 0,
      NetTotal        REAL    NOT NULL DEFAULT 0,
      PaidAmount      REAL    NOT NULL DEFAULT 0,
      ChangeAmount    REAL    NOT NULL DEFAULT 0,
      PaymentStatus   TEXT    NOT NULL DEFAULT 'Completed',
      Notes           TEXT,
      IsVoided        INTEGER NOT NULL DEFAULT 0,
      CreatedAt       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sales_date ON Sales(SaleDate);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON Sales(InvoiceNumber);
    CREATE INDEX IF NOT EXISTS idx_sales_user ON Sales(UserID);
    CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON Sales(PaymentStatus, IsVoided);

    CREATE TABLE IF NOT EXISTS SaleItems (
      SaleItemID   INTEGER PRIMARY KEY AUTOINCREMENT,
      SaleID       INTEGER NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
      ProductID    INTEGER NOT NULL REFERENCES Products(ProductID) ON DELETE RESTRICT,
      ProductName  TEXT    NOT NULL,
      Quantity     INTEGER NOT NULL CHECK (Quantity > 0),
      UnitPrice    REAL    NOT NULL CHECK (UnitPrice >= 0),
      UnitCost     REAL    NOT NULL DEFAULT 0 CHECK (UnitCost >= 0),
      LineDiscount REAL    NOT NULL DEFAULT 0 CHECK (LineDiscount >= 0),
      LineTotal    REAL    NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_saleitems_sale ON SaleItems(SaleID);
    CREATE INDEX IF NOT EXISTS idx_saleitems_product ON SaleItems(ProductID);
    CREATE INDEX IF NOT EXISTS idx_saleitems_product_sale ON SaleItems(ProductID, SaleID);

    CREATE TABLE IF NOT EXISTS ProductBackups (
      ProductBackupID INTEGER PRIMARY KEY AUTOINCREMENT,
      ProductID       INTEGER,
      Action          TEXT    NOT NULL,
      DataPath        TEXT    NOT NULL,
      ChecksumSha256  TEXT,
      CreatedByUserID INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
      CreatedAt       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_productbackups_product ON ProductBackups(ProductID);

    CREATE TABLE IF NOT EXISTS Payments (
      PaymentID     INTEGER PRIMARY KEY AUTOINCREMENT,
      SaleID        INTEGER NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
      PaymentMethod TEXT    NOT NULL DEFAULT 'Cash',
      Amount        REAL    NOT NULL CHECK (Amount > 0),
      PaymentDate   TEXT    NOT NULL DEFAULT (datetime('now')),
      ReferenceNo   TEXT,
      Notes         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payments_sale ON Payments(SaleID);

    CREATE TABLE IF NOT EXISTS InventoryTransactions (
      InventoryTransactionID INTEGER PRIMARY KEY AUTOINCREMENT,
      ProductID              INTEGER NOT NULL REFERENCES Products(ProductID) ON DELETE RESTRICT,
      TransactionType        TEXT    NOT NULL,
      QuantityChange         INTEGER NOT NULL,
      OldStock               INTEGER NOT NULL,
      NewStock               INTEGER NOT NULL,
      UserID                 INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE RESTRICT,
      Reason                 TEXT,
      SaleID                 INTEGER,
      CreatedAt              TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inv_product ON InventoryTransactions(ProductID);
    CREATE INDEX IF NOT EXISTS idx_inv_createdat ON InventoryTransactions(CreatedAt);

    CREATE TABLE IF NOT EXISTS AuditLogs (
      AuditLogID  INTEGER PRIMARY KEY AUTOINCREMENT,
      UserID      INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
      Action      TEXT    NOT NULL,
      EntityName  TEXT    NOT NULL,
      EntityID    TEXT,
      Description TEXT    NOT NULL,
      DeviceName  TEXT    NOT NULL DEFAULT '',
      IPAddress   TEXT,
      CreatedAt   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_createdat ON AuditLogs(CreatedAt);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON AuditLogs(UserID);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON AuditLogs(Action);

    CREATE TABLE IF NOT EXISTS Settings (
      SettingID    INTEGER PRIMARY KEY AUTOINCREMENT,
      SettingKey   TEXT    NOT NULL UNIQUE,
      SettingValue TEXT    NOT NULL,
      Description  TEXT,
      UpdatedAt    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS BackupLogs (
      BackupID          INTEGER PRIMARY KEY AUTOINCREMENT,
      BackupPath        TEXT    NOT NULL,
      FileSizeBytes     INTEGER NOT NULL DEFAULT 0,
      BackupDate        TEXT    NOT NULL DEFAULT (datetime('now')),
      CreatedByUserID   INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
      Status            TEXT    NOT NULL DEFAULT 'Success',
      ErrorMessage      TEXT,
      IsAutomatic       INTEGER NOT NULL DEFAULT 0,
      ChecksumSha256    TEXT,
      MetadataPath      TEXT,
      VerifiedAt        TEXT,
      LastRestoredAt    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_backup_date ON BackupLogs(BackupDate);
  `)

  if (!columnExists(db, 'Products', 'Barcode')) db.exec('ALTER TABLE Products ADD COLUMN Barcode TEXT;')
  if (!columnExists(db, 'Customers', 'AccountNumber')) db.exec('ALTER TABLE Customers ADD COLUMN AccountNumber TEXT;')
  if (!columnExists(db, 'Customers', 'FatherName')) db.exec('ALTER TABLE Customers ADD COLUMN FatherName TEXT;')
  if (!columnExists(db, 'Customers', 'UpdatedAt')) db.exec('ALTER TABLE Customers ADD COLUMN UpdatedAt TEXT;')
  if (!columnExists(db, 'Sales', 'CustomerID')) db.exec('ALTER TABLE Sales ADD COLUMN CustomerID INTEGER;')
  if (!columnExists(db, 'Sales', 'Notes')) db.exec('ALTER TABLE Sales ADD COLUMN Notes TEXT;')
  if (!columnExists(db, 'SaleItems', 'UnitCost')) db.exec('ALTER TABLE SaleItems ADD COLUMN UnitCost REAL NOT NULL DEFAULT 0 CHECK (UnitCost >= 0);')
  if (!columnExists(db, 'BackupLogs', 'ChecksumSha256')) db.exec('ALTER TABLE BackupLogs ADD COLUMN ChecksumSha256 TEXT;')
  if (!columnExists(db, 'BackupLogs', 'MetadataPath')) db.exec('ALTER TABLE BackupLogs ADD COLUMN MetadataPath TEXT;')
  if (!columnExists(db, 'BackupLogs', 'VerifiedAt')) db.exec('ALTER TABLE BackupLogs ADD COLUMN VerifiedAt TEXT;')
  if (!columnExists(db, 'BackupLogs', 'LastRestoredAt')) db.exec('ALTER TABLE BackupLogs ADD COLUMN LastRestoredAt TEXT;')

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON Products(Barcode);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_account_number ON Customers(AccountNumber);
    CREATE INDEX IF NOT EXISTS idx_customers_updated ON Customers(UpdatedAt);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON Sales(CustomerID);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_date ON Sales(CustomerID, SaleDate);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_payment ON Sales(CustomerID, PaymentStatus, IsVoided);

    CREATE TRIGGER IF NOT EXISTS trg_customers_insert_updated_at
    AFTER INSERT ON Customers
    FOR EACH ROW
    WHEN NEW.UpdatedAt IS NULL
    BEGIN
      UPDATE Customers SET UpdatedAt = datetime('now') WHERE CustomerID = NEW.CustomerID;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_customers_update_updated_at
    AFTER UPDATE ON Customers
    FOR EACH ROW
    WHEN NEW.UpdatedAt = OLD.UpdatedAt
    BEGIN
      UPDATE Customers SET UpdatedAt = datetime('now') WHERE CustomerID = NEW.CustomerID;
    END;
  `)
}

function resetLookupData(db) {
  const insertRole = db.prepare('INSERT OR IGNORE INTO Roles (RoleName) VALUES (?)')
  insertRole.run('Admin')
  insertRole.run('Cashier')

  db.prepare("DELETE FROM Roles WHERE RoleName NOT IN ('Admin', 'Cashier')").run()

  const insertCategory = db.prepare('INSERT INTO Categories (CategoryName, Description, IsActive) VALUES (?, ?, 1)')
  db.prepare('DELETE FROM Categories').run()
  for (const category of categories) insertCategory.run(...category)

  const insertSetting = db.prepare('INSERT INTO Settings (SettingKey, SettingValue, Description) VALUES (?, ?, ?)')
  db.prepare('DELETE FROM Settings').run()
  for (const setting of defaultSettings) insertSetting.run(...setting)
}

function ensureSingleAdmin(db) {
  const adminRole = db.prepare("SELECT RoleID FROM Roles WHERE RoleName = 'Admin'").get()
  if (!adminRole) throw new Error('Admin role could not be created.')

  const existingAdmin = db.prepare(`
    SELECT u.UserID
    FROM Users u
    JOIN Roles r ON u.RoleID = r.RoleID
    WHERE r.RoleName = 'Admin'
    ORDER BY CASE WHEN lower(u.Username) = 'admin' THEN 0 ELSE 1 END, u.UserID
    LIMIT 1
  `).get()

  let keepUserId = existingAdmin?.UserID
  if (!keepUserId) {
    const adminPassword = (process.env.POS_RESET_ADMIN_PASSWORD || process.env.POS_INITIAL_ADMIN_PASSWORD || '').trim()
    if (adminPassword.length < 12) {
      throw new Error('No admin exists. Set POS_RESET_ADMIN_PASSWORD or POS_INITIAL_ADMIN_PASSWORD to at least 12 characters before resetting this database.')
    }

    const info = db.prepare(`
      INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status)
      VALUES ('admin', ?, 'System Administrator', ?, 'Active')
    `).run(bcrypt.hashSync(adminPassword, BCRYPT_ROUNDS), adminRole.RoleID)
    keepUserId = Number(info.lastInsertRowid)
  }

  db.prepare('DELETE FROM Users WHERE UserID != ?').run(keepUserId)
  db.prepare(`
    UPDATE Users
    SET Username = 'admin',
        FullName = CASE WHEN trim(FullName) = '' THEN 'System Administrator' ELSE FullName END,
        RoleID = ?,
        Status = 'Active',
        FailedLoginAttempts = 0,
        LastLoginAt = NULL,
        LockedUntil = NULL,
        UpdatedAt = datetime('now')
    WHERE UserID = ?
  `).run(adminRole.RoleID, keepUserId)
}

function resetSequences(db) {
  if (!tableExists(db, 'sqlite_sequence')) return

  const emptyTables = [...resetTables, 'Categories', 'Settings']
  db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${emptyTables.map(() => '?').join(',')})`).run(...emptyTables)

  for (const table of ['Users', 'Roles']) {
    const maxId = db.prepare(`SELECT IFNULL(MAX(rowid), 0) as maxId FROM ${table}`).get().maxId
    db.prepare('INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, maxId)
  }
}

function resetDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) return null

  const db = new Database(dbPath)
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = OFF')
  db.pragma('wal_checkpoint(TRUNCATE)')
  ensureSchema(db)

  const before = counts(db)
  const reset = db.transaction(() => {
    for (const table of resetTables) {
      if (tableExists(db, table)) db.prepare(`DELETE FROM ${table}`).run()
    }

    resetLookupData(db)
    ensureSingleAdmin(db)
    resetSequences(db)
  })

  reset()
  db.pragma('foreign_keys = ON')
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.exec('VACUUM')
  db.pragma('optimize')
  const after = counts(db)
  db.close()
  const removedSidecars = removeDbSidecars(dbPath)

  return { dbPath, before, after, removedSidecars }
}

const results = targetDbPaths.map((dbPath) => resetDatabase(path.resolve(dbPath))).filter(Boolean)

if (results.length === 0) {
  throw new Error(`No SecureStore POS database found. Checked ${targetDbPaths.join(', ')}.`)
}

for (const result of results) {
  console.log(`Reset database: ${result.dbPath}`)
  console.log(`Before: ${JSON.stringify(result.before)}`)
  console.log(`After:  ${JSON.stringify(result.after)}`)
  console.log(`Removed SQLite sidecar files: ${result.removedSidecars}`)
}

if (shouldCleanAppData) {
  const removedBackups = removeDirectoryFiles(backupDir)
  const removedLogs = removeDirectoryFiles(logsDir)
  let removedBrowserData = 0
  for (const dirName of browserDataDirs) {
    const target = path.join(appDataDir, dirName)
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
      removedBrowserData += 1
    }
  }

  console.log(`Removed app backup files: ${removedBackups}`)
  console.log(`Removed app log files: ${removedLogs}`)
  console.log(`Removed browser storage/cache folders: ${removedBrowserData}`)
}
