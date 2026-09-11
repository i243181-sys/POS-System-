# SecureStore POS desktop application

This directory is the maintained Electron/React/TypeScript/SQLite application.

See the [root README](../README.md) for Linux prerequisites, installation, first-run setup, environment configuration, daily workflows, backups, tests and troubleshooting. See [the engineering review](../REVIEW.md) for verified changes and limits.

```bash
npm ci --no-audit
npm run typecheck
npm test
npm run build
npm start
```

No HTTP backend or default credentials are used. Your shop database is stored outside the source checkout in Electron's user-data directory, or in the absolute directory provided through `POS_DATA_DIR`.
