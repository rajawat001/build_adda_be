require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Distributor = require('../models/Distributor');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

const sampleProducts = [
  {
    name: 'Portland Cement OPC 53 Grade',
    description: 'High quality cement suitable for all types of construction work',
    price: 350,
    category: 'Cement',
    stock: 500,
    unit: 'bag (50kg)'
  },
  {
    name: 'Ultra Tech Cement OPC 43 Grade',
    description: 'Premium cement for residential and commercial buildings',
    price: 330,
    category: 'Cement',
    stock: 300,
    unit: 'bag (50kg)'
  },
  {
    name: 'TMT Steel Bars 12mm',
    description: 'High strength deformed steel bars for RCC structures',
    price: 65,
    category: 'Steel',
    stock: 1000,
    unit: 'kg'
  },
  {
    name: 'TMT Steel Bars 16mm',
    description: 'Heavy duty steel bars for columns and beams',
    price: 68,
    category: 'Steel',
    stock: 800,
    unit: 'kg'
  },
  {
    name: 'Red Clay Bricks',
    description: 'Standard size bricks for wall construction',
    price: 8,
    category: 'Bricks',
    stock: 10000,
    unit: 'piece'
  },
  {
    name: 'Fly Ash Bricks',
    description: 'Eco-friendly lightweight bricks',
    price: 10,
    category: 'Bricks',
    stock: 8000,
    unit: 'piece'
  },
  {
    name: 'River Sand',
    description: 'Fine quality river sand for plastering and masonry',
    price: 1500,
    category: 'Sand',
    stock: 200,
    unit: 'ton'
  },
  {
    name: 'M-Sand (Manufactured Sand)',
    description: 'Machine crushed sand alternative to river sand',
    price: 1200,
    category: 'Sand',
    stock: 250,
    unit: 'ton'
  },
  {
    name: 'Asian Paints Apex Exterior Emulsion',
    description: 'Weather resistant exterior paint',
    price: 450,
    category: 'Paint',
    stock: 100,
    unit: 'liter'
  },
  {
    name: 'Berger Easy Clean Interior Paint',
    description: 'Premium interior emulsion with stain resistance',
    price: 380,
    category: 'Paint',
    stock: 150,
    unit: 'liter'
  },
  {
    name: 'Ceramic Floor Tiles 600x600mm',
    description: 'Glossy finish vitrified tiles for flooring',
    price: 45,
    category: 'Tiles',
    stock: 2000,
    unit: 'sq.ft'
  },
  {
    name: 'Designer Wall Tiles 300x450mm',
    description: 'Modern design tiles for bathroom walls',
    price: 35,
    category: 'Tiles',
    stock: 1500,
    unit: 'sq.ft'
  }
];

const seedProducts = async () => {
  await connectDB();

  try {
    const distributor = await Distributor.findOne({ 
      email: 'distributor@buildmat.com' 
    });

    if (!distributor) {
      console.log('Please create distributor first using: npm run create-distributor');
      process.exit(1);
    }

    await Product.deleteMany({});
    console.log('Existing products cleared');

    const productsToCreate = sampleProducts.map(product => ({
      ...product,
      distributor: distributor._id,
      isActive: true
    }));

    const products = await Product.insertMany(productsToCreate);

    console.log(`${products.length} products created successfully!`);
    console.log('\nSample Products:');
    products.forEach(p => {
      console.log(`- ${p.name} (${p.category}) - ₹${p.price}/${p.unit}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding products:', error.message);
    process.exit(1);
  }
};

seedProducts();