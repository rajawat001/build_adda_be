# Vercel Deployment Guide for BuildMat Backend

## Prerequisites

1. Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed: `npm install -g vercel`
3. MongoDB Atlas database (or any cloud MongoDB)
4. All required API keys ready

## Required Environment Variables

### Essential (Required)
Set these in Vercel Dashboard → Your Project → Settings → Environment Variables:

```
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/buildmat?retryWrites=true&w=majority
NODE_ENV=production
```

### Optional (For Full Functionality)
```
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

FRONTEND_URL=https://your-frontend-domain.vercel.app
```

## Deployment Steps

### Option 1: Deploy via Vercel CLI

1. Navigate to the Backend directory:
   ```bash
   cd Backend
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Follow the prompts:
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N** (first time)
   - Project name? **buildmat-backend** (or your choice)
   - In which directory is your code located? **./**
   - Override settings? **N**

5. For production deployment:
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your Git repository
3. Select the **Backend** folder as the root directory
4. Add all environment variables in Settings
5. Deploy

### Option 3: Deploy via GitHub Integration

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure the project:
   - **Root Directory**: `Backend`
   - **Framework Preset**: Other
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty)
4. Add environment variables
5. Deploy

## Post-Deployment

1. **Test the deployment**:
   ```bash
   curl https://your-backend-url.vercel.app/health
   ```

2. **Expected response**:
   ```json
   {
     "success": true,
     "message": "BuildMat API is running",
     "environment": "production",
     "timestamp": "2024-01-01T00:00:00.000Z"
   }
   ```

3. **Update Frontend**:
   - Add your Vercel backend URL to frontend's `NEXT_PUBLIC_API_URL`
   - Update CORS if needed

## Important Notes

### Rate Limiting
- Rate limiting works but may behave differently in serverless
- Consider using Vercel's Edge Config or external Redis for better rate limiting

### MongoDB Connection
- Connection is cached to optimize for serverless cold starts
- MongoDB Atlas is recommended for best performance
- Ensure MongoDB allows connections from anywhere (0.0.0.0/0) or Vercel IPs

### File Uploads
- Uses Cloudinary for image uploads (serverless-friendly)
- Multer uses memory storage (no local file system)

### Logs
- View logs in Vercel Dashboard → Your Project → Logs
- Use `console.log` for debugging (visible in Vercel logs)

### Cookie Configuration
- Cookies are configured with `sameSite: 'none'` in production
- `secure: true` is automatically set in production

## Troubleshooting

### Error: "Missing required environment variables"
- Add all required environment variables in Vercel Dashboard
- Redeploy after adding variables

### Error: "MongoDB connection failed"
- Check MONGODB_URI is correct
- Ensure MongoDB allows Vercel connections
- Check MongoDB Atlas IP whitelist (use 0.0.0.0/0 for Vercel)

### Error: "CORS policy blocked"
- Add your frontend URL to FRONTEND_URL environment variable
- The CORS config automatically allows *.vercel.app domains

### Error: "Function timeout"
- Vercel free tier has 10s timeout for serverless functions
- Optimize slow database queries
- Consider upgrading to Pro plan (60s timeout)

### Error: "Razorpay not working"
- Ensure all Razorpay environment variables are set
- Check you're using the correct keys (test vs live)

## Monitoring

1. **Vercel Analytics**: Available in dashboard
2. **MongoDB Atlas Monitoring**: Check database performance
3. **Error Tracking**: Check Vercel logs for errors

## Updating

To update your deployment:

```bash
git push origin main
```

Or manually redeploy:

```bash
vercel --prod
```

## Custom Domain

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed
4. Update FRONTEND_URL in environment variables

## Support

- Vercel Docs: https://vercel.com/docs
- MongoDB Atlas: https://docs.atlas.mongodb.com/
- Issues: Check application logs in Vercel Dashboard
