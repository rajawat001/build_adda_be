const mongoose = require('mongoose');

// Auto-seed default categories if none exist (runs once on startup)
const seedDefaultCategories = async () => {
  try {
    const Category = require('../models/Category');
    const count = await Category.countDocuments();
    if (count > 0) return; // Categories already exist, skip

    const defaultCategories = [
      { name: 'Cement', slug: 'cement', description: 'Various types of cement for construction', icon: '🏗️', image: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400', isActive: true, order: 1 },
      { name: 'Steel', slug: 'steel', description: 'High-grade steel and TMT bars', icon: '🔩', image: 'https://images.unsplash.com/photo-1567789884554-0b844b597180?w=400', isActive: true, order: 2 },
      { name: 'Bricks', slug: 'bricks', description: 'Red bricks, fly ash bricks, AAC blocks', icon: '🧱', image: 'https://images.unsplash.com/photo-1590075865003-e48277faa558?w=400', isActive: true, order: 3 },
      { name: 'Sand', slug: 'sand', description: 'River sand, M-sand, gravel, aggregates', icon: '⏳', image: 'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=400', isActive: true, order: 4 },
      { name: 'Paint', slug: 'paint', description: 'Interior and exterior paints, wall putty', icon: '🎨', image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400', isActive: true, order: 5 },
      { name: 'Tiles', slug: 'tiles', description: 'Floor tiles, wall tiles, marble, granite', icon: '◽', image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400', isActive: true, order: 6 },
      { name: 'Other', slug: 'other', description: 'Plumbing, electrical, hardware and other materials', icon: '📦', isActive: true, order: 7 }
    ];

    await Category.insertMany(defaultCategories);
    console.log('Auto-seeded 7 default categories');
  } catch (error) {
    console.error('Category auto-seed error:', error.message);
  }
};

// Auto-seed default roles and assign Super Admin to primary admin user
const seedDefaultRolesAndSuperAdmin = async () => {
  try {
    const Role = require('../models/Role');
    const User = require('../models/User');

    // Step 1: Create missing default roles
    const defaults = Role.getDefaultRoles();
    let created = 0;
    for (const defaultRole of defaults) {
      const exists = await Role.findOne({ name: defaultRole.name });
      if (!exists) {
        await Role.create(defaultRole);
        created++;
      }
    }
    if (created > 0) {
      console.log(`Auto-seeded ${created} default role(s)`);
    }

    // Step 2: Assign Super Admin to hrajawat1404@gmail.com (only if no assignedRole yet)
    const primaryAdmin = await User.findOne({ email: 'hrajawat1404@gmail.com' });
    if (primaryAdmin && primaryAdmin.role === 'admin' && !primaryAdmin.assignedRole) {
      const superAdminRole = await Role.findOne({ name: 'Super Admin' });
      if (superAdminRole) {
        primaryAdmin.assignedRole = superAdminRole._id;
        await primaryAdmin.save();
        console.log('Auto-assigned Super Admin role to hrajawat1404@gmail.com');
      }
    }
  } catch (error) {
    console.error('Role auto-seed error:', error.message);
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Auto-seed after DB connection
    await seedDefaultCategories();
    await seedDefaultRolesAndSuperAdmin();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;