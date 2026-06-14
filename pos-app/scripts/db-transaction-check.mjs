import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'securestore-pos-db-'))
const dbPath = path.join(tempDir, 'SecureStorePOS-test.db')
const db = new Database(dbPath)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function money(value) {
  return Math.round(Number(value) * 100) / 100
}

function counts() {
  return {
    products: db.prepare('SELECT COUNT(*) as count FROM Products').get().count,
    customers: db.prepare('SELECT COUNT(*) as count FROM Customers').get().count,
    sales: db.prepare('SELECT COUNT(*) as count FROM Sales').get().count,
    items: db.prepare('SELECT COUNT(*) as count FROM SaleItems').get().count,
    payments: db.prepare('SELECT COUNT(*) as count FROM Payments').get().count,
    inventory: db.prepare('SELECT COUNT(*) as count FROM InventoryTransactions').get().count,
    saleAudits: db.prepare("SELECT COUNT(*) as count FROM AuditLogs WHERE Action = 'SALE_COMPLETED'").get().count,
    backupLogs: db.prepare('SELECT COUNT(*) as count FROM ProductBackups').get().count,
    paymentTotal: money(db.prepare('SELECT IFNULL(SUM(Amount), 0) as total FROM Payments').get().total),
    stock: db.prepare('SELECT StockQuantity FROM Products WHERE ProductID = 1').get().StockQuantity
  }
}

function assertCountsUnchanged(before, label) {
  assert(JSON.stringify(counts()) === JSON.stringify(before), `${label} changed database state.`)
}

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('synchronous = FULL')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE Roles (
    RoleID INTEGER PRIMARY KEY AUTOINCREMENT,
    RoleName TEXT NOT NULL UNIQUE CHECK (RoleName IN ('Admin','Cashier'))
  );
  CREATE TABLE Users (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    PasswordHash TEXT NOT NULL,
    FullName TEXT NOT NULL,
    RoleID INTEGER NOT NULL REFERENCES Roles(RoleID) ON DELETE RESTRICT,
    Status TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Inactive','Locked')),
    FailedLoginAttempts INTEGER NOT NULL DEFAULT 0 CHECK (FailedLoginAttempts >= 0),
    LastLoginAt TEXT,
    LockedUntil TEXT,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE Categories (
    CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
    CategoryName TEXT NOT NULL UNIQUE,
    Description TEXT,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE Products (
    ProductID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductName TEXT NOT NULL,
    CategoryID INTEGER NOT NULL REFERENCES Categories(CategoryID) ON DELETE RESTRICT,
    Brand TEXT,
    Barcode TEXT,
    PurchasePrice REAL NOT NULL DEFAULT 0 CHECK (PurchasePrice >= 0),
    SellingPrice REAL NOT NULL CHECK (SellingPrice > 0),
    StockQuantity INTEGER NOT NULL DEFAULT 0 CHECK (StockQuantity >= 0),
    ReorderLevel INTEGER NOT NULL DEFAULT 10 CHECK (ReorderLevel >= 0),
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE Customers (
    CustomerID INTEGER PRIMARY KEY AUTOINCREMENT,
    AccountNumber TEXT UNIQUE,
    FullName TEXT NOT NULL,
    FatherName TEXT,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    LoyaltyPoints REAL NOT NULL DEFAULT 0,
    IsActive INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE Sales (
    SaleID INTEGER PRIMARY KEY AUTOINCREMENT,
    InvoiceNumber TEXT NOT NULL UNIQUE,
    UserID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE RESTRICT,
    CustomerID INTEGER REFERENCES Customers(CustomerID) ON DELETE SET NULL,
    SaleDate TEXT NOT NULL DEFAULT (datetime('now')),
    SubTotal REAL NOT NULL DEFAULT 0,
    DiscountAmount REAL NOT NULL DEFAULT 0,
    DiscountPercent REAL NOT NULL DEFAULT 0,
    TaxAmount REAL NOT NULL DEFAULT 0,
    NetTotal REAL NOT NULL DEFAULT 0,
    PaidAmount REAL NOT NULL DEFAULT 0,
    ChangeAmount REAL NOT NULL DEFAULT 0,
    PaymentStatus TEXT NOT NULL DEFAULT 'Completed' CHECK (PaymentStatus IN ('Pending','Completed','Refunded','Voided')),
    Notes TEXT,
    IsVoided INTEGER NOT NULL DEFAULT 0,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE SaleItems (
    SaleItemID INTEGER PRIMARY KEY AUTOINCREMENT,
    SaleID INTEGER NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
    ProductID INTEGER NOT NULL REFERENCES Products(ProductID) ON DELETE RESTRICT,
    ProductName TEXT NOT NULL,
    Quantity INTEGER NOT NULL CHECK (Quantity > 0),
    UnitPrice REAL NOT NULL CHECK (UnitPrice >= 0),
    UnitCost REAL NOT NULL DEFAULT 0 CHECK (UnitCost >= 0),
    LineDiscount REAL NOT NULL DEFAULT 0 CHECK (LineDiscount >= 0),
    LineTotal REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE ProductBackups (
    ProductBackupID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductID INTEGER,
    Action TEXT NOT NULL,
    DataPath TEXT NOT NULL,
    ChecksumSha256 TEXT,
    CreatedByUserID INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE Payments (
    PaymentID INTEGER PRIMARY KEY AUTOINCREMENT,
    SaleID INTEGER NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
    PaymentMethod TEXT NOT NULL DEFAULT 'Cash' CHECK (PaymentMethod IN ('Cash','Card','MobilePayment','Cheque','Other')),
    Amount REAL NOT NULL CHECK (Amount > 0),
    PaymentDate TEXT NOT NULL DEFAULT (datetime('now')),
    ReferenceNo TEXT,
    Notes TEXT
  );
  CREATE TABLE InventoryTransactions (
    InventoryTransactionID INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductID INTEGER NOT NULL REFERENCES Products(ProductID) ON DELETE RESTRICT,
    TransactionType TEXT NOT NULL CHECK (TransactionType IN ('Sale','Purchase','Adjustment','Return','Void')),
    QuantityChange INTEGER NOT NULL,
    OldStock INTEGER NOT NULL,
    NewStock INTEGER NOT NULL,
    UserID INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE RESTRICT,
    Reason TEXT,
    SaleID INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE AuditLogs (
    AuditLogID INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
    Action TEXT NOT NULL,
    EntityName TEXT NOT NULL,
    EntityID TEXT,
    Description TEXT NOT NULL,
    DeviceName TEXT NOT NULL DEFAULT '',
    IPAddress TEXT,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE Settings (
    SettingID INTEGER PRIMARY KEY AUTOINCREMENT,
    SettingKey TEXT NOT NULL UNIQUE,
    SettingValue TEXT NOT NULL,
    Description TEXT,
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE BackupLogs (
    BackupID INTEGER PRIMARY KEY AUTOINCREMENT,
    BackupPath TEXT NOT NULL,
    FileSizeBytes INTEGER NOT NULL DEFAULT 0,
    BackupDate TEXT NOT NULL DEFAULT (datetime('now')),
    CreatedByUserID INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
    Status TEXT NOT NULL DEFAULT 'Success' CHECK (Status IN ('Success','Failed')),
    ErrorMessage TEXT,
    IsAutomatic INTEGER NOT NULL DEFAULT 0,
    ChecksumSha256 TEXT,
    MetadataPath TEXT,
    VerifiedAt TEXT,
    LastRestoredAt TEXT
  );
`)

db.prepare('INSERT INTO Roles (RoleName) VALUES (?)').run('Admin')
db.prepare('INSERT INTO Roles (RoleName) VALUES (?)').run('Cashier')
db.prepare(`
  INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status)
  VALUES ('admin', 'test-hash', 'System Administrator', 1, 'Active')
`).run()
db.prepare("INSERT INTO Categories (CategoryName, Description) VALUES ('Wheat', 'Crop inputs')").run()
db.prepare(`
  INSERT INTO Products (ProductName, CategoryID, Brand, Barcode, PurchasePrice, SellingPrice, StockQuantity, ReorderLevel)
  VALUES ('Launch Test Herbicide', 1, 'SecureStore', 'LAUNCH-TEST-1', 30.00, 49.97, 1000, 20)
`).run()
db.prepare("INSERT INTO Settings (SettingKey, SettingValue, Description) VALUES ('InvoicePrefix', 'POS', 'Invoice prefix')").run()
db.prepare("INSERT INTO Settings (SettingKey, SettingValue, Description) VALUES ('AdminMaxDiscountPercent', '100', 'Admin max discount')").run()
db.prepare("INSERT INTO Settings (SettingKey, SettingValue, Description) VALUES ('CashierMaxDiscountPercent', '5', 'Cashier max discount')").run()

const completeSale = db.transaction((req) => {
  const cashier = db.prepare(`
    SELECT u.UserID, r.RoleName
    FROM Users u
    JOIN Roles r ON u.RoleID = r.RoleID
    WHERE u.UserID = ? AND u.Status = 'Active' AND r.RoleName IN ('Admin', 'Cashier')
  `).get(req.userId)
  if (!cashier) throw new Error('Cashier is not allowed to make sales.')
  if (!Array.isArray(req.cartItems) || req.cartItems.length === 0) throw new Error('Cart is empty.')

  const getProduct = db.prepare('SELECT ProductName, SellingPrice, PurchasePrice, StockQuantity FROM Products WHERE ProductID = ? AND IsActive = 1')
  const cartRows = req.cartItems.map((item) => {
    if (!Number.isInteger(item.productId) || item.productId <= 0) throw new Error('Invalid product.')
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Invalid quantity.')
    if (!Number.isFinite(item.lineDiscount) || item.lineDiscount < 0) throw new Error('Invalid discount.')

    const product = getProduct.get(item.productId)
    if (!product) throw new Error('Product unavailable.')
    if (product.StockQuantity < item.quantity) throw new Error('Insufficient stock.')

    const unitPrice = money(product.SellingPrice)
    const unitCost = money(product.PurchasePrice)
    const gross = money(unitPrice * item.quantity)
    if (item.lineDiscount > gross) throw new Error('Line discount exceeds line total.')
    return { item, product, unitPrice, unitCost, lineTotal: money(gross - item.lineDiscount) }
  })

  const subTotal = money(cartRows.reduce((sum, row) => sum + money(row.unitPrice * row.item.quantity), 0))
  const requestedDiscount = req.discountAmount > 0 ? Number(req.discountAmount) : subTotal * Number(req.discountPercent || 0) / 100
  const discountAmount = money(Math.min(requestedDiscount, subTotal))
  const taxAmount = money((subTotal - discountAmount) * (Number(req.taxPercent || 0) / 100))
  const netTotal = money(subTotal - discountAmount + taxAmount)
  const paidAmount = money(req.paidAmount)
  if (!Number.isFinite(paidAmount) || paidAmount < 0) throw new Error('Invalid paid amount.')
  const amountDue = money(Math.max(0, netTotal - paidAmount))
  const changeAmount = money(Math.max(0, paidAmount - netTotal))
  const collectedAmount = money(Math.max(0, paidAmount - changeAmount))
  const paymentStatus = amountDue > 0 ? 'Pending' : 'Completed'

  let customerId = null
  let customerAccountNumber = null
  if (amountDue > 0) {
    if (!req.customerName || !req.customerFatherName || !req.customerPhone) throw new Error('Debt sale needs customer details.')
    const customer = db.prepare(`
      INSERT INTO Customers (FullName, FatherName, Phone, UpdatedAt)
      VALUES (?, ?, ?, datetime('now'))
    `).run(req.customerName, req.customerFatherName, req.customerPhone)
    customerId = Number(customer.lastInsertRowid)
    customerAccountNumber = `CUS-${String(customerId).padStart(6, '0')}`
    db.prepare('UPDATE Customers SET AccountNumber = ? WHERE CustomerID = ?').run(customerAccountNumber, customerId)
  }

  const prefix = 'POS-TEST-'
  const seq = String(db.prepare('SELECT COUNT(*) as count FROM Sales WHERE InvoiceNumber LIKE ?').get(`${prefix}%`).count + 1).padStart(6, '0')
  const invoiceNumber = `${prefix}${seq}`
  const sale = db.prepare(`
    INSERT INTO Sales (InvoiceNumber, UserID, CustomerID, SubTotal, DiscountAmount, DiscountPercent, TaxAmount, NetTotal, PaidAmount, ChangeAmount, PaymentStatus, Notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(invoiceNumber, req.userId, customerId, subTotal, discountAmount, req.discountPercent || 0, taxAmount, netTotal, paidAmount, changeAmount, paymentStatus, req.notes || null)
  const saleId = Number(sale.lastInsertRowid)

  const insertItem = db.prepare(`
    INSERT INTO SaleItems (SaleID, ProductID, ProductName, Quantity, UnitPrice, UnitCost, LineDiscount, LineTotal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateStock = db.prepare('UPDATE Products SET StockQuantity = StockQuantity - ?, UpdatedAt = datetime(\'now\') WHERE ProductID = ? AND StockQuantity >= ?')
  const insertInv = db.prepare(`
    INSERT INTO InventoryTransactions (ProductID, TransactionType, QuantityChange, OldStock, NewStock, UserID, Reason, SaleID)
    VALUES (?, 'Sale', ?, ?, ?, ?, ?, ?)
  `)

  for (const { item, product, unitPrice, unitCost, lineTotal } of cartRows) {
    insertItem.run(saleId, item.productId, product.ProductName, item.quantity, unitPrice, unitCost, item.lineDiscount, lineTotal)
    const stockUpdate = updateStock.run(item.quantity, item.productId, item.quantity)
    if (stockUpdate.changes !== 1) throw new Error('Stock update failed.')
    insertInv.run(item.productId, -item.quantity, product.StockQuantity, product.StockQuantity - item.quantity, req.userId, `Sale ${invoiceNumber}`, saleId)
  }

  if (collectedAmount > 0) {
    db.prepare('INSERT INTO Payments (SaleID, PaymentMethod, Amount, ReferenceNo) VALUES (?, ?, ?, ?)').run(saleId, 'Cash', collectedAmount, null)
  }
  db.prepare(`
    INSERT INTO AuditLogs (UserID, Action, EntityName, EntityID, Description)
    VALUES (?, 'SALE_COMPLETED', 'Sale', ?, ?)
  `).run(req.userId, saleId, `Sale ${invoiceNumber} ${paymentStatus === 'Pending' ? 'saved with unpaid balance' : 'completed'} for ${netTotal.toFixed(2)}.`)

  return { saleId, invoiceNumber, netTotal, paidAmount, changeAmount, collectedAmount, amountDue, paymentStatus, customerId, customerAccountNumber }
})

const beforeFailures = counts()
for (const [label, badRequest] of [
  ['bad stock', { userId: 1, cartItems: [{ productId: 1, quantity: 5000, lineDiscount: 0 }], paidAmount: 999999 }],
  ['bad discount', { userId: 1, cartItems: [{ productId: 1, quantity: 1, lineDiscount: 9999 }], paidAmount: 10000 }],
  ['missing debt customer', { userId: 1, cartItems: [{ productId: 1, quantity: 1, lineDiscount: 0 }], paidAmount: 10 }]
]) {
  try {
    completeSale(badRequest)
    throw new Error(`${label} unexpectedly committed.`)
  } catch {
    assertCountsUnchanged(beforeFailures, label)
  }
}

const cashSale = completeSale({
  userId: 1,
  cartItems: [{ productId: 1, quantity: 1, lineDiscount: 0 }],
  discountAmount: 0,
  discountPercent: 0,
  taxPercent: 0,
  paidAmount: 50,
  notes: 'cash sale test'
})
assert(cashSale.netTotal === 49.97, 'Cash sale net total mismatch.')
assert(cashSale.paidAmount === 50, 'Tendered paid amount was not preserved.')
assert(cashSale.changeAmount === 0.03, 'Change amount mismatch.')
assert(cashSale.collectedAmount === 49.97, 'Collected payment should equal net total for over-tendered sale.')
assert(cashSale.paymentStatus === 'Completed', 'Cash sale should be completed.')

const savedCashSale = db.prepare('SELECT PaidAmount, ChangeAmount FROM Sales WHERE SaleID = ?').get(cashSale.saleId)
const savedCashPayment = db.prepare('SELECT Amount FROM Payments WHERE SaleID = ?').get(cashSale.saleId)
assert(money(savedCashSale.PaidAmount) === 50, 'Sales.PaidAmount did not store tendered cash.')
assert(money(savedCashSale.ChangeAmount) === 0.03, 'Sales.ChangeAmount did not store change.')
assert(money(savedCashPayment.Amount) === 49.97, 'Payments.Amount should store collected amount.')

const debtSale = completeSale({
  userId: 1,
  customerName: 'Debt Customer',
  customerFatherName: 'Customer Father',
  customerPhone: '03001234567',
  cartItems: [{ productId: 1, quantity: 1, lineDiscount: 0 }],
  discountAmount: 0,
  discountPercent: 0,
  taxPercent: 0,
  paidAmount: 10,
  notes: 'debt sale test'
})
assert(debtSale.paymentStatus === 'Pending', 'Debt sale should be pending.')
assert(debtSale.amountDue === 39.97, 'Debt amount due mismatch.')
assert(Boolean(debtSale.customerAccountNumber), 'Debt sale did not create a customer account number.')
assert(db.prepare('SELECT COUNT(*) as count FROM Customers WHERE AccountNumber = ?').get(debtSale.customerAccountNumber).count === 1, 'Customer account row was not saved.')

const stressSales = 100
for (let index = 0; index < stressSales; index += 1) {
  const result = completeSale({
    userId: 1,
    cartItems: [{ productId: 1, quantity: 1, lineDiscount: 0 }],
    discountAmount: 0,
    discountPercent: 0,
    taxPercent: 0,
    paidAmount: 50,
    notes: `stress sale ${index + 1}`
  })
  assert(result.invoiceNumber === `POS-TEST-${String(index + 3).padStart(6, '0')}`, 'Invoice sequence is not stable.')
}

const final = counts()
const totalSales = stressSales + 2
assert(final.sales === totalSales, 'Sales count mismatch.')
assert(final.items === totalSales, 'Sale item count mismatch.')
assert(final.payments === totalSales, 'Payment count mismatch.')
assert(final.inventory === totalSales, 'Inventory transaction count mismatch.')
assert(final.saleAudits === totalSales, 'Audit log count mismatch.')
assert(final.customers === 1, 'Only the debt sale should create a customer.')
assert(final.paymentTotal === money((stressSales + 1) * 49.97 + 10), 'Payment totals should store collected revenue, not tendered cash.')
assert(final.stock === 1000 - totalSales, 'Stock was not reduced exactly once per sale.')

const foreignKeyProblems = db.prepare('PRAGMA foreign_key_check').all()
assert(foreignKeyProblems.length === 0, 'Foreign key check failed.')
assert(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'SQLite integrity check failed.')

db.pragma('wal_checkpoint(TRUNCATE)')
db.close()
fs.rmSync(tempDir, { recursive: true, force: true })

console.log(`Database transaction stress check passed: ${totalSales} committed sales, rollback checks passed, no stock/payment/audit drift.`)
