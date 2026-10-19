# CHO Laboratory Appointment Booking & Admin System

A modern, full-stack laboratory appointment booking system for the City Health Office (CHO) of Bacolod City. Built with Next.js, MySQL, and Tailwind CSS.

## Features

### Patient Portal
- **Interactive Booking Form**: Easy-to-use appointment scheduling with date selection
- **Patient Information**: Full name, age, and health facility details
- **YAKAP Registration**: Conditional form fields for YAKAP registered patients
- **Laboratory Test Selection**: Comprehensive test options with checkboxes
- **Dynamic Fasting Reminders**: Automatic warnings for tests requiring fasting
- **QR Code Confirmation**: Generates downloadable QR codes for appointment verification

### Admin Dashboard
- **Secure Authentication**: Password + opaque MySQL-backed sessions (httpOnly cookies)
- **Patient Records Table**: Complete view of all appointments with sorting
- **QR Code Scanner**: Built-in camera scanner for quick patient lookup
- **Search & Filter**: Real-time search by name and filter by health facility
- **Block a Date**: Close any day to new bookings — patients see it greyed out
  with the reason, walk-ins are refused too, existing appointments stay put
- **Site Access QR Poster**: Printable poster with site QR code for health stations

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS + Lucide Icons
- **Database & Auth**: MySQL 8.0 + scrypt password hashing
- **QR Technology**: `qrcode.react` (generation) & `html5-qrcode` (scanning)
- **Deployment**: self-hosted Node.js service

## Getting Started

### Prerequisites

- Node.js 18+ installed
- MySQL 8.0 server with a database (see SETUP.md)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/cho-appointment-system.git
cd cho-appointment-system
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Copy `.env.example` to `.env.local` and fill in your MySQL coordinates:
```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=bcho_lab_appointment
MYSQL_USER=cho_app
MYSQL_PASSWORD=...
```

4. Set up the MySQL database:
- `mysql -u root -p bcho_lab_appointment < ./mysql/schema.sql`
- See SETUP.md for the full guide (app user grants, seeding, backups)

5. Create admin user:
- Run `node scripts/seed-admin.mjs` with `CHO_ADMIN_EMAIL` / `CHO_ADMIN_PASSWORD` set
- Use these credentials to login at `/admin`

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

### Tests

```bash
node scripts/check-database.mjs      # connectivity + schema/seed sanity
node security-tests/mysql-e2e.mjs    # full booking/admin/auth suite against a
                                     # throwaway MySQL 8.0 (downloaded on first run)
```

## Database Schema

The system uses MySQL tables (see `mysql/schema.sql`):
- `appointments`: UUID id, patient name/age/contact number, consultation facility, YAKAP
  status + facility, `selected_tests` (JSON array), appointment date,
  booking timestamp — with CHECK constraints and indexes
- `admin_users`: admin email + scrypt password hash
- `admin_sessions`: hashed opaque session tokens with expiry
- `blocked_dates`: days closed by an admin (`blocked_date` PK, optional reason,
  who blocked it and when) — refuses new online bookings and walk-ins only

## Security

- **Server-only database access**: the browser never talks to MySQL; all reads
  and writes go through validated, rate-limited `/api` routes
- **Authentication**: scrypt-hashed passwords + opaque sessions in httpOnly cookies
- **Environment Variables**: MySQL credentials are server-only env vars
- **Build-mode guard**: `next build` refuses to run when
  `NEXT_PUBLIC_APP_MODE=admin` is set (see `next.config.ts`), so a production
  build can never ship a patient homepage that redirects to `/admin`
- **QR poster URL safety**: the admin QR poster validates
  `NEXT_PUBLIC_PATIENT_SITE_URL` (https required, `*.vercel.app` refused in
  production) and shows an explicit error instead of generating a QR code for
  a wrong or retired URL (see `src/lib/patient-site-url.ts`)

### Rate limiting

Every API route is rate-limited per client IP. Client IPs come from the
rightmost `X-Forwarded-For` entry only (the one appended by the trusted
reverse proxy), so spoofed left-hand entries cannot mint fresh buckets.

| Endpoint | Default limit | Override with |
| --- | --- | --- |
| `POST /api/admin/login` (per IP) | 10 / 10 min | `RL_LOGIN_IP_LIMIT`, `RL_LOGIN_IP_WINDOW_MS` |
| `POST /api/admin/login` (failures per account email) | 5 / 15 min | `RL_LOGIN_FAIL_LIMIT`, `RL_LOGIN_FAIL_WINDOW_MS` |
| `POST /api/appointments` (public booking per IP) | 10 / 10 min | `RL_BOOK_IP_LIMIT`, `RL_BOOK_IP_WINDOW_MS` |
| `POST /api/appointments` without Turnstile per IP | 3 / 60 min | `RL_BOOK_UNVERIFIED_IP_LIMIT`, `RL_BOOK_UNVERIFIED_IP_WINDOW_MS` |
| Other admin routes (list, edit, delete, check-in, walk-in, blocked dates) | fixed per route (30–120 / min) | edit the route file |

Exceeded limits return HTTP 429 with a `Retry-After` header (where the route
sets one). Counters live in server memory: they reset on restart and are
per instance. If the app is ever scaled to multiple instances or needs
global limits, a shared store (e.g. Redis) is the upgrade path — coordinate
with MITCS before adding infrastructure.

## Deployment

### Environment Variables

Two kinds — `.env.example` explains each key:

- **Build-time (`NEXT_PUBLIC_*`)**: inlined into the JavaScript bundle when
  `npm run build` runs. Changing them later requires a rebuild.
  - `NEXT_PUBLIC_APP_MODE`: leave **unset** for production (build fails if set
    to `admin`; only for `next dev` convenience)
  - `NEXT_PUBLIC_PATIENT_SITE_URL`: official patient booking URL for the QR
    poster (production must be the `https://cho-laboratory-services-appointment.bacolodcity.gov.ph`
    domain; `*.vercel.app` is refused at render time)
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Turnstile widget key
- **Runtime (server-only, no rebuild needed)**:
  - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
  - Optional: `MYSQL_CONNECTION_LIMIT`, `MYSQL_SSL*` (see `.env.example`)
  - `TURNSTILE_SECRET_KEY`
  - Optional: `RL_*` rate-limit overrides (see “Rate limiting” above and `.env.example`)

**MITCS pre-deploy checklist:**

1. `.env.local` exists at the app root, `chmod 600`, not committed
2. `NEXT_PUBLIC_APP_MODE` **absent** (build guard will fail the build otherwise)
3. `NEXT_PUBLIC_PATIENT_SITE_URL` set to the official `https://` domain
4. MySQL credentials point at `127.0.0.1` / `bcho_lab_appointment`
5. Both Turnstile keys set (booking fails closed in production without them)
6. Run `npx tsc --noEmit && npm run lint && npm run build` before `npm start`

Build and run behind your web server / reverse proxy:

```bash
npm run build
npm start            # listens on PORT (default 3000)
```

## Project Structure

```
cho-appointment-system/
├── mysql/
│   └── schema.sql                # MySQL tables, constraints, indexes
├── scripts/
│   ├── db-env.mjs                # shared MySQL pool for scripts
│   ├── check-database.mjs        # connectivity + schema/seed check
│   └── seed-admin.mjs            # Seed admin user into MySQL
├── security-tests/
│   ├── mysql-e2e.mjs             # end-to-end suite against MySQL
│   └── auth-e2e.mjs              # auth/session suite
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   └── page.tsx          # Admin dashboard with auth
│   │   ├── api/
│   │   │   ├── admin/            # login/logout/me/walkins/blocked dates
│   │   │   ├── appointments/     # booking + admin CRUD
│   │   │   ├── blocked-dates/    # public list of closed days
│   │   │   └── quotas/           # daily availability counts
│   │   ├── layout.tsx             # Root layout
│   │   └── page.tsx              # Public appointment form
│   ├── components/
│   │   ├── AdminApp.tsx          # Admin shell (session login)
│   │   ├── AdminDashboard.tsx     # Main admin interface
│   │   ├── AppointmentForm.tsx   # Patient booking form
│   │   ├── BlockedDatesModal.tsx # Block/unblock a date (admin)
│   │   ├── QRScanner.tsx         # QR code scanner component
│   │   └── SiteQRPoster.tsx      # Site access QR poster
│   └── lib/
│       ├── appointments.ts       # DB row mapping
│       ├── blocked-dates.ts      # closed-date table (server-only)
│       ├── db/mysql.ts           # MySQL pool (server-only)
│       ├── password.ts           # scrypt hashing (server-only)
│       ├── session.ts            # opaque sessions (server-only)
│       └── types.ts              # TypeScript types + test catalog
├── public/                       # Static assets
├── SETUP.md                      # Setup guide
└── README.md                     # This file
```

## Laboratory Tests Available

- Panel (CBC, Platelet, Lipid Profile, FBS, Creatinine, Uric Acid)
- Blood Typing
- CBC / Platelet Count
- Fecal Occult Blood
- Stool Exam
- Urinalysis
- Dengue NS1 / Dengue Duo
- HBsAg
- Pregnancy Test
- Syphilis
- SGPT / SGOT
- BUN
- Creatinine
- Uric Acid
- Lipid Profile
- FBS
- OGTT
- Chest X-Ray
- Pap Smear

## Health Facilities

- CHO Main / Bacolod City Health Office
- Senior Citizen Center
- Alijis Health Station
- Banago Health Station
- Bata Health Station
- Bacolod City Mental Care Center
- Singcang Health Station
- Handumanan Health Station
- Pahanocoy Health Station
- Villamonte Health Station
- Taculing Health Station
- Others

## License

This project is for the City Health Office of Bacolod City.

## Support

For technical support or questions, please contact the CHO IT department.

---

Built with ❤️ for the Bacolod City Health Office
