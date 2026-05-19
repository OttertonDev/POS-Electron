# Project Index

## Overview
Otterton's Point of Sale is split into a browser-based POS/admin UI, a local Windows print service, Firebase hosting/rules configuration, and a small set of demo and support scripts.

## Main Areas

- `web-pos/`: frontend application for login, dashboard, POS checkout, receipt settings, system preferences, and stock management.
- `service/`: localhost Node.js print service that validates receipt payloads, builds ESC/POS output, and prints to a Windows printer.
- `service/scripts/`: local helpers for health checks, test prints, request posting, and encoder smoke checks.
- `demo/`: print bridge and demo pages for testing receipt output and Thai text handling.
- `font/` and `web-pos/font/`: bundled Neue Kabel and Google Sans font files.
- `public/`: default Firebase Hosting starter page; this is not the active POS UI.
- Root `index.html`: lightweight desktop shell page noting that print capability is disabled there.
- Firebase config: `firebase.json`, `firestore.rules`, and `web-pos/firebase-init.js`.
- Project metadata: `package.json` and `skills-lock.json`.

## Primary Entry Points

- `web-pos/index.html`: dashboard shell.
- `web-pos/income.html`: Income and Expenses receipt history and reprint page.
- `web-pos/login.html`: Google sign-in page.
- `web-pos/pos.html`: checkout and receipt flow.
- `web-pos/preferences.html`: admin-only system preferences page for language, UI size, and disabled Thailand Post placeholders.
- `web-pos/receipt-settings.html`: admin-only visual receipt builder and store receipt settings page.
- `web-pos/stock.html`: inventory admin page.
- `service/server.js`: print-service HTTP server.
- `demo/silent-print-bridge.js`: local demo bridge.
- `demo/thai-print-demo.js`: Thai ESC/POS print demo.
- `index.html`: root desktop-shell placeholder.
- `public/index.html`: Firebase Hosting starter placeholder.

## Key Runtime Files

- `web-pos/auth.js`: Firebase auth and role enforcement.
- `web-pos/income.js`: recent receipt history, search, and reprint behavior.
- `web-pos/pos-app.js`: cart, checkout, receipt printing, and Firestore sync.
- `web-pos/preferences.js`: Firestore-backed system preferences save/load behavior.
- `web-pos/receipt-settings.js`: Firestore-backed visual receipt builder and live preview behavior.
- `web-pos/dashboard.js`: dashboard navigation and status behavior.
- `web-pos/stock.js`: stock operations.
- `service/config.js`: printer, port, and origin configuration.
- `service/errors.js`: print-service error helpers.
- `service/validate.js`: receipt payload validation.
- `service/encoder.js`: ESC/POS receipt encoding.
- `service/transport/windows-raw-printer.js`: Windows raw printer transport.
- `service/transport/windows-raw-spool.ps1`: PowerShell raw spool helper used by the Windows transport.
- `service/scripts/check-health.js`: local service health check.
- `service/scripts/test-print.js`: service-owned test print.
- `service/scripts/encoder-smoke.js`: local encoder smoke test.
- `service/scripts/request-json.js`: JSON POST helper used by service scripts.

## Runtime Flow

1. User signs in through Firebase Google auth.
2. Role checks gate access to POS and admin pages.
3. POS loads products and receipt settings from Firestore.
4. Checkout sends receipt data to the local print service.
5. The service validates and encodes the receipt, then prints it on the configured Windows printer.
6. Sale completion and inventory updates are finalized in Firestore.

## Notes

- Branding should use Otterton's Point of Sale.
- Some legacy `Vozy` printer references still exist in README and demo/service text.
- The print service binds to `127.0.0.1` by default.
- `firebase.json` deploys Firebase Hosting from the checked-in `web-pos` app directory.
- Tooling/cache folders such as `.agents/`, `.claude/`, and `.firebase/` are present but are not part of the runtime surface.
