# Production Deployment — cho-laboratory-services-appointment.bacolodcity.gov.ph

Deploys the **single combined site**: public booking at `/` plus staff login at
`/admin` (footer link "CHO Staff Login"), both talking to the production MySQL.

Pre-deploy gate (run locally, all must pass):

```bash
npx tsc --noEmit && npm run lint   # static checks
npm run build                      # production build (refuses APP_MODE=admin)
node security-tests/patient-url-test.mjs   # QR URL resolver (13 checks)
node security-tests/build-guard-test.mjs   # build guard (4 checks)
node security-tests/mysql-e2e.mjs  # 81 checks (self-contained, throwaway MySQL)
```

## 1. Server prerequisites

```bash
# Node.js 20+ (MIT-approved), nginx, MySQL 8.0 already present
node -v                    # >= 20
mysql -h 127.0.0.1 -u <dbuser> -p -e "SELECT VERSION();"
sudo apt install -y pm2 certbot python3-certbot-nginx   # Debian/Ubuntu
```

## 2. Get the code

```bash
sudo mkdir -p /var/www/cho && sudo chown $USER /var/www/cho
cd /var/www/cho
git clone https://github.com/JoaquinDomain/cho-appointment-system.git .
npm ci
```

## 3. Environment (BEFORE build — NEXT_PUBLIC_* is baked in at build time)

```bash
nano .env.local && chmod 600 .env.local
```

Fill from `.env.example`:

```env
MYSQL_HOST=127.0.0.1          # app + MySQL on the same server
MYSQL_PORT=3306
MYSQL_DATABASE=bcho_lab_appointment
MYSQL_USER=<from MIT>
MYSQL_PASSWORD=<from MIT>
# NEXT_PUBLIC_APP_MODE: leave UNSET — single site (booking at /, staff at /admin).
# `next build` FAILS if this is set to 'admin' (build guard in next.config.ts).
NEXT_PUBLIC_PATIENT_SITE_URL=https://cho-laboratory-services-appointment.bacolodcity.gov.ph/
                            # build-time; QR poster target (https only, *.vercel.app refused)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<key>
TURNSTILE_SECRET_KEY=<key>    # booking fails closed without it
```

## 4. Database schema + first admin

```bash
mysql -h 127.0.0.1 -u <dbuser> -p bcho_lab_appointment < ./mysql/schema.sql

CHO_ADMIN_EMAIL='admin@cho.gov.ph' \
CHO_ADMIN_PASSWORD='<strong-password-12+chars>' \
node scripts/seed-admin.mjs     # re-run to reset password; revokes sessions
node scripts/check-database.mjs  # must report healthy
```

## 5. Build + run with PM2

```bash
npm run build
pm2 start npm --name cho -- start
pm2 save && pm2 startup         # survive reboots
pm2 logs cho
```

App is now on `127.0.0.1:3000`.

## 6. nginx vhost + HTTPS

```bash
sudo nano /etc/nginx/sites-available/cho
```

```nginx
# Keepalive upstream: reuses TCP connections to Node. Without this every
# request (including the ~30 parallel JS chunks a first page load requests)
# opens a new connection; a burst can overflow the accept queue and surface
# as intermittent 503s on /_next/static/*.js, which dead-locks hydration.
upstream cho_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name cho-laboratory-services-appointment.bacolodcity.gov.ph;

    # Serve hashed build assets straight from disk: removes ~30 proxied
    # requests per first load from Node entirely.
    location /_next/static/ {
        alias /var/www/cho/.next/static/;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";       # enable keepalive to upstream
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # required: Secure cookies
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cho /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d cho-laboratory-services-appointment.bacolodcity.gov.ph
```

`X-Forwarded-Proto` is mandatory — without it admin session cookies never get
the `Secure` flag in production.

## 7. Verify

```bash
node scripts/check-database.mjs
curl -sI https://cho-laboratory-services-appointment.bacolodcity.gov.ph/ | head -5
curl -s https://cho-laboratory-services-appointment.bacolodcity.gov.ph/api/quotas
```

- [ ] Booking page loads over HTTPS
- [ ] Test appointment books and appears in the DB
- [ ] Security headers present (`curl -sI ... | grep -i content-security`)
- [ ] Footer link "CHO Staff Login" opens `/admin` and login works

## 8. Firewall / access (MIT)

- MySQL 3306: whitelisted IPs only; app uses `127.0.0.1` so it never crosses the firewall
- SSH: whitelist `119.93.84.15` (or your current office IP — check with `curl api.ipify.org`)

## 9. Backups (patient data — required)

```bash
mkdir -p /var/backups/cho
(crontab -l; echo "0 2 * * * mysqldump -h 127.0.0.1 -u <dbuser> -p'<pw>' --single-transaction --routines bcho_lab_appointment | gzip > /var/backups/cho/$(date +\%F).sql.gz") | crontab -
```

Weekly minimum; copy exports off-machine. Restore practice: load into a scratch
database first. See SETUP.md §5.

## 10. Updating later

Do not rebuild in the live directory while it is serving — `npm run build`
replaces `.next` mid-traffic and can leave HTML and chunks mismatched.
Build in a staging directory, then swap:

```bash
rsync -a --delete /var/www/cho/ /var/www/cho-staging/ --exclude .env.local --exclude node_modules
cd /var/www/cho-staging && git pull && npm ci && npm run build
sudo ln -sfn /var/www/cho-staging /var/www/cho-current   # atomic symlink swap
# restart the app service to point at the new directory, then remove the old release
```

If the app is managed by systemd (as on the current server), restart with
`sudo systemctl restart cho`; the DEPLOY.md §5 commands assume pm2 — check
`systemctl status cho` vs `pm2 list` on the server and use whichever runs it.

## Notes

- Never commit `.env.local`; rotate the MySQL password if it ever appears in chat/logs.
- The domain currently serves a placeholder "HELLO" page — the vhost above replaces it.
- `NEXT_PUBLIC_APP_MODE=admin` only makes `/` redirect to `/admin` (local `next dev`
  convenience); production leaves it unset so `/` serves the booking form, and
  `next build` refuses to run if it is set to `admin` (build guard).
- **Intermittent 503s on `/_next/static/*.js`** kill page interactivity (hydration
  never completes). The app self-heals with one automatic reload and shows a
  Refresh notice as fallback, but the delivery problem must be fixed in nginx
  (vhost §6: keepalive upstream + static alias). Diagnose with:

  ```bash
  sudo tail -f /var/log/nginx/error.log        # "limiting requests", "no live upstreams", "connect() failed"
  sudo nginx -T | grep -iE 'limit_conn|limit_req|keepalive'
  for i in $(seq 20); do curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/_next/static/chunks/<runtime>.js; done
  ```

  Localhost 200s with public 503s point at nginx/limits, not the Node app.
