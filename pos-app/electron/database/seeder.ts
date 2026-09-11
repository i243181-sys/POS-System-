import bcrypt from 'bcryptjs'
import { passwordError } from '../security/password'
import { all, run } from './database'
import { logger } from '../utils/logger'

const BCRYPT_ROUNDS = 12

function initialPassword(name: string) {
  const value = process.env[name] ?? ''
  if (value && passwordError(value)) throw new Error(`${name}: ${passwordError(value)}`)
  return value
}

export async function seedDatabase(_pool?: unknown): Promise<void> {
  logger.info('Ensuring required seed data exists (PostgreSQL)...')

  // Roles
  await run('INSERT INTO Roles (RoleName) VALUES ($1) ON CONFLICT (RoleName) DO NOTHING', ['Admin'])
  await run('INSERT INTO Roles (RoleName) VALUES ($1) ON CONFLICT (RoleName) DO NOTHING', ['Cashier'])

  // Users
  const adminRole = await all("SELECT RoleID FROM Roles WHERE RoleName = 'Admin'")
  const cashierRole = await all("SELECT RoleID FROM Roles WHERE RoleName = 'Cashier'")
  const adminExists = await all(`
    SELECT 1 FROM Users u JOIN Roles r ON u.RoleID = r.RoleID WHERE r.RoleName = 'Admin' LIMIT 1
  `)
  const adminPassword = initialPassword('POS_INITIAL_ADMIN_PASSWORD')
  const cashierPassword = initialPassword('POS_INITIAL_CASHIER_PASSWORD')

  if (!adminExists.length && adminPassword) {
    const adminHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS)
    await run(
      `INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status) VALUES ($1, $2, $3, $4, 'Active') ON CONFLICT DO NOTHING`,
      ['admin', adminHash, 'System Administrator', adminRole[0].roleid]
    )
  } else if (!adminExists.length) {
    logger.warn('No admin user exists yet. First-run admin setup will be shown at login.')
  }

  if (cashierPassword) {
    const cashierHash = await bcrypt.hash(cashierPassword, BCRYPT_ROUNDS)
    await run(
      `INSERT INTO Users (Username, PasswordHash, FullName, RoleID, Status) VALUES ($1, $2, $3, $4, 'Active') ON CONFLICT DO NOTHING`,
      ['cashier', cashierHash, 'Sales Cashier', cashierRole[0].roleid]
    )
  }

  // Categories
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
  for (const [name, description] of categories) {
    await run('INSERT INTO Categories (CategoryName, Description) VALUES ($1, $2) ON CONFLICT (CategoryName) DO NOTHING', [name, description])
  }

  // Default settings
  const defaults: [string, string, string][] = [
    ['ShopName', 'SecureStore POS', 'Shop display name'],
    ['ShopAddress', '', 'Shop address on receipts'],
    ['ShopPhone', '', 'Shop phone number'],
    ['ShopEmail', '', 'Shop email address'],
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
  for (const [key, value, description] of defaults) {
    await run(
      'INSERT INTO Settings (SettingKey, SettingValue, Description) VALUES ($1, $2, $3) ON CONFLICT (SettingKey) DO NOTHING',
      [key, value, description]
    )
  }

  logger.info('Required seed data is ready (PostgreSQL).')
}
