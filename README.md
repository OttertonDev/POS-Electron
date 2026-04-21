# Otterton POS Desktop Shell

This project now includes a standalone localhost silent print service for Windows.
=======
# Otterton POS Silent Print Service

This repo includes a localhost silent print service for Windows plus a web POS flow that prints first, then stores the sale in Firestore.
> 08d4f41 (Implement silent print service and receipt storage)

## Printer Note

For the Vozy P50 thermal printer, the recommended Thai text path is `ESC t 255`.
Use code page `255` for raw ESC/POS Thai text output.

## Phase 1 Service

The Phase 1 service is a manually started local Node process that:

- binds to `127.0.0.1`
- exposes `GET /health`
- exposes `POST /print`
- exposes `POST /test-print`
- prints raw ESC/POS text through one configured Windows printer

The service is structured so it can later be packaged into a simple installer and launched from a desktop shortcut.

## Configuration

Configure these environment variables on the cashier machine:

- `PRINT_PRINTER_NAME`: exact Windows printer name for the Vozy P50
- `PRINT_SERVICE_PORT`: optional localhost port, default `3011`
- `PRINT_ALLOWED_ORIGINS`: optional comma-separated web origins allowed to call the service

Example PowerShell setup for the current terminal:
=======
## Local Service

The service binds to `127.0.0.1` and exposes:

- `GET /health`
- `POST /print`
- `POST /test-print`

Configure these environment variables on the cashier machine:

- `PRINT_PRINTER_NAME`
- `PRINT_SERVICE_PORT` (optional, default `3011`)
- `PRINT_ALLOWED_ORIGINS` (optional, comma-separated)

Example PowerShell setup:
> 08d4f41 (Implement silent print service and receipt storage)

```powershell
$env:PRINT_PRINTER_NAME="Vozy P50"
$env:PRINT_SERVICE_PORT="3011"
$env:PRINT_ALLOWED_ORIGINS="https://tippawan-admin.web.app,http://127.0.0.1:5500"
```

## Start The Service

From the project root:
=======
Start the service:
> 08d4f41 (Implement silent print service and receipt storage)

```powershell
npm run print-service:start
```

## Verify Health

In a second terminal:
=======
Check health:
> 08d4f41 (Implement silent print service and receipt storage)

```powershell
npm run print-service:health
```

If the service is configured correctly, it returns a JSON payload showing readiness and the configured printer name.

## Run A Thai Test Print

To print a service-owned Thai test receipt:
=======
Run a Thai hardware test:
> 08d4f41 (Implement silent print service and receipt storage)

```powershell
npm run print-service:test
```

The test print uses raw ESC/POS text with `ESC t 255`.

## Encoder Smoke Check

To verify the encoder output locally without printing:
=======
Verify encoder output without printing:
> 08d4f41 (Implement silent print service and receipt storage)

```powershell
npm run print-service:encoder-check
```
=======

## POS Sale Flow

The web POS now:

1. Reserves a cashier-friendly `Receipt ID` in Firestore using `YYYYMMDD-####`
2. Sends the receipt to the local silent print service
3. Stores the full printed receipt into Firestore
4. Decrements inventory
5. Clears the cart only after all of the above succeed

If printing succeeds but Firestore save or inventory update fails, the page keeps the sale in a recoverable pending state so retrying will finish the save without reprinting.
> 08d4f41 (Implement silent print service and receipt storage)
