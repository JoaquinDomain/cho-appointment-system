# Vercel Deployment Guide

## Prerequisites

- GitHub repository created and code pushed
- Supabase project set up with database schema
- Supabase project URL and anon key available

## Step 1: Connect to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Sign up or log in
3. Click "Add New..." > "Project"

## Step 2: Import Repository

1. Select "Import Git Repository"
2. Choose your `cho-appointment-system` repository from GitHub
3. Vercel will automatically detect it as a Next.js project

## Step 3: Configure Project

### Framework Preset
- **Framework**: Next.js
- **Root Directory**: `./` (default)
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `.next` (auto-detected)

### Environment Variables

Add these environment variables in Project Settings > Environment Variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

To get these values:
1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy Project URL and Anon Key
4. Paste them into Vercel environment variables

## Step 4: Deploy

1. Click "Deploy"
2. Vercel will build and deploy your application
3. Wait for the deployment to complete (usually 1-2 minutes)
4. You'll get a live URL like `https://cho-appointment-system.vercel.app`

## Step 5: Post-Deployment Setup

### Update Site URL in Components

After deployment, update the site URL in `src/components/SiteQRPoster.tsx`:

```typescript
const [siteUrl] = useState('https://cho-appointment-system.vercel.app')
```

Replace with your actual Vercel deployment URL.

### Test the Application

1. **Public Portal**: Visit your main URL to test the appointment form
2. **Admin Dashboard**: Visit `https://your-url.vercel.app/admin`
3. **Test Authentication**: Create an admin user in Supabase and test login
4. **Test QR Scanner**: Test the QR scanning functionality (requires HTTPS)

## Step 6: Custom Domain (Optional)

1. Go to Project Settings > Domains
2. Click "Add Domain"
3. Enter your custom domain (e.g., `cho.bacolod.gov.ph`)
4. Follow DNS configuration instructions
5. Wait for SSL certificate provisioning

## Environment-Specific Variables

For different environments (Development, Preview, Production):

### Development
```env
NEXT_PUBLIC_SUPABASE_URL=dev_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dev_supabase_key
```

### Production
```env
NEXT_PUBLIC_SUPABASE_URL=prod_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=prod_supabase_key
```

## Automatic Deployments

Vercel automatically deploys:
- On every push to the main branch
- On every pull request (as preview deployments)
- When you click "Redeploy" in the dashboard

## Monitoring and Logs

- View deployment logs in Vercel dashboard
- Monitor function execution and performance
- Set up error tracking with Vercel Analytics (optional)

## Troubleshooting

### Build Failures
- Check environment variables are set correctly
- Verify all dependencies are installed
- Check the build logs for specific errors

### Database Connection Issues
- Verify Supabase URL and keys are correct
- Check Supabase project is active
- Ensure RLS policies are properly configured

### QR Scanner Not Working
- QR scanner requires HTTPS (works automatically on Vercel)
- Check camera permissions in browser
- Test on different devices/browsers

## Security Best Practices

1. **Never commit** `.env.local` to Git
2. Use environment-specific Supabase projects
3. Enable Vercel password protection for admin routes (optional)
4. Keep dependencies updated
5. Monitor Supabase usage and costs

## Performance Optimization

- Enable Vercel Analytics
- Use Vercel Image Optimization for images
- Consider edge functions for faster response times
- Enable automatic compression

## Support

For Vercel-specific issues:
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Community](https://vercel.com/community)

For application issues:
- Check the main README.md
- Review SETUP.md for Supabase configuration
- Check browser console for errors

---

Your CHO Laboratory Appointment System is now ready for production deployment!