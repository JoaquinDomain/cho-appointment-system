# Production Deployment — cho-laboratory-services-appointment.bacolodcity.gov.ph

Deploys the combined public booking site at `/` and staff area at `/admin`
against the production MySQL database.

Production environment (managed by MITCS):

- Rocky Linux 9.6
- Application directory: `/var/www/cho-services-appointment.bacolodcity.gov.ph`
- systemd service: `cho-services-appointment.service`
- Next.js listens on `127.0.0.1:3000`
- Nginx and TLS: MITCS-managed
- MySQL 8.0 database: `bcho_lab_appointment`

Do not modify Nginx, the systemd unit, the service `WorkingDirectory`, or
restart production until MITCS has inspected the existing configuration and
approved the change. The automated checks below are local unless explicitly
identified as production checks; they do not prove production infrastructure is
healthy.

## Pre-deploy gate (local)

```bash
npx tsc --noEmit && npm run lint   # static checks
npm run build                      # production build (refuses APP_MODE=admin)
npm run test:calendar              # headless browser test; stubs date/quota APIs and does not submit a booking
node security-tests/patient-url-test.mjs   # QR URL resolver (13 checks)
node security-tests/build-guard-test.mjs   # build guard (4 checks)
node security-tests/mysql-e2e.mjs  # 82 checks (self-contained, throwaway MySQL)
```

These checks validate the repository and the production build. They do not prove
that the live server, Nginx configuration, network path, or deployed release is
healthy.

## 1. Server prerequisites (MITCS-managed)

Rocky Linux 9.6, Node.js 20+, Nginx, MySQL 8.0, and systemd are managed by
MITCS. Confirm them with MITCS; do not install, replace, or reconfigure server
packages or the unit yourself.

Read-only checks:

```bash
node -v
systemctl status --no-pager cho-services-appointment.service
mysql -h 127.0.0.1 -u <dbuser> -p -e "SELECT VERSION();"
```

## 2. Application directory

The application lives at
`/var/www/cho-services-appointment.bacolodcity.gov.ph`. Confirm the live commit
and service configuration before changing anything:

```bash
git -C /var/www/cho-services-appointment.bacolodcity.gov.ph rev-parse --short HEAD
systemctl cat cho-services-appointment.service
```

Do not clone over, rebuild, or replace the live directory. Use the
MITCS-approved staging/release directory for a fresh install or dependency
change.

## 3. Environment (BEFORE build — NEXT_PUBLIC_* is baked in at build time)

Edit `.env.local` in the application directory with an approved editor, then
restrict it:

```bash
chmod 600 .env.local
```

Fill from `.env.example`:

```env
MYSQL_HOST=127.0.0.1          # app + MySQL on the same server
MYSQL_PORT=3306
MYSQL_DATABASE=bcho_lab_appointment
MYSQL_USER=<from MITCS>
MYSQL_PASSWORD=<from MITCS>
# NEXT_PUBLIC_APP_MODE: leave UNSET — single site (booking at /, staff at /admin).
# `next build` FAILS if this is set to 'admin' (build guard in next.config.ts).
NEXT_PUBLIC_PATIENT_SITE_URL=https://cho-laboratory-services-appointment.bacolodcity.gov.ph/
                            # build-time; QR poster target (https only, *.vercel.app refused)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<key>
TURNSTILE_SECRET_KEY=<key>    # booking fails closed without it
```

Never commit `.env.local`, paste it into chat, or expose its values in shell
history or logs.

## 4. Database schema + first admin (approved change window)

Run only during an approved install or change window, with MITCS and the database
owner aware:

```bash
mysql -h 127.0.0.1 -u <dbuser> -p bcho_lab_appointment < ./mysql/schema.sql

CHO_ADMIN_EMAIL='admin@cho.gov.ph' \
CHO_ADMIN_PASSWORD='<from approved secret store>' \
node scripts/seed-admin.mjs     # re-run to reset password; revokes sessions

node scripts/check-database.mjs  # must report healthy
```

Use the approved secret-entry method for the admin password; do not paste it
into shell history or commit it.

## 5. Build and systemd service

Build in the MITCS-approved staging/release directory. Do not run `npm run build`
in the live directory while it is serving — replacing `.next` mid-traffic can
leave HTML and chunks mismatched.

The app runs as systemd unit `cho-services-appointment.service` on
`127.0.0.1:3000`. MITCS owns the unit. Do not start a second process manager,
change `WorkingDirectory`/`ExecStart`, or restart production without MITCS
inspection and approval.

## 6. Nginx / HTTPS (MITCS-managed)

MITCS manages Nginx and TLS on Rocky Linux 9.6. Do not create a vhost, add or
replace a static alias, reload Nginx, or restart the app to work around a
first-load failure. First ask MITCS for a read-only review of:

- the active configuration (`nginx -T`), including proxy/upstream, keepalive,
  static-asset handling, and any `limit_conn`/`limit_req` settings;
- the Nginx error and access logs;
- the app upstream at `127.0.0.1:3000`, its timeouts, and upstream health;
- `systemctl status --no-pager nginx`.

If the logs and configuration confirm HTTP 503s on `/_next/static/*.js`, MITCS
can evaluate keepalive/upstream capacity, serving hashed assets directly from
the live release, and connection/request limits. Those are server-level changes;
do not apply them outside MITCS coordination. Verify any change with the
production deployment verifier.

TLS certificates and renewal are also MITCS-managed. Preserve the existing
`X-Forwarded-Proto` handling — without it, admin session cookies do not receive
the `Secure` flag.

## 7. Verify

After an approved deploy or MITCS server change, run the read-only verifier from
a local checkout against production:

```bash
npm run verify:deploy -- https://cho-laboratory-services-appointment.bacolodcity.gov.ph/
```

The verifier loads the page in a fresh headless browser, fails on any 4xx/5xx
`/_next/static` asset, waits for React hydration, and clicks an enabled calendar
date. It does **not** submit an appointment and does **not** write to production
data; it may make read-only GET requests for quotas and blocked dates.

A local test pass does not prove production infrastructure is fixed. Only
repeated runs against the production URL after the MITCS-approved
deploy/config change, combined with MITCS log confirmation, provide evidence
that production is healthy.

If every calendar date is greyed out and the "taking longer than usual" notice
appears, the suspected cause is failed JavaScript chunk delivery preventing
hydration — not necessarily a calendar bug. Production logs and configuration
must confirm that before any server change.

Other read-only checks:

```bash
node scripts/check-database.mjs  # read-only; checks the DB configured in the current environment
curl -sI https://cho-laboratory-services-appointment.bacolodcity.gov.ph/ | head -5
curl -s https://cho-laboratory-services-appointment.bacolodcity.gov.ph/api/quotas
```

- [ ] Booking page loads over HTTPS
- [ ] `npm run verify:deploy -- https://...` passes
- [ ] Security headers present (`curl -sI ... | grep -i content-security`)
- [ ] Footer link "CHO Staff Login" opens `/admin` and login works
- [ ] Test appointment books and appears in the DB — only with authorization;
      this is the one check that writes production data

## 8. Firewall / access (MITCS)

- MySQL 3306: whitelisted IPs only; the app uses `127.0.0.1`, so it does not
  cross the firewall.
- SSH: whitelist `119.93.84.15` (or your current office IP — confirm with
  `curl api.ipify.org` before requesting a change).
- Firewall changes are MITCS-managed.

## 9. Backups (patient data — required)

Use an approved MySQL option file or secret-management method so the database
password never appears in cron, shell history, or dump output.

- Restrict the option file to the backup account and mode `0600`; never embed
  the password directly in a cron command.
- Dump `bcho_lab_appointment` with `--single-transaction --routines` on a
  MITCS-approved schedule and location.
- Use restrictive permissions for backup directories (`0700`) and files
  (`0600`), and encrypt off-site copies as required.
- Keep at least weekly backups and copy exports off-machine.
- Test restores in a scratch database, never in production. See SETUP.md §5.

## 10. Updating later (with MITCS)

Do not rebuild in the live directory, create symlinks, change the unit, or
restart production before inspecting the existing MITCS-managed configuration.

1. Confirm the live release and service contract:

   ```bash
   git -C /var/www/cho-services-appointment.bacolodcity.gov.ph rev-parse --short HEAD
   systemctl cat cho-services-appointment.service
   systemctl status --no-pager cho-services-appointment.service
   ```

2. Ask MITCS for the approved staging/release directory and release-swap
   procedure. Build with `npm ci && npm run build` there, never in the live
   directory.

3. MITCS performs the release swap and restarts
   `cho-services-appointment.service` after inspecting the unit and Nginx
   configuration.

4. Run the production verifier:

   ```bash
   npm run verify:deploy -- https://cho-laboratory-services-appointment.bacolodcity.gov.ph/
   ```

5. Do not consider the update finished until the live commit matches the built
   commit, the verifier passes, and MITCS confirms the Nginx/error logs no longer
   show relevant 503 or upstream failures.

## Notes

- Never commit `.env.local`; rotate the MySQL password if it is ever exposed.
- `NEXT_PUBLIC_APP_MODE=admin` only makes `/` redirect to `/admin` (local
  `next dev` convenience); production leaves it unset so `/` serves the booking
  form, and `next build` refuses to run if it is set to `admin` (build guard).
- Intermittent 503s on `/_next/static/*.js` are a **suspected** cause of disabled
  dates on first load: without those chunks React cannot hydrate, so the
  calendar stays disabled even though the form looks rendered. Confirm this from
  production Nginx logs and configuration before changing the server.
- A manual refresh may recover a transient chunk failure, but it does not fix
  the delivery problem.
- Always confirm the live commit; production may not match `main`.
- Localhost returning 200 while the public site returns 503s is useful evidence
  for MITCS, not proof of the exact Nginx directive or limit.
