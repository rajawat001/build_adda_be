# Building Material E-commerce Platform

A complete full-stack e-commerce platform for building materials with separate user, distributor, and admin interfaces.

## 🚀 Tech Stack

### Frontend
- **Next.js** (Page Router)
- **TypeScript**
- **CSS** (No frameworks)
- **Axios** for API calls
- **Chart.js** for analytics

### Backend
- **Node.js + Express**
- **MongoDB + Mongoose**
- **JWT** Authentication
- **Cloudinary** for images
- **Razorpay** for payments

## 📁 Project Structure

```
building-material-ecommerce/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── styles/
│   │   ├── services/
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
│
└── backend/
    ├── src/
    │   ├── config/
    │   ├── models/
    │   ├── controllers/
    │   ├── services/
    │   ├── middleware/
    │   ├── routes/
    │   ├── scripts/
    │   └── app.js
    ├── package.json
    └── .env
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- Cloudinary account
- Razorpay account

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
npm install
```

2. Create `.env` file:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/buildmat
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
FRONTEND_URL=http://localhost:3000
```

3. Run scripts to seed database:
```bash
npm run create-admin
npm run create-distributor
npm run seed-products
```

4. Start backend:
```bash
npm run dev
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
npm install
```

2. Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key
```

3. Start frontend:
```bash
npm run dev
```

## 📋 Features

### User Features
- ✅ Registration & Login
- ✅ GPS location detection
- ✅ Find nearby distributors
- ✅ Browse products by category/distributor
- ✅ Advanced filters (price, category, availability)
- ✅ Wishlist management
- ✅ Shopping cart
- ✅ Coupon application
- ✅ Checkout with Razorpay/COD
- ✅ Order tracking
- ✅ Profile management

### Distributor Features
- ✅ Registration & Login
- ✅ Dashboard with analytics
  - Revenue graphs
  - Order statistics
  - Stock overview
- ✅ Product management (CRUD)
- ✅ Stock management
- ✅ Image upload via Cloudinary
- ✅ Order management
- ✅ Status updates

### Admin Features
- ✅ Separate admin login
- ✅ Dashboard with overview
  - Total revenue
  - Total orders
  - User/distributor count
  - Product statistics
- ✅ Distributor approval/management
- ✅ User management
- ✅ Product management
- ✅ Category management
- ✅ Coupon management
- ✅ Transaction reports
- ✅ Global settings

## 🗄️ Database Models

### User
- Personal information
- Location (GeoJSON)
- Authentication

### Distributor
- Business information
- Location (GeoJSON)
- Approval status

### Product
- Product details
- Category
- Stock
- Distributor reference
- Image URL

### Order
- User reference
- Items array
- Payment details
- Shipping information
- Order status

### Transaction
- Order reference
- Payment details
- Razorpay information

### Coupon
- Code
- Discount type/value
- Validity
- Usage limits

## 🔐 Authentication & Authorization

### JWT-based authentication with role-based access control:
- **User**: Access to shopping features
- **Distributor**: Product and order management
- **Admin**: Full system access

## 💳 Payment Integration

### Razorpay
- Order creation
- Payment verification
- Transaction logging

### Cash on Delivery
- COD option available
- Manual payment confirmation

## 📸 Image Upload

Images are uploaded to **Cloudinary** with:
- Automatic optimization
- Secure storage
- CDN delivery
- 5MB file size limit

## 🌍 Location Features

- Real-time GPS location detection
- GeoJSON storage in MongoDB
- Distance calculation for nearby distributors
- Pincode-based filtering

## 🛣️ API Endpoints

### Authentication
```
POST /api/auth/register  - Register user/distributor
POST /api/auth/login - Login
GET  /api/auth/profile - Get profile
```

### Products
```
GET    /api/products - Get all products
GET    /api/products/:id - Get product by ID
GET    /api/products/distributor/:id - Get by distributor
GET    /api/products/category/:category - Get by category
POST   /api/products - Create product (Distributor)
PUT    /api/products/:id - Update product (Distributor)
DELETE /api/products/:id - Delete product (Distributor)
```

### Orders
```
POST   /api/orders - Create order
GET    /api/orders - Get user orders
GET    /api/orders/:id - Get order details
PATCH  /api/orders/:id/status - Update status
POST   /api/orders/verify-payment - Verify Razorpay payment
```

### Admin
```
GET    /api/admin/dashboard - Dashboard stats
GET    /api/admin/distributors - Get all distributors
PATCH  /api/admin/distributors/:id/approve - Approve distributor
GET    /api/admin/users - Get all users
GET    /api/admin/transactions - Get all transactions
POST   /api/admin/coupons - Create coupon
PUT    /api/admin/coupons/:id - Update coupon
DELETE /api/admin/coupons/:id - Delete coupon
```

## 📊 Dashboard Analytics

### Distributor Dashboard
- Revenue trends (Chart.js)
- Order statistics
- Stock levels
- Recent orders

### Admin Dashboard
- System-wide statistics
- Revenue analytics
- User growth
- Transaction reports

## 🔨 Scripts

### Create Admin
```bash
npm run create-admin
```
Creates a super admin account

### Create Distributor
```bash
npm run create-distributor
```
Creates a sample distributor with approval

### Seed Products
```bash
npm run seed-products
```
Adds sample products in various categories

## 🚀 Deployment

### Frontend (Vercel)
```bash
cd frontend
vercel deploy
```

### Backend (Railway/Heroku)
```bash
cd backend
git push heroku main
```

## 📝 Environment Variables

### Frontend
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`

### Backend
- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `FRONTEND_URL`

## 🧪 Testing

Use the included Postman collection (`postman_collection.json`) to test all API endpoints.

## 📦 Additional Pages Needed

The following pages need to be created following the same pattern:

1. **pages/wishlist.tsx** - Wishlist management
2. **pages/orders.tsx** - Order history
3. **pages/order-success.tsx** - Success page
4. **pages/order-failure.tsx** - Failure page
5. **pages/profile.tsx** - User profile
6. **pages/products.tsx** - All products with filters
7. **pages/distributors.tsx** - Find distributors
8. **pages/distributor/dashboard.tsx** - Distributor dashboard
9. **pages/admin/dashboard.tsx** - Admin dashboard

## 🔧 Remaining Backend Files

The following controller/service/route files follow similar patterns:

### Controllers
- `product.controller.js`
- `order.controller.js`
- `admin.controller.js`

### Services
- `product.service.js`
- `order.service.js`
- `payment.service.js`

### Routes
- `product.routes.js`
- `order.routes.js`
- `admin.routes.js`

### Scripts
- `createAdmin.js`
- `createDistributor.js`
- `seedProducts.js`

All follow the same clean architecture pattern established in the auth files.

## 📄 License

MIT

## 👥 Support

For issues and questions, please create an issue in the repository.

---

**Note**: This is a production-ready template. Ensure you:
1. Change all secret keys in production
2. Enable CORS appropriately
3. Add rate limiting
4. Implement proper logging
5. Add comprehensive error handling
6. Set up monitoring
7. Configure SSL/HTTPS
8. Implement backup strategies