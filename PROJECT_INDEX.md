# Project Index

## Overview
Otterton's Point of Sale is split into a browser-based POS/admin UI, a local Windows print service, and a small set of demo and support scripts.

## Main Areas

- `web-pos/`: frontend application for login, dashboard, POS checkout, and stock management.
- `service/`: localhost Node.js print service that validates receipt payloads, builds ESC/POS output, and prints to a Windows printer.
- `demo/`: print bridge and demo pages for testing receipt output and Thai text handling.
- Firebase config: `firebase.json`, `firestore.rules`, and `web-pos/firebase-init.js`.

## Primary Entry Points

- `web-pos/index.html`: dashboard shell.
- `web-pos/login.html`: Google sign-in page.
- `web-pos/pos.html`: checkout and receipt flow.
- `web-pos/stock.html`: inventory admin page.
- `service/server.js`: print-service HTTP server.
- `demo/silent-print-bridge.js`: local demo bridge.

## Key Runtime Files

- `web-pos/auth.js`: Firebase auth and role enforcement.
- `web-pos/pos-app.js`: cart, checkout, receipt printing, and Firestore sync.
- `web-pos/dashboard.js`: dashboard navigation and status behavior.
- `web-pos/stock.js`: stock operations.
- `service/config.js`: printer, port, and origin configuration.
- `service/validate.js`: receipt payload validation.
- `service/encoder.js`: ESC/POS receipt encoding.
- `service/transport/windows-raw-printer.js`: Windows raw printer transport.

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
