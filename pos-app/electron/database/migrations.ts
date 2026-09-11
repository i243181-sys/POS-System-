import type { Pool } from 'pg'
import { logger } from '../utils/logger'
import { all } from './database'

// Full PostgreSQL schema for a fresh SecureStore POS database.
// Money is NUMERIC(12,2), timestamps are TIMESTAMPTZ (returned as UTC
// 'YYYY-MM-DD HH:MM:SS' strings by the type parser), flags are BOOLEAN.
export async function runMigrations(_pool?: Pool): Promise<void> {
  logger.info('Running database migrations (PostgreSQL)...')

  await all(`
    -- round(double precision, integer) for money rounding, like SQLite's ROUND(x, 2)
    CREATE OR REPLACE FUNCTION pos_round(value double precision, digits integer)
    RETURNS double precision LANGUAGE SQL IMMUTABLE
    RETURN round(value::numeric, digits)::double precision;
    CREATE OR REPLACE FUNCTION round(value double precision, digits integer)
    RETURNS double precision LANGUAGE SQL IMMUTABLE
    RETURN round(value::numeric, digits)::double precision;

    -- Roles
    CREATE TABLE IF NOT EXISTS Roles (
      RoleID   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      RoleName TEXT NOT NULL UNIQUE CHECK (RoleName IN ('Admin','Cashier'))
    );

    -- Users
    CREATE TABLE IF NOT EXISTS Users (
      UserID              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      Username            TEXT NOT NULL,
      PasswordHash        TEXT NOT NULL,
      FullName            TEXT NOT NULL,
      RoleID              INTEGER NOT NULL REFERENCES Roles(RoleID) ON DELETE RESTRICT,
      Status              TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Inactive','Locked')),
      FailedLoginAttempts INTEGER NOT NULL DEFAULT 0 CHECK (FailedLoginAttempts >= 0),
      LastLoginAt         TIMESTAMPTZ,
      LockedUntil         TIMESTAMPTZ,
      CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
      UpdatedAt           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON Users(lower(Username));
    CREATE INDEX IF NOT EXISTS idx_users_role ON Users(RoleID);

    -- Categories
    CREATE TABLE IF NOT EXISTS Categories (
      CategoryID   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      CategoryName TEXT NOT NULL UNIQUE,
      Description  TEXT,
      IsActive     BOOLEAN NOT NULL DEFAULT true,
      CreatedAt    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Products
    CREATE TABLE IF NOT EXISTS Products (
      ProductID     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ProductName   TEXT NOT NULL,
      CategoryID    INTEGER NOT NULL REFERENCES Categories(CategoryID) ON DELETE RESTRICT,
      Brand         TEXT,
      Barcode       TEXT,
      PurchasePrice NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (PurchasePrice >= 0),
      SellingPrice  NUMERIC(12,2) NOT NULL CHECK (SellingPrice > 0),
      StockQuantity INTEGER NOT NULL DEFAULT 0 CHECK (StockQuantity >= 0),
      ReorderLevel  INTEGER NOT NULL DEFAULT 10 CHECK (ReorderLevel >= 0),
      IsActive      BOOLEAN NOT NULL DEFAULT true,
      CreatedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UpdatedAt     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_products_name     ON Products(ProductName);
    CREATE INDEX IF NOT EXISTS idx_products_category ON Products(CategoryID);
    CREATE INDEX IF NOT EXISTS idx_products_active   ON Products(IsActive);
    CREATE INDEX IF NOT EXISTS idx_products_active_stock ON Products(IsActive, StockQuantity);
    CREATE INDEX IF NOT EXISTS idx_products_barcode  ON Products(Barcode);

    -- Customers
    CREATE TABLE IF NOT EXISTS Customers (
      CustomerID    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      AccountNumber TEXT UNIQUE,
      FullName      TEXT NOT NULL,
      FatherName    TEXT,
      Phone         TEXT,
      Email         TEXT,
      Address       TEXT,
      LoyaltyPoints NUMERIC(12,2) NOT NULL DEFAULT 0,
      IsActive      BOOLEAN NOT NULL DEFAULT true,
      CreatedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UpdatedAt     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_customers_name   ON Customers(FullName);
    CREATE INDEX IF NOT EXISTS idx_customers_phone  ON Customers(Phone);
    CREATE INDEX IF NOT EXISTS idx_customers_active ON Customers(IsActive);
    CREATE INDEX IF NOT EXISTS idx_customers_updated ON Customers(UpdatedAt);

    -- Sales
    CREATE TABLE IF NOT EXISTS Sales (
      SaleID          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      InvoiceNumber   TEXT NOT NULL UNIQUE,
      UserID          INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE RESTRICT,
      CustomerID      INTEGER REFERENCES Customers(CustomerID) ON DELETE SET NULL,
      SaleDate        TIMESTAMPTZ NOT NULL DEFAULT now(),
      SubTotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
      DiscountAmount  NUMERIC(12,2) NOT NULL DEFAULT 0,
      DiscountPercent NUMERIC(5,2)  NOT NULL DEFAULT 0,
      TaxAmount       NUMERIC(12,2) NOT NULL DEFAULT 0,
      NetTotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
      PaidAmount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      ChangeAmount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      PaymentStatus   TEXT NOT NULL DEFAULT 'Completed' CHECK (PaymentStatus IN ('Pending','Completed','Refunded','Voided')),
      Notes           TEXT,
      IsVoided        BOOLEAN NOT NULL DEFAULT false,
      CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sales_date    ON Sales(SaleDate);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON Sales(InvoiceNumber);
    CREATE INDEX IF NOT EXISTS idx_sales_user    ON Sales(UserID);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON Sales(CustomerID);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_date ON Sales(CustomerID, SaleDate);
    CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON Sales(PaymentStatus, IsVoided);
    CREATE INDEX IF NOT EXISTS idx_sales_customer_payment ON Sales(CustomerID, PaymentStatus, IsVoided);

    -- SaleItems
    CREATE TABLE IF NOT EXISTS SaleItems (
      SaleItemID   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      SaleID       INTEGER NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
      ProductID    INTEGER NOT NULL REFERENCES Products(ProductID) ON DELETE RESTRICT,
      ProductName  TEXT NOT NULL,
      Quantity     INTEGER NOT NULL CHECK (Quantity > 0),
      UnitPrice    NUMERIC(12,2) NOT NULL CHECK (UnitPrice >= 0),
      UnitCost     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (UnitCost >= 0),
      LineDiscount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (LineDiscount >= 0),
      LineTotal    NUMERIC(12,2) NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_saleitems_sale    ON SaleItems(SaleID);
    CREATE INDEX IF NOT EXISTS idx_saleitems_product ON SaleItems(ProductID);
    CREATE INDEX IF NOT EXISTS idx_saleitems_product_sale ON SaleItems(ProductID, SaleID);

    -- ProductBackups
    CREATE TABLE IF NOT EXISTS ProductBackups (
      ProductBackupID INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ProductID       INTEGER,
      Action          TEXT NOT NULL,
      DataPath        TEXT NOT NULL,
      ChecksumSha256  TEXT,
      CreatedByUserID INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
      CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_productbackups_product ON ProductBackups(ProductID);

    -- Payments
    CREATE TABLE IF NOT EXISTS Payments (
      PaymentID     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      SaleID        INTEGER NOT NULL REFERENCES Sales(SaleID) ON DELETE CASCADE,
      PaymentMethod TEXT NOT NULL DEFAULT 'Cash' CHECK (PaymentMethod IN ('Cash','Card','MobilePayment','Cheque','Other')),
      Amount        NUMERIC(12,2) NOT NULL CHECK (Amount > 0),
      PaymentDate   TIMESTAMPTZ NOT NULL DEFAULT now(),
      ReferenceNo   TEXT,
      Notes         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payments_sale ON Payments(SaleID);

    -- InventoryTransactions
    CREATE TABLE IF NOT EXISTS InventoryTransactions (
      InventoryTransactionID INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ProductID              INTEGER NOT NULL REFERENCES Products(ProductID) ON DELETE RESTRICT,
      TransactionType        TEXT NOT NULL CHECK (TransactionType IN ('Sale','Purchase','Adjustment','Return','Void')),
      QuantityChange         INTEGER NOT NULL,
      OldStock               INTEGER NOT NULL,
      NewStock               INTEGER NOT NULL,
      UserID                 INTEGER NOT NULL REFERENCES Users(UserID) ON DELETE RESTRICT,
      Reason                 TEXT,
      SaleID                 INTEGER,
      CreatedAt              TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_inv_product   ON InventoryTransactions(ProductID);
    CREATE INDEX IF NOT EXISTS idx_inv_createdat ON InventoryTransactions(CreatedAt);

    -- AuditLogs
    CREATE TABLE IF NOT EXISTS AuditLogs (
      AuditLogID  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      UserID      INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
      Action      TEXT NOT NULL,
      EntityName  TEXT NOT NULL,
      EntityID    TEXT,
      Description TEXT NOT NULL,
      DeviceName  TEXT NOT NULL DEFAULT '',
      IPAddress   TEXT,
      CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_createdat ON AuditLogs(CreatedAt);
    CREATE INDEX IF NOT EXISTS idx_audit_user      ON AuditLogs(UserID);
    CREATE INDEX IF NOT EXISTS idx_audit_action    ON AuditLogs(Action);

    -- Settings
    CREATE TABLE IF NOT EXISTS Settings (
      SettingID    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      SettingKey   TEXT NOT NULL UNIQUE,
      SettingValue TEXT NOT NULL,
      Description  TEXT,
      UpdatedAt    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- BackupLogs
    CREATE TABLE IF NOT EXISTS BackupLogs (
      BackupID          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      BackupPath        TEXT NOT NULL,
      FileSizeBytes     INTEGER NOT NULL DEFAULT 0,
      BackupDate        TIMESTAMPTZ NOT NULL DEFAULT now(),
      CreatedByUserID   INTEGER REFERENCES Users(UserID) ON DELETE SET NULL,
      Status            TEXT NOT NULL DEFAULT 'Success' CHECK (Status IN ('Success','Failed')),
      ErrorMessage      TEXT,
      IsAutomatic       BOOLEAN NOT NULL DEFAULT false,
      ChecksumSha256    TEXT,
      MetadataPath      TEXT,
      VerifiedAt        TEXT,
      LastRestoredAt    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_backup_date ON BackupLogs(BackupDate);
  `)

  // Default settings that used to be added by data-migration steps.
  await all(`
    INSERT INTO Settings (SettingKey, SettingValue, Description) VALUES
      ('MinimumDataRetentionDays', '365', 'Minimum days to retain sales, customer, inventory, and audit data'),
      ('ReceiptHeaderMessage', 'Original sale receipt', 'Receipt header text'),
      ('ReceiptShowPhone', 'true', 'Show phone on receipts'),
      ('ReceiptShowAddress', 'true', 'Show address on receipts'),
      ('CurrencySymbol', 'Rs', 'Currency symbol'),
      ('BackupRetentionDays', '30', 'Days to keep automatic backup files')
    ON CONFLICT (SettingKey) DO NOTHING
  `)

  logger.info('Database migrations completed successfully (PostgreSQL).')
}
