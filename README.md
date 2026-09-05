# CHO Laboratory Appointment Booking & Admin System

A modern, full-stack laboratory appointment booking system for the City Health Office (CHO) of Bacolod City. Built with Next.js, Cloudflare D1, and Tailwind CSS.

## Features

### Patient Portal
- **Interactive Booking Form**: Easy-to-use appointment scheduling with date selection
- **Patient Information**: Full name, age, and health facility details
- **YAKAP Registration**: Conditional form fields for YAKAP registered patients
- **Laboratory Test Selection**: Comprehensive test options with checkboxes
- **Dynamic Fasting Reminders**: Automatic warnings for tests requiring fasting
- **QR Code Confirmation**: Generates downloadable QR codes for appointment verification

### Admin Dashboard
- **Secure Authentication**: Password + opaque D1-backed sessions (httpOnly cookies)
- **Patient Records Table**: Complete view of all appointments with sorting
- **QR Code Scanner**: Built-in camera scanner for quick patient lookup
- **Search & Filter**: Real-time search by name and filter by health facility
- **Site Access QR Poster**: Printable poster with site QR code for health stations

## Tech Stack

- **Framework**: Next.js 14+ (App Router, TypeScript)
- **Styling**: Tailwind CSS + Lucide Icons
- **Database & Auth**: Cloudflare D1 (SQLite) + scrypt password hashing
- **QR Technology**: `qrcode.react` (generation) & `html5-qrcode` (scanning)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Cloudflare account with a D1 database (see SETUP.md)

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
Copy `.env.example` to `.env.local` and fill in your D1 coordinates:
```env
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_D1_DATABASE_ID=your-d1-database-id
CLOUDFLARE_D1_API_TOKEN=your-d1-api-token
```

4. Set up the D1 database:
- `npx wrangler d1 execute cho-appointments --remote --file=./d1/schema.sql`
- See SETUP.md for the full guide (token scopes, seeding)

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

## Database Schema

The system uses D1 tables (see `d1/schema.sql`):
- `appointments`: UUID id, patient name/age, consultation facility, YAKAP
  status + facility, `selected_tests` (JSON array), appointment date,
  booking timestamp — with CHECK constraints and indexes
- `admin_users`: admin email + scrypt password hash
- `admin_sessions`: hashed opaque session tokens with expiry

## Security

- **Server-only database access**: the browser never talks to D1; all reads
  and writes go through validated, rate-limited `/api` routes
- **Authentication**: scrypt-hashed passwords + opaque sessions in httpOnly cookies
- **Environment Variables**: D1 credentials are server-only env vars

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_D1_DATABASE_ID`
   - `CLOUDFLARE_D1_API_TOKEN`
4. Deploy automatically on push to main branch

### Environment Variables on Vercel

Navigate to your Vercel project > Settings > Environment Variables and add:
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `CLOUDFLARE_D1_DATABASE_ID`: Your D1 database ID
- `CLOUDFLARE_D1_API_TOKEN`: Token with D1 Edit permission (server-only)

## Project Structure

```
cho-appointment-system/
├── d1/
│   └── schema.sql                # D1 tables, constraints, indexes
├── scripts/
│   └── seed-admin.mjs            # Seed admin user into D1
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   └── page.tsx          # Admin dashboard with auth
│   │   ├── api/
│   │   │   ├── admin/            # login/logout/me (session auth)
│   │   │   ├── appointments/     # booking + admin CRUD
│   │   │   └── quotas/           # daily availability counts
│   │   ├── layout.tsx             # Root layout
│   │   └── page.tsx              # Public appointment form
│   ├── components/
│   │   ├── AdminApp.tsx          # Admin shell (session login)
│   │   ├── AdminDashboard.tsx     # Main admin interface
│   │   ├── AppointmentForm.tsx   # Patient booking form
│   │   ├── QRScanner.tsx         # QR code scanner component
│   │   └── SiteQRPoster.tsx      # Site access QR poster
│   └── lib/
│       ├── appointments.ts       # D1 row mapping
│       ├── d1.ts                 # D1 HTTP API client (server-only)
│       ├── password.ts           # scrypt hashing (server-only)
│       ├── session.ts            # opaque sessions (server-only)
│       └── types.ts              # TypeScript types + test catalog
├── public/                       # Static assets
├── wrangler.toml                 # D1 management config
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