/**
 * Slug migration for products and distributors.
 *
 * Can be used in two ways:
 * 1. Auto-run on server startup: require('./scripts/migrateSlug').runSlugMigration()
 * 2. Manual standalone:          node src/scripts/migrateSlug.js
 *
 * Idempotent — only migrates documents that don't have a slug yet.
 * Safe to run multiple times; after the first run it becomes a no-op.
 */
const slugify = require('slugify');

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

  if (products.length === 0) return 0;

  console.log(`[Slug Migration] Found ${products.length} products without slugs`);

  let migrated = 0;
  for (const product of products) {
    const baseSlug = slugify(product.name, { lower: true, strict: true });
    const slug = await generateUniqueSlug(baseSlug, Product, product._id);

    await Product.updateOne({ _id: product._id }, { $set: { slug } });
    migrated++;

    if (migrated % 50 === 0) {
      console.log(`[Slug Migration]   Products: ${migrated}/${products.length}...`);
    }
  }

  console.log(`[Slug Migration] Migrated ${migrated} products`);
  return migrated;
}

async function migrateDistributors() {
  const distributors = await Distributor.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });

  if (distributors.length === 0) return 0;

  console.log(`[Slug Migration] Found ${distributors.length} distributors without slugs`);

  let migrated = 0;
  for (const distributor of distributors) {
    const cityPart = distributor.city ? `-${distributor.city}` : '';
    const baseSlug = slugify(`${distributor.businessName}${cityPart}`, { lower: true, strict: true });
    const slug = await generateUniqueSlug(baseSlug, Distributor, distributor._id);

    await Distributor.updateOne({ _id: distributor._id }, { $set: { slug } });
    migrated++;

    if (migrated % 50 === 0) {
      console.log(`[Slug Migration]   Distributors: ${migrated}/${distributors.length}...`);
    }
  }

  console.log(`[Slug Migration] Migrated ${migrated} distributors`);
  return migrated;
}

/**
 * Run slug migration. Safe to call on every server startup.
 * Skips silently if all documents already have slugs.
 */
async function runSlugMigration() {
  try {
    const productCount = await migrateProducts();
    const distributorCount = await migrateDistributors();

    if (productCount > 0 || distributorCount > 0) {
      console.log(`[Slug Migration] Complete — ${productCount} products, ${distributorCount} distributors`);
    } else {
      console.log('[Slug Migration] All documents already have slugs, nothing to do');
    }
  } catch (error) {
    // Log error but don't crash the server
    console.error('[Slug Migration] Error:', error.message);
  }
}

module.exports = { runSlugMigration };

// Allow standalone execution: node src/scripts/migrateSlug.js
if (require.main === module) {
  require('dotenv').config();
  const mongoose = require('mongoose');

  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('MongoDB Connected');
      return runSlugMigration();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
