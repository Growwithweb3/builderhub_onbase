# Deployment Guide - Builder Hub on Base

This guide will help you deploy the Builder Hub on Base to **Vercel** and **Railway**.

## 🚀 Deployment to Vercel

### Method 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in with your GitHub account

3. **Import Repository**
   - Click "Add New Project"
   - Select your repository: `Growwithweb3/builderhub_onbase`
   - Vercel will auto-detect settings

4. **Configure Project**
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: Leave empty (static site)
   - **Output Directory**: `./` (leave as default)
   - **Install Command**: Leave empty

5. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - Your site will be live at `https://your-project.vercel.app`

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **For production deployment**
   ```bash
   vercel --prod
   ```

### Vercel Configuration

The `vercel.json` file is already configured with:
- ✅ Security headers
- ✅ Cache control for static assets
- ✅ Clean URLs enabled
- ✅ No trailing slashes

**No additional configuration needed!**

---

## 🚂 Deployment to Railway

Railway is great for hosting static sites and can also host your backend later.

### Method 1: Deploy Static Site (Current Setup)

1. **Install Railway CLI** (optional but recommended)
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize Railway Project**
   ```bash
   railway init
   ```

4. **Create `railway.json`** (already created below)

5. **Deploy**
   ```bash
   railway up
   ```

### Method 2: Deploy via Railway Dashboard

1. **Go to Railway Dashboard**
   - Visit [railway.app](https://railway.app)
   - Sign in with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository: `Growwithweb3/builderhub_onbase`

3. **Configure Service**
   - Railway will auto-detect it's a static site
   - Add a static file server service

4. **Set Environment Variables** (if needed later for backend)
   - Go to Variables tab
   - Add any required environment variables

5. **Deploy**
   - Railway will automatically deploy
   - Your site will be live at `https://your-project.railway.app`

### Railway Configuration

Create a `railway.json` file (see below) for Railway-specific settings.

---

## 📝 Configuration Files

### vercel.json
Already configured! ✅

### railway.json
Create this file for Railway deployment:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "echo 'Static site - no build needed'"
  },
  "deploy": {
    "startCommand": "npx serve . -p $PORT",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### nginx.conf (Alternative for Railway)
If you prefer using Nginx on Railway:

```nginx
server {
    listen $PORT;
    server_name _;
    root /app;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /css/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /js/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 🔧 Environment Variables

Currently, no environment variables are needed for the frontend. When you add the backend, you'll need:

### For Backend (Future)
```
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=your_api_key
ADMIN_WALLET=0xb0dfc6ca6aafd3b0719949aa029d30d79fed30a4
DATABASE_URL=your_database_url
NODE_ENV=production
```

### Setting Environment Variables

**Vercel:**
- Go to Project Settings → Environment Variables
- Add variables for Production, Preview, and Development

**Railway:**
- Go to your service → Variables tab
- Add variables as needed

---

## 📦 Package.json Scripts

The `package.json` already includes:
```json
{
  "scripts": {
    "start": "npx serve .",
    "dev": "npx serve ."
  }
}
```

These are useful for local testing and Railway deployment.

---

## ✅ Post-Deployment Checklist

After deployment:

- [ ] Test all pages load correctly
- [ ] Test MetaMask connection
- [ ] Verify leaderboard displays
- [ ] Check mobile responsiveness
- [ ] Test form submissions (when backend is ready)
- [ ] Verify admin panel access (when backend is ready)
- [ ] Set up custom domain (optional)

---

## 🌐 Custom Domain Setup

### Vercel
1. Go to Project Settings → Domains
2. Add your domain
3. Follow DNS configuration instructions

### Railway
1. Go to your service → Settings → Networking
2. Add custom domain
3. Configure DNS records

---

## 🐛 Troubleshooting

### Vercel Issues

**Issue: Build fails**
- Solution: Make sure `vercel.json` doesn't have conflicting `routes` with `rewrites`/`headers`
- ✅ Already fixed in current `vercel.json`

**Issue: 404 on routes**
- Solution: Static sites work fine - all HTML files are accessible directly
- No SPA routing needed

### Railway Issues

**Issue: Port binding error**
- Solution: Use `$PORT` environment variable in start command
- ✅ Already configured in `railway.json`

**Issue: Static files not serving**
- Solution: Make sure `railway.json` is configured correctly
- Or use Nginx configuration

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Static Site Deployment Guide](https://vercel.com/docs/deployments/static-jamstack)

---

## 🎯 Quick Deploy Commands

### Vercel
```bash
vercel --prod
```

### Railway
```bash
railway up
```

---

**Your site is ready to deploy! 🚀**
