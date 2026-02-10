const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Models
const User = require('../src/models/User');
const Distributor = require('../src/models/Distributor');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const Order = require('../src/models/Order');
const Review = require('../src/models/Review');
const Coupon = require('../src/models/Coupon');
const EmailTemplate = require('../src/models/EmailTemplate');
const Role = require('../src/models/Role');
const ActivityLog = require('../src/models/ActivityLog');
const Settings = require('../src/models/Settings');

// Database Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buildmat', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ MongoDB Connected');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Clear all collections
const clearDatabase = async () => {
  console.log('\n🗑️  Clearing existing data...');
  await User.deleteMany({});
  await Distributor.deleteMany({});
  await Product.deleteMany({});
  await Category.deleteMany({});
  await Order.deleteMany({});
  await Review.deleteMany({});
  await Coupon.deleteMany({});
  await EmailTemplate.deleteMany({});
  await Role.deleteMany({});
  await ActivityLog.deleteMany({});
  await Settings.deleteMany({});
  console.log('✓ Database cleared');
};

// Seed Categories
const seedCategories = async () => {
  console.log('\n📁 Seeding Categories...');

  // Category names MUST match Product model enum: ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other']
  const categories = [
    {
      name: 'Cement',
      slug: 'cement',
      description: 'Various types of cement for construction including OPC, PPC, and specialty cement',
      icon: '🏗️',
      image: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400',
      isActive: true,
      order: 1,
      metaTitle: 'Buy Cement Online - Best Quality Cement',
      metaDescription: 'Shop high-quality cement for all your construction needs'
    },
    {
      name: 'Steel',
      slug: 'steel',
      description: 'High-grade steel and TMT bars for strong construction',
      icon: '🔩',
      image: 'https://images.unsplash.com/photo-1567789884554-0b844b597180?w=400',
      isActive: true,
      order: 2,
      metaTitle: 'Steel & TMT Bars - Construction Steel',
      metaDescription: 'Premium quality steel and TMT bars for strong construction'
    },
    {
      name: 'Bricks',
      slug: 'bricks',
      description: 'Red bricks, fly ash bricks, AAC blocks, and concrete blocks',
      icon: '🧱',
      image: 'https://images.unsplash.com/photo-1590075865003-e48277faa558?w=400',
      isActive: true,
      order: 3,
      metaTitle: 'Buy Bricks & Blocks Online',
      metaDescription: 'Quality bricks and blocks for all construction needs'
    },
    {
      name: 'Sand',
      slug: 'sand',
      description: 'River sand, M-sand, gravel, stone chips, and aggregates',
      icon: '⏳',
      image: 'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=400',
      isActive: true,
      order: 4,
      metaTitle: 'Sand & Aggregates - Construction Sand',
      metaDescription: 'Premium sand and aggregates for construction projects'
    },
    {
      name: 'Paint',
      slug: 'paint',
      description: 'Interior and exterior paints, wall putty, primers, and coatings',
      icon: '🎨',
      image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400',
      isActive: true,
      order: 5,
      metaTitle: 'Buy Paints & Putty Online',
      metaDescription: 'Top quality paints and wall putty for your home'
    },
    {
      name: 'Tiles',
      slug: 'tiles',
      description: 'Floor tiles, wall tiles, marble, granite, and vitrified tiles',
      icon: '◽',
      image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400',
      isActive: true,
      order: 6,
      metaTitle: 'Tiles & Marble - Floor and Wall Tiles',
      metaDescription: 'Premium tiles and marble for flooring and walls'
    },
    {
      name: 'Other',
      slug: 'other',
      description: 'Plumbing, electrical, hardware, roofing, and other building materials',
      icon: '📦',
      isActive: true,
      order: 7,
      metaTitle: 'Other Building Materials',
      metaDescription: 'All other construction and building supplies'
    }
  ];

  const createdCategories = await Category.insertMany(categories);
  console.log(`✓ Created ${createdCategories.length} categories`);
  return createdCategories;
};

// Parse CSV and seed distributors
const seedDistributors = async () => {
  console.log('\n🏢 Seeding Distributors from CSV...');

  const csvPath = path.join(__dirname, '../../Distributor Data.csv');
  const distributors = [];
  let distributorIndex = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        if (row['Distributor Name'] && row['Distributor Name'].trim()) {
          distributorIndex++;

          // Extract phone number (10 digits only)
          let phone = row['Phone Number'] || '';
          phone = phone.replace(/\s+/g, '').replace(/-/g, '').replace(/\+91/g, '');
          if (phone.length !== 10) phone = '9999999999';

          // Extract rating
          let rating = parseFloat(row['Ratings']) || 0;

          // Create unique email from business name + index
          let emailPrefix = row['Distributor Name']
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 15);

          // Ensure email prefix is not empty
          if (!emailPrefix || emailPrefix.length === 0) {
            emailPrefix = 'distributor';
          }

          // Add index to ensure uniqueness
          const email = emailPrefix + distributorIndex + '@distributor.com';

          // Generate contact person name from business name
          const contactName = row['Distributor Name'].split(' ')[0] + ' Kumar';

          // Ensure address is at least 10 characters
          let address = row['Complete Address'] || 'Jaipur, Rajasthan';
          if (address.length < 10) {
            address = address + ', Jaipur, Rajasthan';
          }

          // Generate valid GST number or leave undefined (it's optional with sparse: true)
          // Format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
          const generateGST = () => {
            const stateCode = '08'; // Rajasthan
            const panChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const pan = Array(5).fill(0).map(() => panChars[Math.floor(Math.random() * 26)]).join('');
            const entity = Math.floor(1000 + Math.random() * 9000);
            const letter = panChars[Math.floor(Math.random() * 26)];
            const checksum = Math.floor(1 + Math.random() * 9);
            const alphanumeric = panChars[Math.floor(Math.random() * 26)];
            return `${stateCode}${pan}${entity}${letter}${checksum}Z${alphanumeric}`;
          };

          distributors.push({
            businessName: row['Distributor Name'],
            name: contactName,
            email: email,
            password: bcrypt.hashSync('Password@123', 10),
            phone: phone || '9999999999',
            address: address,
            city: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302001',
            gstNumber: generateGST(),
            rating: rating > 0 ? rating : parseFloat((Math.random() * 2 + 3).toFixed(1)),
            reviewCount: Math.floor(Math.random() * 50) + 5,
            isApproved: true,
            isActive: true,
            emailVerified: true,
            phoneVerified: true,
            description: row['review'] || 'Quality building materials supplier in Jaipur',
            location: {
              type: 'Point',
              coordinates: [75.7873, 26.9124] // Jaipur coordinates [lng, lat]
            }
          });
        }
      })
      .on('end', async () => {
        try {
          const created = await Distributor.insertMany(distributors);
          console.log(`✓ Created ${created.length} distributors`);
          resolve(created);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
};

// Seed Users
const seedUsers = async () => {
  console.log('\n👥 Seeding Users...');

  const users = [
    {
      name: 'Admin User',
      email: 'admin@buildadda.com',
      password: bcrypt.hashSync('Admin@123', 10),
      phone: '9876543210',
      role: 'admin',
      isActive: true,
      isVerified: true,
      location: {
        type: 'Point',
        coordinates: [75.7873, 26.9124] // Jaipur coordinates [lng, lat]
      }
    },
    {
      name: 'Rajesh Kumar',
      email: 'rajesh.kumar@email.com',
      password: bcrypt.hashSync('User@123', 10),
      phone: '9876543211',
      role: 'user',
      isActive: true,
      isVerified: true,
      location: {
        type: 'Point',
        coordinates: [75.7873, 26.9124]
      },
      address: {
        street: '123, MG Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001'
      }
    },
    {
      name: 'Priya Sharma',
      email: 'priya.sharma@email.com',
      password: bcrypt.hashSync('User@123', 10),
      phone: '9876543212',
      role: 'user',
      isActive: true,
      isVerified: true,
      location: {
        type: 'Point',
        coordinates: [75.7900, 26.9050]
      },
      address: {
        street: '456, JLN Marg',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302002'
      }
    },
    {
      name: 'Amit Verma',
      email: 'amit.verma@email.com',
      password: bcrypt.hashSync('User@123', 10),
      phone: '9876543213',
      role: 'user',
      isActive: true,
      isVerified: true,
      location: {
        type: 'Point',
        coordinates: [75.8200, 26.9200]
      },
      address: {
        street: '789, MI Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302003'
      }
    },
    {
      name: 'Sunita Patel',
      email: 'sunita.patel@email.com',
      password: bcrypt.hashSync('User@123', 10),
      phone: '9876543214',
      role: 'user',
      isActive: true,
      isVerified: true,
      location: {
        type: 'Point',
        coordinates: [75.8100, 26.8900]
      },
      address: {
        street: '321, Tonk Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302004'
      }
    }
  ];

  const createdUsers = await User.insertMany(users);
  console.log(`✓ Created ${createdUsers.length} users`);
  return createdUsers;
};

// Seed Products
const seedProducts = async (categories, distributors) => {
  console.log('\n📦 Seeding Products...');

  const products = [];
  // Product template keys match Product model enum: ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other']
  const productTemplates = {
    'Cement': [
      { name: 'UltraTech Cement OPC 53 Grade', price: 380, unit: 'bag', minOrder: 10, image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500' },
      { name: 'ACC Gold Water Resistant Cement', price: 395, unit: 'bag', minOrder: 10, image: 'https://images.unsplash.com/photo-1584445584400-0a35aaa6e616?w=500' },
      { name: 'Ambuja Cement PPC', price: 360, unit: 'bag', minOrder: 10, image: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=500' },
      { name: 'JK Super Cement', price: 375, unit: 'bag', minOrder: 10, image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500' },
      { name: 'Dalmia Premium Cement', price: 385, unit: 'bag', minOrder: 10, image: 'https://images.unsplash.com/photo-1584445584400-0a35aaa6e616?w=500' }
    ],
    'Steel': [
      { name: 'TATA Tiscon TMT Bar 10mm', price: 58, unit: 'kg', minOrder: 100, image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=500' },
      { name: 'JSW Neosteel TMT Bar 12mm', price: 56, unit: 'kg', minOrder: 100, image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=500' },
      { name: 'SAIL TMT Bar 16mm', price: 55, unit: 'kg', minOrder: 100, image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=500' },
      { name: 'Kamdhenu TMT Bar 8mm', price: 60, unit: 'kg', minOrder: 50, image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=500' },
      { name: 'RINL TMT Bar 20mm', price: 54, unit: 'kg', minOrder: 100, image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=500' }
    ],
    'Bricks': [
      { name: 'Red Clay Bricks 1st Class', price: 8, unit: 'piece', minOrder: 500, image: 'https://images.unsplash.com/photo-1585128792275-433f8860ad8a?w=500' },
      { name: 'Fly Ash Bricks', price: 6, unit: 'piece', minOrder: 500, image: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=500' },
      { name: 'AAC Blocks 625x240x100mm', price: 55, unit: 'piece', minOrder: 100, image: 'https://images.unsplash.com/photo-1585128792275-433f8860ad8a?w=500' },
      { name: 'Concrete Hollow Blocks', price: 45, unit: 'piece', minOrder: 100, image: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=500' },
      { name: 'Solid Concrete Blocks', price: 35, unit: 'piece', minOrder: 100, image: 'https://images.unsplash.com/photo-1585128792275-433f8860ad8a?w=500' }
    ],
    'Sand': [
      { name: 'River Sand', price: 1800, unit: 'ton', minOrder: 1, image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=500' },
      { name: 'M-Sand (Manufactured Sand)', price: 1500, unit: 'ton', minOrder: 1, image: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=500' },
      { name: '20mm Aggregate', price: 1200, unit: 'ton', minOrder: 1, image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=500' },
      { name: '10mm Aggregate', price: 1300, unit: 'ton', minOrder: 1, image: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=500' },
      { name: 'Stone Dust', price: 900, unit: 'ton', minOrder: 1, image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=500' }
    ],
    'Paint': [
      { name: 'Asian Paints Royale Emulsion', price: 4500, unit: '20L', minOrder: 1, image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500' },
      { name: 'Berger Easy Clean Fresh', price: 4200, unit: '20L', minOrder: 1, image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=500' },
      { name: 'Nerolac Excel Total', price: 4300, unit: '20L', minOrder: 1, image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500' },
      { name: 'Birla White Wall Putty', price: 680, unit: 'bag', minOrder: 5, image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=500' },
      { name: 'JK Wall Putty', price: 650, unit: 'bag', minOrder: 5, image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500' }
    ],
    'Tiles': [
      { name: 'Kajaria Vitrified Tiles 2x2', price: 45, unit: 'sqft', minOrder: 100, image: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=500' },
      { name: 'Somany Floor Tiles', price: 42, unit: 'sqft', minOrder: 100, image: 'https://images.unsplash.com/photo-1560184897-67f4a3f9a7fa?w=500' },
      { name: 'Makrana White Marble', price: 180, unit: 'sqft', minOrder: 50, image: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=500' },
      { name: 'Black Galaxy Granite', price: 120, unit: 'sqft', minOrder: 50, image: 'https://images.unsplash.com/photo-1560184897-67f4a3f9a7fa?w=500' },
      { name: 'Italian Marble', price: 250, unit: 'sqft', minOrder: 50, image: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=500' }
    ],
    'Other': [
      { name: 'Jaquar Sink Mixer', price: 3500, unit: 'piece', minOrder: 1, image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500' },
      { name: 'Hindware Commode', price: 8500, unit: 'piece', minOrder: 1, image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500' },
      { name: 'Polycab Wire 2.5mm', price: 2800, unit: '90m', minOrder: 1, image: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=500' },
      { name: 'Havells MCB 32A', price: 280, unit: 'piece', minOrder: 5, image: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=500' },
      { name: 'Bosch Drilling Machine', price: 3500, unit: 'piece', minOrder: 1, image: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=500' },
      { name: 'Teak Wood Door', price: 18000, unit: 'piece', minOrder: 1, image: 'https://images.unsplash.com/photo-1563298723-dcfebaa392e3?w=500' },
      { name: 'GI Roofing Sheet 26 Gauge', price: 480, unit: 'sqft', minOrder: 100, image: 'https://images.unsplash.com/photo-1584445584400-0a35aaa6e616?w=500' },
      { name: 'Century Plywood 18mm', price: 85, unit: 'sqft', minOrder: 50, image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=500' },
      { name: 'CPVC Pipes 1/2 inch', price: 85, unit: 'meter', minOrder: 10, image: 'https://images.unsplash.com/photo-1607400201515-c2c41c07c2f0?w=500' },
      { name: 'Anchor Roma Switches', price: 85, unit: 'piece', minOrder: 10, image: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=500' }
    ]
  };

  // Category names now directly match Product enum - no mapping needed
  categories.forEach(category => {
    const templates = productTemplates[category.name] || [];
    const productCategory = category.name;

    templates.forEach(template => {
      // Create product for random distributors (2-5 per product)
      const numDistributors = Math.floor(Math.random() * 4) + 2;
      const selectedDistributors = [];

      for (let i = 0; i < numDistributors && i < distributors.length; i++) {
        const randomIndex = Math.floor(Math.random() * distributors.length);
        if (!selectedDistributors.includes(distributors[randomIndex]._id)) {
          selectedDistributors.push(distributors[randomIndex]._id);
        }
      }

      selectedDistributors.forEach(distributorId => {
        // Calculate price with ±10% variation, rounded to whole number
        const priceVariation = Math.floor(template.price * (0.9 + Math.random() * 0.2));

        products.push({
          name: template.name,
          description: `High-quality ${template.name.toLowerCase()} suitable for residential and commercial construction projects. Meets all industry standards and specifications.`,
          category: productCategory,
          distributor: distributorId,
          price: priceVariation,
          unit: template.unit,
          stock: Math.floor(Math.random() * 500) + 100,
          minQuantity: template.minOrder,
          maxQuantity: template.minOrder * 100,
          image: template.image,
          acceptedPaymentMethods: ['COD', 'Online'],
          isActive: true
        });
      });
    });
  });

  const createdProducts = await Product.insertMany(products);
  console.log(`✓ Created ${createdProducts.length} products`);
  return createdProducts;
};

// Seed Orders
const seedOrders = async (users, products, distributors) => {
  console.log('\n🛒 Seeding Orders...');

  const orders = [];
  const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  const paymentMethods = ['Online', 'COD'];

  users.slice(1).forEach((user, index) => {
    // Create 3-8 orders per user
    const orderCount = Math.floor(Math.random() * 6) + 3;

    for (let i = 0; i < orderCount; i++) {
      const orderProducts = [];
      const numProducts = Math.floor(Math.random() * 3) + 1; // 1-3 products per order
      const selectedProducts = [];
      let orderDistributor = null;

      for (let j = 0; j < numProducts; j++) {
        const product = products[Math.floor(Math.random() * products.length)];
        if (!selectedProducts.includes(product._id.toString())) {
          selectedProducts.push(product._id.toString());
          // Use the first product's distributor for the entire order
          if (!orderDistributor) {
            orderDistributor = product.distributor;
          }
          const quantity = (product.minQuantity || 1) * (Math.floor(Math.random() * 3) + 1);
          orderProducts.push({
            product: product._id,
            distributor: product.distributor,
            quantity: quantity,
            price: product.price,
            name: product.name,
            image: product.image || ''
          });
        }
      }

      const subtotal = orderProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = subtotal * 0.18;
      const deliveryCharge = subtotal > 5000 ? 0 : 150;
      const totalAmount = subtotal + tax + deliveryCharge;

      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const createdDate = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000); // Last 90 days

      orders.push({
        user: user._id,
        distributor: orderDistributor,
        items: orderProducts,
        shippingAddress: {
          fullName: user.name,
          phone: user.phone,
          address: user.address?.street || '123 Main Street',
          city: user.address?.city || 'Jaipur',
          state: user.address?.state || 'Rajasthan',
          pincode: user.address?.pincode || '302001'
        },
        paymentMethod: paymentMethods[Math.floor(Math.random() * 2)],
        paymentStatus: status === 'delivered' ? 'paid' : (status === 'cancelled' ? 'failed' : 'pending'),
        orderStatus: status,
        subtotal,
        tax,
        taxPercentage: 18,
        deliveryCharge,
        totalAmount,
        createdAt: createdDate,
        updatedAt: createdDate
      });
    }
  });

  const createdOrders = await Order.insertMany(orders);
  console.log(`✓ Created ${createdOrders.length} orders`);
  return createdOrders;
};

// Seed Reviews
const seedReviews = async (users, products, distributors) => {
  console.log('\n⭐ Seeding Reviews...');

  const reviews = [];
  const comments = [
    'Excellent quality! Highly satisfied with the product.',
    'Good product, timely delivery. Recommended.',
    'Value for money. Will order again.',
    'Very good quality material. Meets expectations.',
    'Fast delivery and good packaging. Product is as described.',
    'Satisfied with the purchase. Good service.',
    'Quality is top-notch. Worth the price.',
    'Decent product for the price. Delivery was on time.'
  ];

  // Product reviews (distributor will be auto-set from product)
  products.slice(0, 100).forEach(product => {
    const numReviews = Math.floor(Math.random() * 4) + 1; // 1-4 reviews per product
    const usedUsers = new Set();

    for (let i = 0; i < numReviews && usedUsers.size < users.length - 1; i++) {
      // Skip admin user (index 0)
      const userIndex = Math.floor(Math.random() * (users.length - 1)) + 1;
      const userId = users[userIndex]._id.toString();

      // Ensure unique user per product (as per schema index)
      if (!usedUsers.has(userId)) {
        usedUsers.add(userId);
        reviews.push({
          user: users[userIndex]._id,
          product: product._id,
          rating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
          comment: comments[Math.floor(Math.random() * comments.length)],
          isApproved: true,
          verified: Math.random() > 0.3, // 70% verified purchases
          helpful: Math.floor(Math.random() * 10),
          notHelpful: Math.floor(Math.random() * 3),
          createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000)
        });
      }
    }
  });

  const createdReviews = await Review.insertMany(reviews);
  console.log(`✓ Created ${createdReviews.length} reviews`);
  return createdReviews;
};

// Seed Coupons
const seedCoupons = async () => {
  console.log('\n🎫 Seeding Coupons...');

  const coupons = [
    {
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 1000,
      maxDiscount: 500,
      expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      usageLimit: 1000,
      usedCount: 50,
      isActive: true
    },
    {
      code: 'BULK20',
      discountType: 'percentage',
      discountValue: 20,
      minOrderAmount: 10000,
      maxDiscount: 2000,
      expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      usageLimit: 500,
      usedCount: 120,
      isActive: true
    },
    {
      code: 'FLAT500',
      discountType: 'fixed',
      discountValue: 500,
      minOrderAmount: 5000,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usageLimit: 200,
      usedCount: 45,
      isActive: true
    },
    {
      code: 'CEMENT15',
      discountType: 'percentage',
      discountValue: 15,
      minOrderAmount: 2000,
      maxDiscount: 1000,
      expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      usageLimit: 300,
      usedCount: 78,
      isActive: true
    },
    {
      code: 'FIRSTORDER',
      discountType: 'fixed',
      discountValue: 300,
      minOrderAmount: 3000,
      expiryDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
      usageLimit: 2000,
      usedCount: 250,
      isActive: true
    }
  ];

  const createdCoupons = await Coupon.insertMany(coupons);
  console.log(`✓ Created ${createdCoupons.length} coupons`);
  return createdCoupons;
};

// Main seeder function
const runSeeder = async () => {
  try {
    console.log('\n═══════════════════════════════════════');
    console.log('   BuildAdda Database Seeder');
    console.log('═══════════════════════════════════════\n');

    await connectDB();

    const clearData = process.argv.includes('--clear');
    if (clearData) {
      await clearDatabase();
    }

    // Seed in order (dependencies)
    const categories = await seedCategories();
    const users = await seedUsers();
    const distributors = await seedDistributors();
    const products = await seedProducts(categories, distributors);
    const orders = await seedOrders(users, products, distributors);
    const reviews = await seedReviews(users, products, distributors);
    const coupons = await seedCoupons();

    console.log('\n═══════════════════════════════════════');
    console.log('✅ Seeding completed successfully!');
    console.log('═══════════════════════════════════════\n');

    console.log('📊 Summary:');
    console.log(`   Categories:    ${categories.length}`);
    console.log(`   Users:         ${users.length}`);
    console.log(`   Distributors:  ${distributors.length}`);
    console.log(`   Products:      ${products.length}`);
    console.log(`   Orders:        ${orders.length}`);
    console.log(`   Reviews:       ${reviews.length}`);
    console.log(`   Coupons:       ${coupons.length}\n`);

    console.log('🔑 Login Credentials:');
    console.log('   Admin:  admin@buildadda.com / Admin@123');
    console.log('   User:   rajesh.kumar@email.com / User@123');
    console.log('   Distributor: (check distributors in database)\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeder
runSeeder();
