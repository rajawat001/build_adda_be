require('dotenv').config();
const mongoose = require('mongoose');
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

const createDistributor = async () => {
  await connectDB();

  try {
    const distributorExists = await Distributor.findOne({ 
      email: 'distributor@buildmat.com' 
    });
    
    if (distributorExists) {
      console.log('Distributor already exists!');
      process.exit(0);
    }

    const distributor = await Distributor.create({
      businessName: 'Kumar Building Materials',
      name: 'Rajesh Kumar',
      email: 'distributor@buildmat.com',
      password: 'distributor123',
      phone: '6377845721',
      pincode: '302034',
      address: '456 Market Road, Jaipur',
      location: {
        type: 'Point',
        coordinates: [75.7873, 26.9124]
      },
      isApproved: true,
      isActive: true
    });

    console.log('Distributor created successfully!');
    console.log('Email: distributor@buildmat.com');
    console.log('Password: distributor123');
    console.log('Status: Approved');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating distributor:', error.message);
    process.exit(1);
  }
};

createDistributor();