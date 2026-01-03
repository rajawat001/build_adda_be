# Complete Setup Guide - Building Material E-commerce Platform

## 📋 Prerequisites

Before starting, ensure you have:
- **Node.js** v16+ installed ([Download](https://nodejs.org/))
- **MongoDB** installed locally or MongoDB Atlas account ([Setup Guide](https://www.mongodb.com/docs/manual/installation/))
- **Cloudinary** account ([Sign up](https://cloudinary.com/))
- **Razorpay** account ([Sign up](https://razorpay.com/))
- **Git** installed
- A code editor (VS Code recommended)

## 🚀 Step-by-Step Installation

### Step 1: Project Structure Setup

Create the main project directory:
```bash
mkdir building-material-ecommerce
cd building-material-ecommerce
```

Create two subdirectories:
```bash
mkdir frontend backend
```

### Step 2: Backend Setup

#### 2.1 Initialize Backend
```bash
cd backend
npm init -y
```

#### 2.2 Install Dependencies
```bash
npm install express mongoose bcryptjs jsonwebtoken cors dotenv cloudinary multer razorpay crypto
npm install --save-dev nodemon
```

#### 2.3 Create Folder Structure
```bash
mkdir -p src/config src/models src/controllers src/services src/middleware src/routes src/scripts
```

#### 2.4 Configure Environment Variables

Create `.env` file in backend root:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/buildmat
JWT_SECRET=your_super_secret_jwt_key_change_in_production_min_32_chars
JWT_EXPIRES_IN=7d

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Razorpay Configuration
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

#### 2.5 Get Cloudinary Credentials
1. Go to [Cloudinary Console](https://console.cloudinary.com/)
2. Sign up or log in
3. Copy your Cloud Name, API Key, and API Secret
4. Paste them in `.env`

#### 2.6 Get Razorpay Credentials
1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Sign up or log in
3. Go to Settings → API Keys
4. Generate Test/Live keys
5. Copy Key ID and Key Secret
6. Paste them in `.env`

#### 2.7 Update package.json Scripts

Add these scripts to `backend/package.json`:
```json
"scripts": {
  "start": "node src/app.js",
  "dev": "nodemon src/app.js",
  "create-admin": "node src/scripts/createAdmin.js",
  "create-distributor": "node src/scripts/createDistributor.js",
  "seed-products": "node src/scripts/seedProducts.js"
}
```

#### 2.8 Start MongoDB

**Local MongoDB:**
```bash
# macOS
brew services start mongodb-community

# Windows
net start MongoDB

# Linux
sudo systemctl start mongod
```

**MongoDB Atlas:**
1. Create cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Get connection string
3. Replace `MONGODB_URI` in `.env`

#### 2.9 Seed Database
```bash
npm run create-admin
npm run create-distributor
npm run seed-products
```

You should see:
```
Admin created successfully!
Email: admin@buildmat.com
Password: admin123

Distributor created successfully!
Email: distributor@buildmat.com
Password: distributor123

12 products created successfully!
```

#### 2.10 Start Backend Server
```bash
npm run dev
```

Expected output:
```
Server running on port 5000
MongoDB Connected: localhost
```

### Step 3: Frontend Setup

Open a new terminal window:

#### 3.1 Initialize Frontend
```bash
cd frontend
npm init -y
```

#### 3.2 Install Next.js and Dependencies
```bash
npm install next@14.0.4 react@18.2.0 react-dom@18.2.0 axios@1.6.2 chart.js@4.4.1 react-chartjs-2@5.2.0
npm install --save-dev typescript @types/react @types/node @types/react-dom
```

#### 3.3 Create Folder Structure
```bash
mkdir -p src/pages src/components src/styles src/services src/utils
```

#### 3.4 Configure Environment Variables

Create `.env.local` file in frontend root:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id
```

#### 3.5 Update package.json Scripts

Update `frontend/package.json`:
```json
"scripts": {
  "dev": "next dev -p 3000",
  "build": "next build",
  "start": "next start -p 3000",
  "lint": "next lint"
}
```

#### 3.6 Create next.config.js

Create `frontend/next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
```

#### 3.7 Start Frontend Server
```bash
npm run dev
```

Expected output:
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

### Step 4: Verify Installation

#### 4.1 Test Backend API
Open browser or Postman and test:
```
GET http://localhost:5000/
```

Expected response:
```json
{
  "message": "BuildAdda API is running"
}
```

#### 4.2 Test Frontend
Open browser:
```
http://localhost:3000
```

You should see the BuildAdda homepage.

#### 4.3 Test Login
Try logging in with:
- **Admin**: admin@buildmat.com / admin123
- **Distributor**: distributor@buildmat.com / distributor123
- **User**: Create a new user account via registration

## 🔧 Common Issues & Solutions

### Issue 1: MongoDB Connection Failed
**Error**: `MongoServerError: connect ECONNREFUSED`

**Solution**:
```bash
# Check if MongoDB is running
mongosh

# If not running, start it
# macOS: brew services start mongodb-community
# Windows: net start MongoDB
# Linux: sudo systemctl start mongod
```

### Issue 2: Port Already in Use
**Error**: `EADDRINUSE: address already in use :::5000`

**Solution**:
```bash
# Find and kill the process
# macOS/Linux
lsof -ti:5000 | xargs kill -9

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Issue 3: Cloudinary Upload Fails
**Error**: `Cloudinary configuration error`

**Solution**:
1. Verify credentials in `.env`
2. Check Cloudinary dashboard for correct values
3. Ensure no spaces in credentials
4. Restart backend server after changing `.env`

### Issue 4: Razorpay Integration Issues
**Error**: `Key ID or Secret is invalid`

**Solution**:
1. Use **Test Mode** keys for development
2. Generate new keys from Razorpay Dashboard
3. Ensure both frontend and backend have correct Key ID
4. Check for trailing spaces in `.env` file

### Issue 5: CORS Errors
**Error**: `CORS policy: No 'Access-Control-Allow-Origin'`

**Solution**:
1. Verify `FRONTEND_URL` in backend `.env`
2. Restart backend server
3. Clear browser cache

## 📦 File Structure Reference

After setup, your structure should look like:

```
building-material-ecommerce/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── _app.tsx
│   │   │   ├── index.tsx
│   │   │   ├── login.tsx
│   │   │   ├── register.tsx
│   │   │   └── cart.tsx
│   │   ├── components/
│   │   │   ├── SEO.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── ProductCard.tsx
│   │   │   └── Filter.tsx
│   │   ├── styles/
│   │   │   ├── global.css
│   │   │   ├── home.css
│   │   │   ├── login.css
│   │   │   ├── cart.css
│   │   │   ├── checkout.css
│   │   │   └── dashboard.css
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── product.service.ts
│   │   │   └── order.service.ts
│   │   └── utils/
│   │       └── location.ts
│   ├── .env.local
│   ├── .gitignore
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.js
│
└── backend/
    ├── src/
    │   ├── config/
    │   │   ├── db.js
    │   │   ├── cloudinary.js
    │   │   └── razorpay.js
    │   ├── models/
    │   │   ├── User.js
    │   │   ├── Distributor.js
    │   │   ├── Product.js
    │   │   ├── Order.js
    │   │   ├── Transaction.js
    │   │   └── Coupon.js
    │   ├── controllers/
    │   │   └── auth.controller.js
    │   ├── services/
    │   │   └── auth.service.js
    │   ├── middleware/
    │   │   ├── auth.middleware.js
    │   │   ├── role.middleware.js
    │   │   └── error.middleware.js
    │   ├── routes/
    │   │   └── auth.routes.js
    │   ├── scripts/
    │   │   ├── createAdmin.js
    │   │   ├── createDistributor.js
    │   │   └── seedProducts.js
    │   └── app.js
    ├── .env
    ├── .gitignore
    ├── package.json
    └── postman_collection.json
```

## 🎯 Next Steps

1. **Complete Remaining Files**: Create the additional controllers, services, and routes following the patterns shown
2. **Test All Features**: Use the Postman collection to test all API endpoints
3. **Customize**: Modify styles, add your branding, adjust features
4. **Deploy**: Follow deployment guides for Vercel (frontend) and Railway/Heroku (backend)

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [MongoDB Manual](https://www.mongodb.com/docs/manual/)
- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Razorpay Integration Guide](https://razorpay.com/docs/payments/server-integration/)

## 💡 Development Tips

1. **Use Console Logs**: Add `console.log()` statements to debug issues
2. **Check Network Tab**: Use browser DevTools to inspect API calls
3. **MongoDB Compass**: Use [MongoDB Compass](https://www.mongodb.com/products/compass) to view your database
4. **Postman**: Import the collection to test APIs independently
5. **Git Commits**: Commit frequently with meaningful messages

## 🆘 Getting Help

If you encounter issues:
1. Check the error message carefully
2. Review the Common Issues section
3. Check MongoDB/Backend logs
4. Verify environment variables
5. Ensure all services are running

## ✅ Verification Checklist

Before proceeding, verify:
- [ ] MongoDB is running and accessible
- [ ] Backend server starts without errors
- [ ] Admin account created successfully
- [ ] Distributor account created successfully
- [ ] Sample products seeded
- [ ] Frontend server starts without errors
- [ ] Can register a new user
- [ ] Can login with different roles
- [ ] Products are displayed on homepage
- [ ] Cloudinary credentials configured
- [ ] Razorpay credentials configured

---

**Congratulations!** Your Building Material E-commerce Platform is now set up and ready for development. 🎉