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
- `POS_RAW_CHUNK_HEIGHT`: GS v 0 chunk rows `1-255` (default `64`)
- `POS_RAW_RASTER_MODE`: GS v 0 mode (`48` default for clone compatibility; other valid values: `0-3`, `48-51`)
- `POS_RAW_IMAGE_MODE`: `raster` (GS v 0) or `bit-image` (ESC `*`) for compatibility fallback
- `POS_RAW_CHUNK_SEPARATOR`: `auto` (default), `none`, `lf`, or `crlf`
- `POS_RAW_LF_BETWEEN_CHUNKS`: legacy alias for separator mode (`on` => `lf`, `off` => `none`)
- `POS_RAW_END_FEED_LINES`: tail feed lines after print (default `1`)
- `POS_RAW_WIDTH_DOTS`: target raster width dots (default `384` for most 58mm heads)
- `POS_RAW_JOB_NAME`: spool job label

## Notes

- RAW mode is implemented for Windows queue printing.
- Hybrid mode is recommended for production because it preserves fallback resilience.
- Vozy/V50-style clone firmware may require CRLF between raster chunks or `bit-image` protocol.
