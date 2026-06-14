import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { logger } from '../utils/logger'

const BCRYPT_ROUNDS = 12

function initialPassword(name: string) {
  const value = process.env[name]?.trim() ?? ''
  return value.length >= 12 ? value : ''
}

export async function seedDatabase(db: Database.Database): Promise<void> {
  logger.info('Ensuring required seed data exists...')

  // ── Roles ─────────────────────────────────────────────────────────────────
  const insertRole = db.prepare('INSERT OR IGNORE INTO Roles (RoleName) VALUES (?)')
  insertRole.run('Admin')
  insertRole.run('Cashier')

  // ── Users (securely hashed passwords) ────────────────────────────────────
  const adminRole = db.prepare("SELECT RoleID FROM Roles WHERE RoleName = 'Admin'").get() as { RoleID: number }
  const cashierRole = db.prepare("SELECT RoleID FROM Roles WHERE RoleName = 'Cashier'").get() as { RoleID: number }
  const adminExists = db.prepare(`
    SELECT 1
    FROM Users u
    JOIN Roles r ON u.RoleID = r.RoleID
    WHERE r.RoleName = 'Admin'
    LIMIT 1
  `).get()
  const adminPassword = initialPassword('POS_INITIAL_ADMIN_PASSWORD')
  const cashierPassword = initialPassword('POS_INITIAL_CASHIER_PASSWORD')

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO Users (Username, PasswordHash, FullName, RoleID, Status)
    VALUES (?, ?, ?, ?, 'Active')
  `)
  if (!adminExists && adminPassword) {
    const adminHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS)
    insertUser.run('admin', adminHash, 'System Administrator', adminRole.RoleID)
  } else if (!adminExists) {
    logger.warn('No admin user exists yet. First-run admin setup will be shown at login.')
  }

  if (cashierPassword) {
    const cashierHash = await bcrypt.hash(cashierPassword, BCRYPT_ROUNDS)
    insertUser.run('cashier', cashierHash, 'Sales Cashier', cashierRole.RoleID)
  }

  // ── Categories ────────────────────────────────────────────────────────────
  const insertCat = db.prepare('INSERT OR IGNORE INTO Categories (CategoryName, Description) VALUES (?, ?)')
  const categories: [string, string][] = [
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
  for (const category of categories) insertCat.run(...category)

  // ── Default Settings ──────────────────────────────────────────────────────
  const insertSetting = db.prepare('INSERT OR IGNORE INTO Settings (SettingKey, SettingValue, Description) VALUES (?, ?, ?)')
  const defaults: [string, string, string][] = [
    ['ShopName',                  'SecureStore POS',          'Shop display name'],
    ['ShopAddress',               '123 Main Street, City',    'Shop address on receipts'],
    ['ShopPhone',                 '+1-555-0100',              'Shop phone number'],
    ['ShopEmail',                 'store@securestore.com',    'Shop email address'],
    ['Currency',                  'PKR',                      'Currency code'],
    ['CurrencySymbol',            'Rs',                       'Currency symbol'],
    ['TaxPercent',                '0',                        'Default tax percentage'],
    ['SessionTimeoutMinutes',     '30',                       'Session inactivity timeout'],
    ['MaxFailedLoginAttempts',    '5',                        'Max failed logins before lock'],
    ['BackupFolderPath',          'Backups',                  'Folder for database backups'],
    ['AutoBackupEnabled',         'true',                     'Enable automatic daily backup'],
    ['BackupRetentionDays',       '30',                       'Days to keep automatic backup files'],
    ['MinimumDataRetentionDays',  '365',                      'Minimum days to retain sales, customer, inventory, and audit data'],
    ['LowStockThreshold',         '10',                       'Default reorder level'],
    ['CashierMaxDiscountPercent', '5',                        'Max discount cashier can apply'],
    ['AdminMaxDiscountPercent',   '100',                      'Max discount admin can apply'],
    ['ReceiptHeaderMessage',      'Original sale receipt',    'Receipt header text'],
    ['ReceiptFooterMessage',      'Thank you for shopping with us!', 'Receipt footer text'],
    ['ReceiptShowPhone',          'true',                     'Show phone on receipts'],
    ['ReceiptShowAddress',        'true',                     'Show address on receipts'],
    ['InvoicePrefix',             'POS',                      'Invoice number prefix'],
  ]
  for (const [k, v, d] of defaults) insertSetting.run(k, v, d)

  logger.info('Required seed data is ready.')
}
