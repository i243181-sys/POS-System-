# SecureStore POS System - Full Project Details

## 1. Project Overview

SecureStore POS is a Linux-friendly desktop point-of-sale application for small and medium shops. It is built as an Electron desktop app with a React/Vite frontend and a Node.js/TypeScript backend running in the Electron main process. Data is stored locally in SQLite using `better-sqlite3`.

The project is designed to support normal shop workflows:

- Secure login
- Product management
- Product search/autocomplete
- Sale checkout
- Customer detail capture
- Receipt preview
- Stock reduction after sale
- Inventory transaction logs
- Sales reports
- User management
- Settings
- Backup creation
- Audit logging

The application does not use REST calls from the frontend. The renderer talks to the backend only through Electron's secure preload bridge: `window.api`.

## 2. Current Technology Stack

- Desktop wrapper: Electron
- Frontend: React 18, TypeScript, Vite
- Styling: Tailwind CSS
- Icons: lucide-react
- Charts/report UI dependency: recharts
- Backend: Node.js and TypeScript in Electron main process
- Database: SQLite through `better-sqlite3`
- Password hashing: bcryptjs
- Logging: winston
- Build tooling: electron-vite and electron-builder

## 3. Main Project Folders

```text
pos-app/
  electron/
    database/
      database.ts
      migrations.ts
      seeder.ts
    ipc/
      handlers.ts
    services/
      auditService.ts
      authService.ts
      backupService.ts
      productService.ts
      reportService.ts
      saleService.ts
      settingsService.ts
      stockService.ts
      userService.ts
    main.ts
    preload.ts

  src/
    pages/
      POSPage.tsx
      ManagementScreens.tsx
    types/
      electron.d.ts
    App.tsx
    main.tsx

  shared/
    ipc.ts
    types.ts

  README.md
  PROJECT_DETAILS.md
  package.json
  vite.config.ts
  electron.vite.config.ts
```

## 4. Architecture

The app follows a layered desktop architecture:

- Presentation layer: React screens in `src/`
- Bridge layer: Electron preload in `electron/preload.ts`
- IPC layer: `electron/ipc/handlers.ts`
- Service layer: business logic in `electron/services/`
- Database layer: SQLite setup, migrations, and seed data in `electron/database/`
- Shared contract layer: TypeScript DTOs and IPC names in `shared/`

The frontend should not use:

- `fetch`
- `axios`
- REST APIs

The frontend should use only:

```ts
window.api.someBackendMethod()
```

## 5. Database Location

Electron stores the production SQLite database in the app user-data folder.

On Linux this is normally:

```text
~/.config/securestore-pos/SecureStorePOS.db
```

The repository also currently contains development data files under:

```text
pos-app/data/
```

Those are development artifacts and should not be treated as the final production storage path unless the app is configured that way.

## 6. Database Safety

The database is configured for crash-safe local use:

- SQLite Write-Ahead Logging is enabled with `PRAGMA journal_mode = WAL`.
- Foreign keys are enforced with `PRAGMA foreign_keys = ON`.
- Multi-step sale completion is handled inside a single SQLite transaction.
- If any sale step fails, the complete sale rolls back.
- Completed transactions remain saved after app restart or crash.
- Incomplete transactions should not leave partial sale records.
- Database constraints protect important fields from invalid data.

Current sale transaction includes:

1. Validate payment total.
2. Validate product availability and stock.
3. Generate invoice number.
4. Create or link customer record.
5. Insert sale header.
6. Insert sale items.
7. Reduce product stock.
8. Insert inventory transaction records.
9. Insert payment record.
10. Insert audit log.
11. Commit if everything succeeds.
12. Roll back if anything fails.

## 7. Database Tables

Current schema includes:

- `Roles`
- `Users`
- `Categories`
- `Products`
- `Customers`
- `Sales`
- `SaleItems`
- `Payments`
- `InventoryTransactions`
- `AuditLogs`
- `Settings`
- `BackupLogs`

## 8. Important Database Constraints

Examples of current safety constraints:

- Usernames are unique.
- Product barcode is unique when provided.
- Invoice number is unique.
- Product selling price must be greater than zero.
- Purchase price cannot be negative.
- Stock quantity cannot be negative.
- Reorder level cannot be negative.
- Sale item quantity must be greater than zero.
- Payment amount must be greater than zero.
- Role names are restricted to Admin, Manager, and Cashier.
- Payment status is restricted to known values.
- Inventory transaction type is restricted to known values.

## 9. Database Indexes and Capacity

The database has indexes for common POS operations:

- Products by name
- Products by barcode
- Products by category
- Products by active status
- Customers by full name
- Customers by phone
- Customers by active status
- Customers by updated date
- Sales by sale date
- Sales by invoice number
- Sales by cashier user
- Sales by customer
- Sales by customer and date
- Sale items by sale
- Sale items by product
- Sale items by product and sale
- Inventory transactions by product
- Inventory transactions by date
- Audit logs by date, user, and action
- Backups by backup date

Expected safe workload for current design:

```text
1,000 products          Safe
10,000 customers        Safe
10,000 sales            Safe
100,000+ sale items     Reasonable on normal hardware
1 year retention        Safe
```

For millions of sales or many concurrent terminals, PostgreSQL or a server database should be considered.

## 10. Data Retention

The app records a setting:

```text
MinimumDataRetentionDays = 365
```

The app currently does not automatically delete:

- Sales
- Sale items
- Customers
- Inventory transactions
- Audit logs
- Payment records

This supports the one-year retention requirement. If automatic cleanup is added later, it must respect the 365-day minimum and should never delete financial/audit records casually.

## 11. Customer Data Handling

Customer details entered during purchase are now stored in the database:

- Customer name is saved in `Customers.FullName`.
- Customer phone is saved in `Customers.Phone`.
- The sale links to the customer through `Sales.CustomerID`.
- If the same phone number is used again, the existing customer is reused.
- If no phone is provided, the app can reuse a matching active customer name.

This means customer and sale history can be retained and queried later.

## 12. Authentication and Roles

Implemented authentication features:

- Admin, Manager, and Cashier roles
- Secure password hashing
- Login through backend service
- Failed login attempt tracking
- Account status support: Active, Inactive, Locked
- Backend audit logs for login events

Fresh databases require `POS_INITIAL_ADMIN_PASSWORD` before the first launch. Optional seeded manager and cashier accounts use `POS_INITIAL_MANAGER_PASSWORD` and `POS_INITIAL_CASHIER_PASSWORD`.

## 13. Frontend Screens

Current app screens include:

- Login screen
- POS checkout screen
- Dashboard overview
- Products management
- Stock management
- Reports
- Users
- Settings and backup

The current active renderer is not `public/index.html`. The real React app starts from:

```text
pos-app/index.html
pos-app/src/main.tsx
pos-app/src/App.tsx
```

## 14. POS Checkout Flow

Current checkout flow:

1. User signs in.
2. User searches products by name/brand.
3. User adds products to the ticket/cart.
4. Quantity can be increased/decreased.
5. Items can be removed.
6. Discount can be applied.
7. Customer name is required.
8. Customer phone is optional.
9. User enters received cash.
10. App shows subtotal, discount, tax, total, paid amount, and change.
11. User reviews bill.
12. User completes purchase.
13. Backend transaction commits the sale.
14. Receipt preview is shown.
15. User can print the receipt from the browser/Electron print dialog.

Card payment UI was removed based on current requirements. The flow currently uses cash purchase.

## 15. Product Management

Implemented product features:

- View products
- Search products
- Create products
- Update products
- Product active/inactive support in backend
- Stock quantity
- Purchase price
- Selling price
- Category
- Brand
- Reorder level
- Low-stock support

Barcode storage still exists in the database/backend for future compatibility, but the current UI no longer focuses on barcode entry because it was removed from the requested flow.

## 16. Stock Management

Implemented stock features:

- Automatic stock decrease after sale
- Manual stock adjustment
- Required adjustment reason
- Inventory transaction record for stock movement
- Low-stock dashboard/report support

Stock movement is recorded in:

```text
InventoryTransactions
```

## 17. Reports

Current report-related backend supports:

- Dashboard metrics
- Date range sales
- Daily reports
- Product reports
- Cashier reports
- Low-stock reporting

Reports use SQL aggregation patterns such as:

- `SUM`
- `COUNT`
- `GROUP BY`
- `ORDER BY`
- Date filtering

## 18. Audit Logs

Sensitive operations are logged through audit services or direct inserts.

Audit-covered areas include:

- Login success/failure
- Sale completion
- Sale voiding
- Product creation/update/deactivation
- Stock adjustment
- User changes
- Backup creation
- Settings changes

Audit logs are not exposed as an easy delete action in the UI.

## 19. Backup System

Backup service exists and can create database backups.

Current backup-related features:

- Manual backup creation
- Backup logs in `BackupLogs`
- Backup path setting
- Backup status tracking

Current limitation:

- Restore from UI is not implemented yet.
- Restore should be handled carefully because replacing a live SQLite database while the app is running can corrupt data if done incorrectly.

Recommended restore process for now:

1. Close the app.
2. Copy the current database file somewhere safe.
3. Replace the database file with the chosen backup.
4. Start the app.
5. Verify users, products, sales, and reports.

## 20. Security Notes

Implemented security points:

- No plaintext password storage.
- Backend-only database access.
- Renderer talks through preload bridge.
- SQLite queries use prepared statements.
- Role/account fields are present.
- Failed logins are tracked.
- Audit logging is present.
- Payment card numbers, CVV, and PIN are not stored.

Important security warning:

Do not store payment card numbers, CVV, PIN, or magnetic strip data in this app. If payment integration is added later, use a certified payment provider and store only transaction reference numbers.

## 21. How to Run

From the app folder:

```bash
cd "/home/mughees-haider/POS system/pos-app"
npm install
npm run dev
```

For production build:

```bash
cd "/home/mughees-haider/POS system/pos-app"
npm run build
```

For packaging:

```bash
cd "/home/mughees-haider/POS system/pos-app"
npm run package
```

If Electron says it failed to install correctly:

```bash
cd "/home/mughees-haider/POS system/pos-app"
rm -rf node_modules/electron
npm install electron@31.7.7 --save-dev
npm run dev
```

## 22. How to Test a Sale

1. Run the app.
2. Sign in with the admin password configured through `POS_INITIAL_ADMIN_PASSWORD` during first launch.

3. Search a product, for example:

```text
Coke
```

4. Add one or more products to the cart.
5. Enter customer name.
6. Optionally enter customer phone.
7. Enter paid amount greater than or equal to total.
8. Review the bill.
9. Click purchase/complete purchase.
10. Confirm receipt preview appears.
11. Check that stock decreased.
12. Check reports/dashboard update.

## 23. Verification Commands

Use these before delivering changes:

```bash
npm run typecheck
npm run build
```

Current latest verification result:

```text
npm run typecheck: passed
npm run build: passed
```

## 24. Current Known Limitations

The app is functional, but these areas should still be improved before real shop production use:

- Restore backup from UI is not implemented.
- Receipt printing uses the browser/Electron print flow, not a dedicated thermal printer integration.
- Multi-terminal syncing is not supported. SQLite is best for one local POS terminal.
- No cloud sync.
- No advanced customer history screen yet.
- No full refund workflow beyond sale voiding.
- No automated backup scheduler verification UI.
- No database encryption at rest yet.
- No forced first-login password reset for seeded users.
- No installer signing/certificate setup yet.
- No formal automated end-to-end tests yet.
- No hardware integration for barcode scanner, cash drawer, or receipt printer yet.
- No role-level UI hiding for every management action yet.

## 25. Recommended Improvements

High-priority improvements:

- Add SQLCipher or OS-level encrypted storage for database encryption at rest.
- Add restore backup workflow with safe app restart.
- Add automated daily backup scheduling and backup health checks.
- Add customer history screen.
- Add refund/return workflow with inventory restoration.
- Add stricter role-based UI permissions.
- Add forced password change for default users.
- Add automated tests for sale transaction rollback.
- Add export reports to PDF/CSV.
- Add thermal receipt printer support.

Medium-priority improvements:

- Add supplier/purchase stock receiving module.
- Add category management screen.
- Add product import/export.
- Add barcode scanner input mode if needed later.
- Add richer audit log filtering.
- Add data archive screen that respects the 365-day retention setting.
- Add low-stock purchase order suggestion.

Long-term improvements:

- Move to PostgreSQL for multi-terminal or high-volume deployments.
- Add cloud backup/sync.
- Add offline-first sync conflict handling.
- Add payment provider integration.
- Add analytics dashboard with trends and forecasting.

## 26. Overall Project Status

Current status:

```text
Core POS flow          Working
Database safety        Good for local POS use
Customer persistence   Implemented
Product capacity       Good for 1,000+ products
Customer capacity      Good for 10,000+ customers
Sales retention        Designed for 1+ year
Backup creation        Implemented
Backup restore UI      Not implemented yet
Production hardening   Partially complete
```

Estimated readiness:

```text
Development/demo use:        Strong
Small shop pilot:            Reasonable after more manual testing
Full production deployment:  Needs backup restore, encryption, tests, and printer integration
```

## 27. Final Notes

The most important backend rule is preserved: the frontend does not bypass the backend or database layer. Sales must go through `window.api.completeSale`, which runs the backend transaction service.

The most important database rule is also preserved: no completed sale should be partially saved. If the sale fails midway, SQLite rolls the transaction back.

For real production use, the next strongest improvements are automated backup verification, safe restore, database encryption, and transaction rollback tests.
