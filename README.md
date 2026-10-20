# Pocket Stock

A lightweight, free-first personal inventory web app for Android.

## Features
- Barcode scanning prefers ZXing for improved Android decoding, with native `BarcodeDetector` as a fallback
- Manual barcode entry fallback
- Free product lookup across Open Food Facts family databases and Open Library ISBN lookup
- Add, edit, and delete products; quantity adjustments; categories, locations, notes and photos
- Search, low-stock filters, summary counts, CSV import and export
- CSV import supports Pocket Stock exports and common English/German column names; matching barcodes update existing items, new barcodes are added. Photos are not imported from CSV.
- Offline caching as an installable PWA; inventory stored locally in this browser on this device

## Important: camera scanning needs HTTPS
For camera access, deploy the folder to a static HTTPS host (for example GitHub Pages or Cloudflare Pages) and open the HTTPS URL in Chrome on Android. Opening `index.html` directly from a ZIP/download (`file://`) will not grant camera access. When prompted, allow camera permission. If already denied, open Chrome site settings for the website and set Camera to Allow, then reload.

The ZXing scanner library is loaded at scan time from jsDelivr, with unpkg as a fallback, so barcode scanning requires an internet connection when first loading the decoder. If it cannot load, manual barcode entry remains available. After updating a deployed copy, close the home-screen app, open the HTTPS site in the same browser and reload it, then reopen the app. The service-worker cache version is bumped to refresh the app files.

## Deploy
Upload `index.html`, `manifest.json`, and `sw.js` together to an HTTPS static host. Keep all files in the same folder. Use **Add to Home screen** in Chrome to install.

## Product lookup
The app queries public databases without an API key. Coverage varies by product and barcode; some items must be entered manually. Verify lookup details before saving.

## Data and privacy
Inventory is stored in local browser storage on this device. Clearing site data may delete it, so export CSV regularly. Data is not automatically synced between devices. Photos are stored locally and limited to 4 MB each.


## CSV import
Tap **Import CSV** in the header and select a `.csv` file. The importer supports comma-separated and semicolon-separated files, quoted fields, and common English/German column names. Matching non-empty barcodes update the existing item; otherwise a new item is added. Review your data and keep a backup export before importing. Photos are not included in CSV files.
