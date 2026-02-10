const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Category = require('../src/models/Category');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buildmat', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

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

const seedCategories = async () => {
  try {
    console.log('\n===================================');
    console.log('   BuildAdda Category Seeder');
    console.log('===================================\n');

    await connectDB();

    // Remove existing categories
    const deleted = await Category.deleteMany({});
    console.log(`Removed ${deleted.deletedCount} existing categories`);

    // Insert new categories
    const created = await Category.insertMany(categories);
    console.log(`Created ${created.length} categories:\n`);

    created.forEach((cat) => {
      console.log(`  ${cat.icon}  ${cat.name} (slug: ${cat.slug}, order: ${cat.order})`);
    });

    // Verify product connection by counting products per category
    const Product = require('../src/models/Product');
    console.log('\nProduct counts per category:');
    for (const cat of created) {
      const count = await Product.countDocuments({ category: cat.name, isActive: true });
      console.log(`  ${cat.name}: ${count} products`);
    }

    console.log('\nCategory seeding completed successfully!');
    console.log('===================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\nSeeding failed:', error);
    process.exit(1);
  }
};

seedCategories();
