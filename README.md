# CHO Laboratory Appointment Booking & Admin System

A modern, full-stack laboratory appointment booking system for the City Health Office (CHO) of Bacolod City. Built with Next.js, Supabase, and Tailwind CSS.

## Features

### Patient Portal
- **Interactive Booking Form**: Easy-to-use appointment scheduling with date selection
- **Patient Information**: Full name, age, and health facility details
- **YAKAP Registration**: Conditional form fields for YAKAP registered patients
- **Laboratory Test Selection**: Comprehensive test options with checkboxes
- **Dynamic Fasting Reminders**: Automatic warnings for tests requiring fasting
- **QR Code Confirmation**: Generates downloadable QR codes for appointment verification

### Admin Dashboard
- **Secure Authentication**: Supabase Auth for admin access control
- **Patient Records Table**: Complete view of all appointments with sorting
- **QR Code Scanner**: Built-in camera scanner for quick patient lookup
- **Search & Filter**: Real-time search by name and filter by health facility
- **Site Access QR Poster**: Printable poster with site QR code for health stations

## Tech Stack

- **Framework**: Next.js 14+ (App Router, TypeScript)
- **Styling**: Tailwind CSS + Lucide Icons
- **Database & Auth**: Supabase PostgreSQL with Row Level Security
- **QR Technology**: `qrcode.react` (generation) & `html5-qrcode` (scanning)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account ([sign up free](https://supabase.com))

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
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

4. Set up Supabase database:
- Create a new Supabase project
- Run the SQL setup script from `supabase-setup.sql` in the Supabase SQL Editor
- Copy your project URL and anon key from Project Settings > API
- Add them to your `.env.local` file

5. Create admin user:
- In Supabase, go to Authentication > Users
- Create a new user with admin privileges
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

The system uses an `appointments` table with the following structure:
- `id`: UUID primary key
- `full_name`: Patient name
- `age`: Patient age
- `health_facility`: Facility where consulted
- `yakap_registered`: YAKAP registration status (YES/NO)
- `yakap_facility`: YAKAP facility (if registered)
- `selected_tests`: Array of selected laboratory tests
- `appointment_date`: Scheduled appointment date
- `created_at`: Booking timestamp
- `qr_code_id`: Unique QR code identifier

## Security

- **Row Level Security (RLS)**: Configured to allow public INSERT but authenticated SELECT only
- **Authentication**: Supabase Auth for admin access
- **Environment Variables**: Sensitive keys stored in environment variables

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Deploy automatically on push to main branch

### Environment Variables on Vercel

Navigate to your Vercel project > Settings > Environment Variables and add:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Your Supabase anon key

## Project Structure

```
cho-appointment-system/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   └── page.tsx          # Admin dashboard with auth
│   │   ├── layout.tsx             # Root layout
│   │   └── page.tsx              # Public appointment form
│   ├── components/
│   │   ├── AdminDashboard.tsx     # Main admin interface
│   │   ├── AppointmentForm.tsx   # Patient booking form
│   │   ├── QRScanner.tsx         # QR code scanner component
│   │   └── SiteQRPoster.tsx      # Site access QR poster
│   └── lib/
│       ├── supabase.ts           # Supabase client
│       ├── supabase-server.ts    # Server-side Supabase client
│       └── types.ts              # TypeScript types
├── public/                       # Static assets
├── supabase-setup.sql            # Database setup script
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