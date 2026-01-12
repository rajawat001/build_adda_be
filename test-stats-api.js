const mongoose = require('mongoose');
require('dotenv').config();

async function testStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buildadda');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
    const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
    const Distributor = mongoose.model('Distributor', new mongoose.Schema({}, { strict: false }));

    console.log('Testing stats calculation...\n');

    const [totalUsers, totalDistributors, totalProducts, totalOrders] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Distributor.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments()
    ]);

    console.log('Individual counts:');
    console.log('- Users (role=user):', totalUsers);
    console.log('- Distributors:', totalDistributors);
    console.log('- Products:', totalProducts);
    console.log('- Orders:', totalOrders);

    const revenueResult = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;

    console.log('\nRevenue calculation:');
    console.log('- Paid orders:', revenueResult.length > 0 ? 'Yes' : 'No');
    console.log('- Total Revenue:', totalRevenue);

    // Check order payment statuses
    const orderStatuses = await Order.aggregate([
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }
    ]);

    console.log('\nOrder payment statuses:');
    orderStatuses.forEach(status => {
      console.log(`- ${status._id || 'undefined'}: ${status.count}`);
    });

    // Sample order
    const sampleOrder = await Order.findOne().lean();
    console.log('\nSample order structure:');
    console.log(JSON.stringify(sampleOrder, null, 2).substring(0, 500));

    console.log('\n✅ Expected API response:');
    console.log(JSON.stringify({
      success: true,
      stats: {
        totalRevenue,
        totalOrders,
        totalUsers,
        totalDistributors,
        totalProducts
      }
    }, null, 2));

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testStats();
