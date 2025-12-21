require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

const createAdmin = async () => {
  await connectDB();

  try {
    const adminExists = await User.findOne({ email: 'admin@buildmat.com' });
    
    if (adminExists) {
      console.log('Admin already exists!');
      process.exit(0);
    }

    const admin = await User.create({
      name: 'Admin',
      email: 'admin@buildmat.com',
      password: 'admin123',
      phone: '9999999999',
      role: 'admin',
      pincode: '302001',
      address: 'BuildMat HQ, Jaipur',
      location: {
        type: 'Point',
        coordinates: [75.7873, 26.9124]
      }
    });

    console.log('Admin created successfully!');
    console.log('Email: admin@buildmat.com');
    console.log('Password: admin123');
    console.log('Please change the password after first login.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();