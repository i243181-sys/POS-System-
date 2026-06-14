import type Database from 'better-sqlite3'
import { logger } from '../utils/logger'

export function runMigrations(db: Database.Database): void {
  logger.info('Running database migrations...')

  db.exec(`
    -- ── Roles ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Roles (
      RoleID   INTEGER PRIMARY KEY AUTOINCREMENT,
      RoleName TEXT    NOT NULL UNIQUE
        CHECK (RoleName IN ('Admin','Cashier'))
    );

    -- ── Users ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Users (
      UserID              INTEGER PRIMARY KEY AUTOINCREMENT,
      Username            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      PasswordHash        TEXT    NOT NULL,
      FullName            TEXT    NOT NULL,
      RoleID              INTEGER NOT NULL REFERENCES Roles(RoleID) ON DELETE RESTRICT,
      Status              TEXT    NOT NULL DEFAULT 'Active'
        CHECK (Status IN ('Active','Inactive','Locked')),
      FailedLoginAttempts INTEGER NOT NULL DEFAULT 0 CHECK (FailedLoginAttempts >= 0),
      LastLoginAt         TEXT,
      LockedUntil         TEXT,
      CreatedAt           TEXT    NOT NULL DEFAULT (datetime('now')),
      UpdatedAt           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON Users(Username);
    CREATE INDEX IF NOT EXISTS idx_users_role     ON Users(RoleID);

    -- ── Categories ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Categories (
      CategoryID   INTEGER PRIMARY KEY AUTOINCREMENT,
      CategoryName TEXT    NOT NULL UNIQUE,
      Description  TEXT,
      IsActive     INTEGER NOT NULL DEFAULT 1,
      CreatedAt    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Products ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Products (
      ProductID     INTEGER PRIMARY KEY AUTOINCREMENT,
      ProductName   TEXT    NOT NULL,
      CategoryID    INTEGER NOT NULL REFERENCES Categories(CategoryID) ON DELETE RESTRICT,
      Brand         TEXT,
      PurchasePrice REAL    NOT NULL DEFAULT 0 CHECK (PurchasePrice >= 0),
      SellingPrice  REAL    NOT NULL CHECK (SellingPrice > 0),
      StockQuantity INTEGER NOT NULL DEFAULT 0 CHECK (StockQuantity >= 0),
      ReorderLevel  INTEGER NOT NULL DEFAULT 10 CHECK (ReorderLevel >= 0),
      IsActive      INTEGER NOT NULL DEFAULT 1,
      CreatedAt     TEXT    NOT NULL DEFAULT (datetime('now')),
      UpdatedAt     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_name     ON Products(ProductName);
    CREATE INDEX IF NOT EXISTS idx_products_category ON Products(CategoryID);
    CREATE INDEX IF NOT EXISTS idx_products_active   ON Products(IsActive);
    CREATE INDEX IF NOT EXISTS idx_products_active_stock ON Products(IsActive, StockQuantity);

    -- ── Customers ──────────────────────────────────────────────────────────
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
    CREATE INDEX IF NOT EXISTS idx_customers_name   ON Customers(FullName);
    CREATE INDEX IF NOT EXISTS idx_customers_phone  ON Customers(Phone);
    CREATE INDEX IF NOT EXISTS idx_customers_active ON Customers(IsActive);

    -- ── Sales ──────────────────────────────────────────────────────────────
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
      PaymentStatus   TEXT    NOT NULL DEFAULT 'Completed'
        CHECK (PaymentStatus IN ('Pending','Completed','Refunded','Voided')),
      Notes           TEXT,
      IsVoided        INTEGER NOT NULL DEFAULT 0,
      CreatedAt       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sales_date    ON Sales(SaleDate);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON Sales(InvoiceNumber);
    CREATE INDEX IF NOT EXISTS idx_sales_user    ON Sales(UserID);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON Sales(CustomerID);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_date ON Sales(CustomerID, SaleDate);
    CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON Sales(PaymentStatus, IsVoided);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_payment ON Sales(CustomerID, PaymentStatus, IsVoided);

    -- ── SaleItems ──────────────────────────────────────────────────────────
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
    CREATE INDEX IF NOT EXISTS idx_saleitems_sale    ON SaleItems(SaleID);
    CREATE INDEX IF NOT EXISTS idx_saleitems_product ON SaleItems(ProductID);
    CREATE INDEX IF NOT EXISTS idx_saleitems_product_sale ON SaleItems(ProductID, SaleID);

    -- ── ProductBackups ─────────────────────────────────────────────────────
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

    -- ── Payments ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Payments (
      PaymentID     INTEGER PRIMARY KEY AUTOINCREMENT,
      SaleID        INTEGER NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
      PaymentMethod TEXT    NOT NULL DEFAULT 'Cash'
        CHECK (PaymentMethod IN ('Cash','Card','MobilePayment','Cheque','Other')),
      Amount        REAL    NOT NULL CHECK (Amount > 0),
      PaymentDate   TEXT    NOT NULL DEFAULT (datetime('now')),
      ReferenceNo   TEXT,
      Notes         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payments_sale ON Payments(SaleID);

    -- ── InventoryTransactions ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS InventoryTransactions (
      InventoryTransactionID INTEGER PRIMARY KEY AUTOINCREMENT,
      ProductID              INTEGER NOT NULL REFERENCES Products(ProductID) ON DELETE RESTRICT,
      TransactionType        TEXT    NOT NULL
        CHECK (TransactionType IN ('Sale','Purchase','Adjustment','Return','Void')),
      QuantityChange         INTEGER NOT NULL,
      OldStock               INTEGER NOT NULL,
      NewStock               INTEGER NOT NULL,
      UserID                 INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE RESTRICT,
      Reason                 TEXT,
      SaleID                 INTEGER,
      CreatedAt              TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inv_product   ON InventoryTransactions(ProductID);
    CREATE INDEX IF NOT EXISTS idx_inv_createdat ON InventoryTransactions(CreatedAt);

    -- ── AuditLogs ──────────────────────────────────────────────────────────
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
    CREATE INDEX IF NOT EXISTS idx_audit_user      ON AuditLogs(UserID);
    CREATE INDEX IF NOT EXISTS idx_audit_action    ON AuditLogs(Action);

    -- ── Settings ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS Settings (
      SettingID    INTEGER PRIMARY KEY AUTOINCREMENT,
      SettingKey   TEXT    NOT NULL UNIQUE,
      SettingValue TEXT    NOT NULL,
      Description  TEXT,
      UpdatedAt    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── BackupLogs ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS BackupLogs (
      BackupID          INTEGER PRIMARY KEY AUTOINCREMENT,
      BackupPath        TEXT    NOT NULL,
      FileSizeBytes     INTEGER NOT NULL DEFAULT 0,
      BackupDate        TEXT    NOT NULL DEFAULT (datetime('now')),
      CreatedByUserID   INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
      Status            TEXT    NOT NULL DEFAULT 'Success'
        CHECK (Status IN ('Success','Failed')),
      ErrorMessage      TEXT,
      IsAutomatic       INTEGER NOT NULL DEFAULT 0,
      ChecksumSha256    TEXT,
      MetadataPath      TEXT,
      VerifiedAt        TEXT,
      LastRestoredAt    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_backup_date ON BackupLogs(BackupDate);
  `)

  const backupColumns = db.prepare('PRAGMA table_info(BackupLogs)').all() as Array<{ name: string }>
  const backupColumnNames = new Set(backupColumns.map((column) => column.name))
  const addBackupColumn = (name: string, ddl: string) => {
    if (!backupColumnNames.has(name)) db.exec(`ALTER TABLE BackupLogs ADD COLUMN ${ddl};`)
  }
  addBackupColumn('ChecksumSha256', 'ChecksumSha256 TEXT')
  addBackupColumn('MetadataPath', 'MetadataPath TEXT')
  addBackupColumn('VerifiedAt', 'VerifiedAt TEXT')
  addBackupColumn('LastRestoredAt', 'LastRestoredAt TEXT')

  const customerColumns = db.prepare('PRAGMA table_info(Customers)').all() as Array<{ name: string }>
  const customerColumnNames = new Set(customerColumns.map((column) => column.name))
  if (!customerColumnNames.has('AccountNumber')) {
    db.exec(`
      ALTER TABLE Customers ADD COLUMN AccountNumber TEXT;
      UPDATE Customers
      SET AccountNumber = 'CUS-' || printf('%06d', CustomerID)
      WHERE AccountNumber IS NULL OR AccountNumber = '';
    `)
  }
  if (!customerColumnNames.has('FatherName')) {
    db.exec(`ALTER TABLE Customers ADD COLUMN FatherName TEXT;`)
  }
  if (!customerColumnNames.has('UpdatedAt')) {
    db.exec(`
      ALTER TABLE Customers ADD COLUMN UpdatedAt TEXT;
      UPDATE Customers
      SET UpdatedAt = COALESCE(CreatedAt, datetime('now'))
      WHERE UpdatedAt IS NULL;
    `)
  }

  const saleItemColumns = db.prepare('PRAGMA table_info(SaleItems)').all() as Array<{ name: string }>
  if (!saleItemColumns.some((column) => column.name === 'UnitCost')) {
    db.exec(`
      ALTER TABLE SaleItems ADD COLUMN UnitCost REAL NOT NULL DEFAULT 0 CHECK (UnitCost >= 0);
      UPDATE SaleItems
      SET UnitCost = COALESCE((
        SELECT PurchasePrice
        FROM Products
        WHERE Products.ProductID = SaleItems.ProductID
      ), 0)
      WHERE UnitCost = 0;
    `)
  }

  const productColumns = db.prepare('PRAGMA table_info(Products)').all() as Array<{ name: string }>
  const productColumnNames = new Set(productColumns.map((column) => column.name))
  if (!productColumnNames.has('Barcode')) {
    logger.info('Adding Barcode column to Products table...')
    db.exec(`ALTER TABLE Products ADD COLUMN Barcode TEXT;`)
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON Products(Barcode);`)

  db.exec(`
    UPDATE Customers
    SET AccountNumber = 'CUS-' || printf('%06d', CustomerID)
    WHERE AccountNumber IS NULL OR AccountNumber = '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_account_number ON Customers(AccountNumber);
    CREATE INDEX IF NOT EXISTS idx_customers_updated ON Customers(UpdatedAt);
    CREATE INDEX IF NOT EXISTS idx_products_active_stock ON Products(IsActive, StockQuantity);
    CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON Sales(PaymentStatus, IsVoided);
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

    INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, Description)
    VALUES (
      'MinimumDataRetentionDays',
      '365',
      'Minimum days to retain sales, customer, inventory, and audit data'
    );
    INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, Description) VALUES ('ReceiptHeaderMessage', 'Original sale receipt', 'Receipt header text');
    INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, Description) VALUES ('ReceiptShowPhone', 'true', 'Show phone on receipts');
    INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, Description) VALUES ('ReceiptShowAddress', 'true', 'Show address on receipts');
    INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, Description) VALUES ('CurrencySymbol', 'Rs', 'Currency symbol');
    INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, Description) VALUES ('BackupRetentionDays', '30', 'Days to keep automatic backup files');

    PRAGMA optimize;
  `)

  logger.info('Database migrations completed successfully.')
}
