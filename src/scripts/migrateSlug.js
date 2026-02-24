/**
 * One-time migration script to generate slugs for all existing products and distributors.
 * Run: node src/scripts/migrateSlug.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const slugify = require('slugify');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

// Import models after connection setup
const Product = require('../models/Product');
const Distributor = require('../models/Distributor');

async function generateUniqueSlug(baseSlug, Model, excludeId) {
  let slug = baseSlug;
  let counter = 1;
  while (await Model.findOne({ slug, _id: { $ne: excludeId } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

async function migrateProducts() {
  const products = await Product.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
  console.log(`Found ${products.length} products without slugs`);

  let migrated = 0;
  for (const product of products) {
    const baseSlug = slugify(product.name, { lower: true, strict: true });
    const slug = await generateUniqueSlug(baseSlug, Product, product._id);

    await Product.updateOne({ _id: product._id }, { $set: { slug } });
    migrated++;

    if (migrated % 50 === 0) {
      console.log(`  Migrated ${migrated}/${products.length} products...`);
    }
  }

  console.log(`Migrated ${migrated} products with slugs`);
}

async function migrateDistributors() {
  const distributors = await Distributor.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
  console.log(`Found ${distributors.length} distributors without slugs`);

  let migrated = 0;
  for (const distributor of distributors) {
    const cityPart = distributor.city ? `-${distributor.city}` : '';
    const baseSlug = slugify(`${distributor.businessName}${cityPart}`, { lower: true, strict: true });
    const slug = await generateUniqueSlug(baseSlug, Distributor, distributor._id);

    await Distributor.updateOne({ _id: distributor._id }, { $set: { slug } });
    migrated++;

    if (migrated % 50 === 0) {
      console.log(`  Migrated ${migrated}/${distributors.length} distributors...`);
    }
  }

  console.log(`Migrated ${migrated} distributors with slugs`);
}

async function main() {
  await connectDB();

  console.log('\n--- Migrating Product Slugs ---');
  await migrateProducts();

  console.log('\n--- Migrating Distributor Slugs ---');
  await migrateDistributors();

  console.log('\nMigration complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
