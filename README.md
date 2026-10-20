# Pocket Stock — self-hosted sync edition

Pocket Stock is a personal barcode inventory PWA with a self-hosted API. The server stores inventory in SQLite on your server; the browser keeps a local copy for offline use. Devices sync when online, on app open/resume, after local edits, and every 30 seconds while the app is open.

## Recommended stack

- Docker Compose
- Node.js + Express REST API
- SQLite database stored in a persistent Docker volume
- Caddy reverse proxy for automatic HTTPS
- Password-based first account, scrypt password hashes, signed 30-day bearer tokens, basic auth rate limiting

No cloud vendor account is required. You do need a server that stays on, and for the easiest setup a domain name whose DNS points to that server.

## Important sync behavior

- Create the account once on your server, then sign in on each device with the same username/password.
- The first account is the only account allowed on this personal instance; other devices share its inventory. This prevents random visitors from creating accounts on your private server.
- Items merge by ID and latest `updatedAt` timestamp. Deletes are synced as tombstones so a stale device doesn't resurrect deleted items.
- Keep device date/time set automatically. Large clock differences can affect conflict resolution.
- Photos are synced with their items and therefore use server storage and bandwidth.
- The app caches inventory locally, then syncs after edits when online. Avoid editing the same item on two devices at exactly the same time; the most recently timestamped version wins.
- Browser local data is still a local cache. Do not clear browser/site storage until the first sync has completed.

## Server setup (Docker + domain)

These instructions target an Ubuntu/Debian VPS or an always-on Linux server. Install Docker Engine and the Docker Compose plugin first. Keep the server and Docker packages updated.

1. Point a domain or subdomain (for example `inventory.example.com`) to your server's public IP address with a DNS A record. Add an AAAA record only if IPv6 is configured correctly.
2. Copy this `pocket-stock` folder to the server.
3. In this folder, create the environment file:

   ```sh
   cp .env.example .env
   nano .env
   ```

   Set `DOMAIN` to your real domain. Generate a token secret on the server using `openssl rand -hex 32` and paste it as `TOKEN_SECRET`. Keep `.env` private and never commit it to a public repository.

4. Ensure your firewall allows inbound TCP ports 80 and 443. Caddy uses these to obtain and renew a trusted HTTPS certificate. Do not expose port 3000 or the SQLite database to the internet.
5. Start the service:

   ```sh
   docker compose up -d --build
   docker compose logs -f
   ```

6. Check `https://YOUR-DOMAIN/api/health`; it should return JSON containing `"ok":true`.
7. Open `https://YOUR-DOMAIN/` on the first device. Tap **Sync / Sign in**, enter the same HTTPS URL, choose a username (letters, numbers, dot, underscore or hyphen; 3–80 characters), and a password of at least 12 characters. Tap **Create first account**.
8. On each other device, open the same HTTPS URL, tap **Sync / Sign in**, enter the same URL and credentials, and tap **Sign in & sync**. Use **Add to Home screen** from the browser menu if desired.

### If your server is at home

For access outside your home network, you need a domain plus router port forwarding for 80/443, or a private VPN such as Tailscale with an HTTPS setup. Do not forward the database port. If you only need sync on your home Wi-Fi, a private LAN-only deployment is possible, but camera access and PWA behavior generally still require a secure context; use a trusted HTTPS/VPN arrangement rather than plain HTTP.

## Updating

Back up the database first (see below), copy the updated source files to the server, then run:

```sh
docker compose up -d --build
```

The app service serves the files from `public/`. Keep `public/index.html`, `public/manifest.json`, and `public/sw.js` together. The service-worker cache version should be incremented when making front-end changes.

## Backups and restore

The database lives in the named Docker volume `pocket_stock_data` at `/data/pocket-stock.sqlite` inside the container. To make a consistent SQLite backup:

```sh
mkdir -p backups
docker compose exec -T pocket-stock node -e "const D=require('better-sqlite3'); const db=new D('/data/pocket-stock.sqlite'); db.backup('/tmp/pocket-stock-backup.sqlite').then(()=>process.exit(0))"
docker cp "$(docker compose ps -q pocket-stock)":/tmp/pocket-stock-backup.sqlite ./backups/pocket-stock-$(date +%F).sqlite
```

Copy backups to a separate secure location. Test restoring a backup before relying on it. Protect backups because they contain inventory and product photos.

## Security notes

- HTTPS is required. Caddy obtains certificates automatically if DNS and ports are configured correctly.
- The API is served from the same origin as the app; no permissive cross-origin API access is enabled.
- Passwords are stored as salted scrypt hashes, not plaintext. API tokens expire after 30 days.
- The first account owns this personal instance; there is no public account registration after it exists.
- Store `.env` securely, keep the OS/Docker updated, back up the SQLite volume, and restrict SSH access. For sensitive/public production use, consider adding account recovery and token revocation before exposing the service widely.

## Development without Docker

Requires Node.js 20+ and build tools for `better-sqlite3`:

```sh
npm install
TOKEN_SECRET="$(openssl rand -hex 32)" DATA_DIR=./data npm start
```

This listens on port 3000 over HTTP and is intended for local development only. Do not use the plain HTTP development server over the internet; place it behind HTTPS before using it from Android devices.
