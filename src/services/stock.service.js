const Product = require('../models/Product');

/**
 * Bulk update stock for multiple products
 * @param {Array<{productId: string, quantity: number}>} items
 * @param {'increment' | 'decrement'} operation
 */
async function bulkUpdateStock(items, operation = 'decrement') {
  const multiplier = operation === 'increment' ? 1 : -1;

  const bulkOps = items.map(item => ({
    updateOne: {
      filter: { _id: typeof item.product === 'object' ? item.product._id : item.product },
      update: { $inc: { stock: item.quantity * multiplier } }
    }
  }));

  if (bulkOps.length > 0) {
    return await Product.bulkWrite(bulkOps);
  }
}

module.exports = { bulkUpdateStock };
