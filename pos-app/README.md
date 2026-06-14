# SecureStore POS - Electron / Node / TypeScript / SQLite

This is the Linux-friendly POS implementation.

## Stack
- Frontend: Electron shell with browser UI
- Backend: Node.js + TypeScript HTTP API
- Database: SQLite through `better-sqlite3`
- Security: bcrypt password hashing, role-based access, audited admin actions

## Run

```bash
cd "/home/mughees-haider/POS system/pos-app"
npx electron-builder install-app-deps
npm run dev
```

## Run From Ubuntu File Manager

Double-click the `SecureStore POS.desktop` launcher in the main `POS system` folder.
It starts `pos-app/run.sh`, which opens the same Electron app from the production build.
If the build is missing, the launcher creates it first and writes startup details to:

```text
pos-app/logs/launcher.log
```

If dependencies are not installed yet, run:

```bash
npm install
npx electron-builder install-app-deps
npm run dev
```

The app is an Electron desktop app. There is no active `npm run web` script in this project.

## Initial Users
For a fresh database, set `POS_INITIAL_ADMIN_PASSWORD` before the first launch. Optional cashier seeding uses `POS_INITIAL_CASHIER_PASSWORD`.

## Implemented
- Login with secure password hashing
- Role-aware users
- Product search/autocomplete by name, brand, and category
- Product add/update
- Manual stock adjustment with required reason
- Transaction-safe sale completion
- Invoice generation
- Stock reduction
- Payment record insert
- Inventory transaction logs
- Audit logs
- Dashboard metrics
- Product/cashier/low-stock reports
- PDF sales report export by date range
- Receipt customization and store settings
- SQLite WAL mode for crash safety
- Verified backup creation
- Safe backup restore with automatic pre-restore safety backup
- Daily automatic backup scheduler

## Data
The SQLite database is stored in Electron's user data folder as:

```text
SecureStorePOS.db
```

On Linux this is normally under:

```text
~/.config/securestore-pos/
```

The database is designed for at least 1,000 products and 10,000+ customer/sale records:
- Products are indexed by name, category, and active status.
- Customers are indexed by name, phone, active status, and updated date.
- Sales are indexed by date, invoice number, cashier user, customer, and customer/date.
- Sale items are indexed by sale and product for product-wise reports.
- A `MinimumDataRetentionDays = 365` setting records the one-year retention requirement.
- The app does not automatically delete sales, customer, inventory, or audit data.
- Customer name/phone entered during purchase is saved in `Customers` and linked to `Sales.CustomerID`.
- Sale completion runs inside a SQLite transaction, so customer creation, sale header, sale items, payment, stock update, inventory log, and audit log commit together or roll back together.
- SQLite WAL mode is enabled for crash-safe committed transactions.

Backups are stored at:

```text
~/.config/securestore-pos/Backups/
```

Each backup is written to a temporary file first, checked with SQLite `integrity_check` and `foreign_key_check`, then saved with a SHA-256 checksum metadata file. Restores verify the backup first and create a safety backup of the current database before replacing it.
