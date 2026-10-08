# Production Deployment — cho-services-appointment.bacolodcity.gov.ph

Deploys the **single combined site**: public booking at `/` plus staff login at
`/admin` (footer link "CHO Staff Login"), both talking to the production MySQL.

Pre-deploy gate (run locally, all must pass):

```bash
npm run build                      # TypeScript + production build
node security-tests/auth-e2e.mjs   # 12 checks (needs local dev server + DB)
node security-tests/mysql-e2e.mjs  # 65 checks (self-contained)
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
# NEXT_PUBLIC_APP_MODE: leave UNSET — single site (booking at /, staff at /admin)
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
server {
    listen 80;
    server_name cho-services-appointment.bacolodcity.gov.ph;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # required: Secure cookies
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cho /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d cho-services-appointment.bacolodcity.gov.ph
```

`X-Forwarded-Proto` is mandatory — without it admin session cookies never get
the `Secure` flag in production.

## 7. Verify

```bash
node scripts/check-database.mjs
curl -sI https://cho-services-appointment.bacolodcity.gov.ph/ | head -5
curl -s https://cho-services-appointment.bacolodcity.gov.ph/api/quotas
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

```bash
cd /var/www/cho && git pull && npm ci && npm run build && pm2 restart cho
```

## Notes

- Never commit `.env.local`; rotate the MySQL password if it ever appears in chat/logs.
- The domain currently serves a placeholder "HELLO" page — the vhost above replaces it.
- `NEXT_PUBLIC_APP_MODE=admin` only makes `/` redirect to `/admin` (used for local
  dev); production leaves it unset so `/` serves the booking form.
