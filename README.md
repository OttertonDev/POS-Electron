# Otterton POS Desktop Shell

This project now includes a standalone localhost silent print service for Windows.

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

```powershell
$env:PRINT_PRINTER_NAME="Vozy P50"
$env:PRINT_SERVICE_PORT="3011"
$env:PRINT_ALLOWED_ORIGINS="https://tippawan-admin.web.app,http://127.0.0.1:5500"
```

## Start The Service

From the project root:

```powershell
npm run print-service:start
```

## Verify Health

In a second terminal:

```powershell
npm run print-service:health
```

If the service is configured correctly, it returns a JSON payload showing readiness and the configured printer name.

## Run A Thai Test Print

To print a service-owned Thai test receipt:

```powershell
npm run print-service:test
```

The test print uses raw ESC/POS text with `ESC t 255`.

## Encoder Smoke Check

To verify the encoder output locally without printing:

```powershell
npm run print-service:encoder-check
```
