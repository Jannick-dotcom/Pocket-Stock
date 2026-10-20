# Pocket Stock

A lightweight, free-first personal inventory web app designed for Android phones. It runs in the browser and can be installed to the home screen when served over HTTPS.

## Features
- Barcode scanning with the device camera where the browser supports `BarcodeDetector`
- Manual barcode entry fallback
- Add, edit, and delete products
- Quantity adjustments (+1 / -1)
- Category, location, notes, and optional photo
- Search, category/low-stock filters, summary counts
- CSV export
- Offline caching as an installable PWA
- Inventory is stored locally in this browser on this device

## Run it
Open `index.html` in a browser for basic use. For camera scanning and installability, serve the folder from an HTTPS static host (or localhost during development), then open it in Chrome on Android and choose **Install app** / **Add to Home screen**.

## Important limitations
- Barcode scanning depends on browser support and camera permission. Manual entry is available as a fallback.
- The app does not connect to a commercial product database, so a scan reads the barcode number but may not automatically fill in the product name or picture.
- Data is stored in browser local storage. Clearing browser site data can remove it; export CSV regularly. Data is not automatically synced between devices.
- Photos are stored as local data URLs and are limited to 4 MB each to help avoid storage issues.

## Deploy free
Upload this folder to any static HTTPS hosting provider, such as GitHub Pages or Cloudflare Pages. Keep `index.html`, `manifest.json`, and `sw.js` in the same folder.


## Free barcode lookup

Use the **Lookup** button beside the barcode field, or scan a new barcode. The app queries public databases without an API key: Open Food Facts, Open Beauty Facts, Open Pet Food Facts, Open Products Facts, and Open Library for ISBN book barcodes. If a match is found, it fills available product name/category and may attach a product image URL. Database coverage is incomplete and requires an internet connection; verify details before saving.
