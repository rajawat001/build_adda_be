/**
 * Migration Script: Product category from String enum to ObjectId reference
 *
 * This script:
 * 1. Reads all existing categories from the Category collection
 * 2. Creates a map of category name -> ObjectId
 * 3. For any category names in products that don't exist in Category collection, creates them
 * 4. Updates all products: replaces the string category with the matching Category ObjectId
 * 5. Logs progress and results
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage (standalone): node src/scripts/migrateCategoryToObjectId.js
 * Usage (programmatic): const { migrate } = require('./migrateCategoryToObjectId'); await migrate();
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Core migration logic — assumes DB connection is already established
async function migrate() {
  console.log('=== Category Migration: String -> ObjectId ===\n');

  const db = mongoose.connection.db;
  const productsCollection = db.collection('products');
  const categoriesCollection = db.collection('categories');

  // Step 1: Load all existing categories
  const existingCategories = await categoriesCollection.find({}).toArray();
  console.log(`Found ${existingCategories.length} existing categories.`);

  // Build name -> ObjectId map (case-insensitive)
  const categoryMap = new Map();
  for (const cat of existingCategories) {
    categoryMap.set(cat.name.toLowerCase(), cat._id);
  }

  // Step 2: Find all products that still have a string category
  const productsWithStringCategory = await productsCollection.find({
    category: { $type: 'string' }
  }).toArray();

  console.log(`Found ${productsWithStringCategory.length} products with string category values.\n`);

  if (productsWithStringCategory.length === 0) {
    console.log('No products need migration. All categories are already ObjectId references.');
    return;
  }

  // Step 3: Collect unique category names from products that might not exist yet
  const uniqueCategoryNames = new Set();
  for (const product of productsWithStringCategory) {
    if (typeof product.category === 'string') {
      uniqueCategoryNames.add(product.category);
    }
  }

  console.log(`Unique category names found in products: ${[...uniqueCategoryNames].join(', ')}`);

  // Step 4: Create any missing categories
  let createdCount = 0;
  for (const name of uniqueCategoryNames) {
    if (!categoryMap.has(name.toLowerCase())) {
      console.log(`  Creating missing category: "${name}"`);
      const slugify = require('slugify');
      const slug = slugify(name, { lower: true, strict: true });
      const result = await categoriesCollection.insertOne({
        name,
        slug,
        icon: '📦',
        isActive: true,
        order: 99,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      categoryMap.set(name.toLowerCase(), result.insertedId);
      createdCount++;
    }
  }

  if (createdCount > 0) {
    console.log(`\nCreated ${createdCount} new categories.\n`);
  }

  // Step 5: Update products — replace string category with ObjectId
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const product of productsWithStringCategory) {
    const categoryName = product.category;
    const categoryId = categoryMap.get(categoryName.toLowerCase());

    if (!categoryId) {
      console.error(`  ERROR: Could not resolve category "${categoryName}" for product ${product._id} ("${product.name}"). Skipping.`);
      errorCount++;
      continue;
    }

    try {
      const result = await productsCollection.updateOne(
        { _id: product._id, category: { $type: 'string' } },
        { $set: { category: categoryId } }
      );

      if (result.modifiedCount > 0) {
        updatedCount++;
      } else {
        skippedCount++;
      }
    } catch (err) {
      console.error(`  ERROR updating product ${product._id} ("${product.name}"): ${err.message}`);
      errorCount++;
    }

    // Log progress every 100 products
    if ((updatedCount + skippedCount + errorCount) % 100 === 0) {
      console.log(`  Progress: ${updatedCount + skippedCount + errorCount} / ${productsWithStringCategory.length}`);
    }
  }

  // Summary
  console.log('\n=== Migration Summary ===');
  console.log(`Total products with string categories: ${productsWithStringCategory.length}`);
  console.log(`Successfully migrated: ${updatedCount}`);
  console.log(`Already migrated (skipped): ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`New categories created: ${createdCount}`);

  // Verify
  const remainingStringCategories = await productsCollection.countDocuments({
    category: { $type: 'string' }
  });
  console.log(`\nRemaining products with string categories: ${remainingStringCategories}`);

  if (remainingStringCategories === 0) {
    console.log('Migration completed successfully!');
  } else {
    console.log('WARNING: Some products still have string categories. Please investigate.');
  }
}

// Standalone mode: when run directly via `node src/scripts/migrateCategoryToObjectId.js`
if (require.main === module) {
  (async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('ERROR: MONGODB_URI environment variable is not set.');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB.\n');

    try {
      await migrate();
    } catch (err) {
      console.error('Migration failed:', err);
    } finally {
      await mongoose.disconnect();
      console.log('\nDisconnected from MongoDB. Done.');
    }
  })().catch(err => {
    console.error('Migration failed:', err);
    mongoose.disconnect().then(() => process.exit(1));
  });
}

module.exports = { migrate };
