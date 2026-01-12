const mongoose = require('mongoose');
require('dotenv').config();

async function updateOrdersAndTest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buildadda');
    console.log('Connected to MongoDB\n');

    const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));

    // Count orders by status
    const statuses = await Order.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 }, totalAmount: { $sum: '$totalAmount' } } }
    ]);

    console.log('📊 Current Order Statuses:');
    statuses.forEach(s => {
      console.log(`  ${s._id || 'undefined'}: ${s.count} orders (Total: ₹${s.totalAmount || 0})`);
    });

    // Update 5 pending orders to delivered for testing
    const result = await Order.updateMany(
      { orderStatus: 'pending' },
      { $set: { orderStatus: 'delivered' } },
      { limit: 5 }
    );

    console.log(`\n✅ Updated ${result.modifiedCount} orders to 'delivered' status`);

    // Now test revenue calculation
    const revenueResult = await Order.aggregate([
      {
        $match: {
          $or: [
            { paymentStatus: 'paid' },
            { orderStatus: 'delivered' }
          ]
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]);

    const revenue = revenueResult[0] || { total: 0, count: 0 };

    console.log('\n💰 Revenue Calculation:');
    console.log(`  Orders counted: ${revenue.count}`);
    console.log(`  Total Revenue: ₹${revenue.total}`);

    await mongoose.connection.close();
    console.log('\n✅ Done! Refresh your admin dashboard to see the updated data.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateOrdersAndTest();
