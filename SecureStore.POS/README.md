> Historical reference. The maintained Linux app and current instructions are documented in the [root README](../README.md). This document is not the current deployment or security specification.

# SecureStore POS System

SecureStore POS is a secure, crash-safe point-of-sale desktop app for small and medium shops. It now runs on Linux, Windows, and macOS through Avalonia UI while keeping the existing C# domain, repository, service, security, audit, and transaction layers.

## Technologies
- .NET 8 and C#
- Avalonia cross-platform desktop UI
- Entity Framework Core
- SQLite by default on Linux with WAL enabled
- Optional SQL Server provider for Windows/server deployments
- BCrypt password hashing
- Repository and Unit of Work pattern
- Serilog file logging with 1-year log retention
- QuestPDF dependency retained for receipt/PDF expansion

## Project Structure
- `Domain/` - entities and enums
- `Infrastructure/` - EF Core context, repositories, unit of work, database seeding
- `Services/` - active business services used by the UI
- `Application/` - DTO-oriented services retained for future API/MVVM cleanup
- `Security/` - password hashing, role/session helpers
- `Views/` - Avalonia Linux-ready windows
- `Presentation/Models/` - UI models such as cart items
- `Database/` - SQL Server and SQLite schema scripts
- `Utilities/` - logging and receipt helpers

## Run on Linux
Install the .NET 8 SDK, then run:

```bash
dotnet restore SecureStore.POS/SecureStore.POS.csproj
dotnet run --project SecureStore.POS/SecureStore.POS.csproj
```

The default database is created at:

```text
SecureStore.POS/bin/Debug/net8.0/Data/securestore-pos.db
```

The app creates roles, the first admin user, and product categories on first start. Products are intentionally left empty for the customer to add real inventory.

## Database Configuration
Default Linux configuration in `appsettings.json`:

```json
"ConnectionStrings": {
  "Sqlite": "Data Source=Data/securestore-pos.db",
  "SqlServer": "Server=localhost;Database=SecureStorePOS;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true"
},
"Database": {
  "Provider": "Sqlite"
}
```

To use SQL Server instead, change `Database:Provider` to `SqlServer` and update the `SqlServer` connection string.

## Initial Users
For a fresh database, set `POS_INITIAL_ADMIN_PASSWORD` before the first launch. Optional manager and cashier users are created only when `POS_INITIAL_MANAGER_PASSWORD` and `POS_INITIAL_CASHIER_PASSWORD` are also set.

## Implemented Features
- Login with BCrypt password hashes
- Admin, manager, and cashier roles
- Active/inactive/locked account status and failed login tracking
- Session timeout enforcement
- Dashboard metrics
- Product add/update/deactivate/search
- Manual stock adjustment with required reason and inventory log
- Product autocomplete by name, brand, and barcode
- POS cart, barcode entry, discount, tax, paid amount, and change calculation
- Role-based discount limits
- Transaction-safe sale completion
- Stock reduction and inventory transaction logs
- Audit logs for sensitive actions
- Daily, product, cashier, and low-stock reports
- User activate/deactivate flow for admins
- Provider-aware backup flow
- SQLite restore staging to avoid overwriting a live database

## Sale Transaction Safety
`Services/SaleService.cs` wraps sale completion in one EF Core database transaction:

1. Validate cart, stock, payment, and discount role limits.
2. Insert sale header with invoice number.
3. Insert sale items.
4. Reduce product stock.
5. Insert inventory transaction rows.
6. Insert payment row.
7. Insert audit log.
8. Commit only when every step succeeds.

If any step fails, the transaction is rolled back, so partial sales are not saved.

## Backup and Restore
For SQLite, backup checkpoints WAL and copies the database file into the configured backup folder. Restore is staged as:

```text
securestore-pos.db.restore.pending
```

Close the app, replace the live database file with the staged file, then restart. This avoids corrupting or replacing an open database.

For SQL Server, the service uses `BACKUP DATABASE` and `RESTORE DATABASE`.

## Data Retention and Security
- The UI does not expose audit-log deletion.
- Sales, inventory, products, users, audit logs, and backup logs are retained unless an administrator manually changes the database outside the app.
- Important tables have created/updated timestamps.
- SQLite uses foreign keys and WAL.
- SQL scripts and EF model include primary keys, foreign keys, unique indexes, and check constraints.
- Do not store card numbers, CVV, PIN, or sensitive payment card data. Store only payment method and external reference numbers.

## Database Scripts
- `Database/Schema.sql` - SQL Server schema
- `Database/Schema.SQLite.sql` - SQLite schema

The application normally provisions the schema with EF Core `EnsureCreated` and `DatabaseInitializer`.

## Current Notes
The Linux migration keeps the active service layer intact and replaces the Windows-only WPF shell with Avalonia. The next cleanup step should consolidate the duplicate `Application/Services` and `Services` layers into one service surface, then add automated transaction and repository tests.
