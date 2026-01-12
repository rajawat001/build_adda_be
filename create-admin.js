// Run this script to create an admin user
// Usage: node create-admin.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './Backend/.env' });

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  phone: String,
  isActive: Boolean,
  createdAt: Date
});

const User = mongoose.model('User', userSchema);

async function createAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buildadda');
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@buildadda.com' });

    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email: admin@buildadda.com');
      console.log('You can update the password if needed');

      // Update to admin role if not already
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('User role updated to admin');
      }
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash('Admin@123', 10);

      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@buildadda.com',
        password: hashedPassword,
        role: 'admin',
        phone: '+91 9999999999',
        isActive: true,
        createdAt: new Date()
      });

      console.log('✅ Admin user created successfully!');
      console.log('\n📧 Login credentials:');
      console.log('Email: admin@buildadda.com');
      console.log('Password: Admin@123');
      console.log('\n⚠️  Please change the password after first login!');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
