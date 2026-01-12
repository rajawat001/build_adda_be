// Check database contents
const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buildadda');
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log('📊 DATABASE CONTENTS:\n');

    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      console.log(`${collection.name}: ${count} documents`);
    }

    console.log('\n📋 DETAILED COUNTS:\n');

    // Check specific collections
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
    const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
    const Distributor = mongoose.model('Distributor', new mongoose.Schema({}, { strict: false }));

    const [users, products, orders, distributors] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments(),
      Order.countDocuments(),
      Distributor.countDocuments()
    ]);

    console.log(`Users (role=user): ${users}`);
    console.log(`Products: ${products}`);
    console.log(`Orders: ${orders}`);
    console.log(`Distributors: ${distributors}`);

    // Check admins
    const admins = await User.countDocuments({ role: 'admin' });
    console.log(`\nAdmins: ${admins}`);

    // Show admin emails
    const adminUsers = await User.find({ role: 'admin' }).select('email name');
    console.log('\n👤 Admin accounts:');
    adminUsers.forEach(admin => {
      console.log(`  - ${admin.email} (${admin.name})`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkDatabase();
