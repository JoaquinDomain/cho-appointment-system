# CHO Laboratory Appointment System - Setup Guide

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Navigate to the SQL Editor in your Supabase dashboard
3. Run the SQL setup script from `supabase-setup.sql`
4. Copy your project URL and anon key from Project Settings > API
5. Add them to your `.env.local` file

## Database Schema

The system uses an `appointments` table with the following structure:
- Patient information (name, age, facility)
- YAKAP registration status
- Selected laboratory tests
- Appointment date and timestamp
- QR code identifier

## Authentication

The system uses Supabase Auth for admin access:
- Public users can create appointments (INSERT)
- Only authenticated admin users can view records (SELECT)
- Row Level Security (RLS) is configured for data protection

## Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel project settings
4. Deploy automatically on push to main branch
