# Otterton's Point of Sale + Thermal Printer Plugin

This Electron plugin exposes a local print API for the web POS and supports a hybrid print engine:

- RAW ESC/POS raster first (Thai-safe bitmap output, no codepage dependency)
- Automatic fallback to Chromium/Windows graphic printing

## Local API

- `GET /printers`: returns available system printers
- `POST /print`: submits a print job

`POST /print` request shape remains unchanged:

```json
{
	"printer": "Optional Printer Name",
	"data": {
		"storeName": "Otterton's Point of Sale",
		"items": [{ "qty": "1x", "name": "Item", "price": "65.00" }],
		"total": "65.00"
	}
}
```

## Print Engine Configuration

Use environment variables before `npm start`:

- `POS_PRINT_MODE`: `hybrid` (default), `raw`, or `graphic`
- `POS_RAW_RENDER_SCALE`: render supersampling factor (default `2`)
- `POS_RAW_THRESHOLD`: monochrome threshold `1-254` (default `142`)
- `POS_RAW_CHUNK_HEIGHT`: GS v 0 chunk rows `1-255` (default `128`)
- `POS_RAW_END_FEED_LINES`: tail feed lines after print (default `1`)
- `POS_RAW_WIDTH_DOTS`: target raster width dots (default `384` for most 58mm heads)
- `POS_RAW_JOB_NAME`: spool job label

## Notes

- RAW mode is implemented for Windows queue printing.
- Hybrid mode is recommended for production because it preserves fallback resilience.
- No line-feed is inserted between raster chunks to reduce chopped-line issues on OEM thermal units.
