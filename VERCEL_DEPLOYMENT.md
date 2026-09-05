# Vercel Deployment Guide

## Prerequisites

- GitHub repository created and code pushed
- Cloudflare D1 database created with `d1/schema.sql` applied
- D1 API token (D1 Edit) available

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
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_D1_DATABASE_ID=your-d1-database-id
CLOUDFLARE_D1_API_TOKEN=your-d1-api-token
```

To get these values:
1. Account ID: Cloudflare dashboard URL or Workers > Overview
2. Database ID: output of `npx wrangler d1 create cho-appointments`
3. API token: My Profile > API Tokens (D1 Edit permission)
4. Paste them into Vercel environment variables (server-only, all environments)

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
3. **Test Authentication**: Seed an admin via `node scripts/seed-admin.mjs` and test login
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
Use a separate D1 database (e.g. `cho-appointments-dev`) with its own
`CLOUDFLARE_D1_DATABASE_ID`; the account ID and a scoped token stay the same.

### Production
```env
CLOUDFLARE_ACCOUNT_ID=prod_account_id
CLOUDFLARE_D1_DATABASE_ID=prod_d1_database_id
CLOUDFLARE_D1_API_TOKEN=prod_d1_api_token
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
- Verify `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_D1_DATABASE_ID` / `CLOUDFLARE_D1_API_TOKEN`
- Confirm `d1/schema.sql` was applied to the right database
- Check the token has D1 Edit permission and isn't expired

### QR Scanner Not Working
- QR scanner requires HTTPS (works automatically on Vercel)
- Check camera permissions in browser
- Test on different devices/browsers

## Security Best Practices

1. **Never commit** `.env.local` to Git
2. Use environment-specific D1 databases (dev vs prod)
3. Enable Vercel password protection for admin routes (optional)
4. Keep dependencies updated
5. Rotate the D1 API token if ever exposed

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
- Review SETUP.md for D1 configuration
- Check browser console for errors

---

Your CHO Laboratory Appointment System is now ready for production deployment!