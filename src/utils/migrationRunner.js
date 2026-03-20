const mongoose = require('mongoose');
const logger = require('./logger');

// Track which migrations have run using a MongoDB collection
const migrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  executedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
  details: { type: String }
});

const Migration = mongoose.model('Migration', migrationSchema);

async function runMigrations() {
  const migrations = [
    {
      name: 'migrate-category-to-objectid',
      run: require('../scripts/migrateCategoryToObjectId').migrate
    }
  ];

  for (const migration of migrations) {
    const existing = await Migration.findOne({ name: migration.name, status: 'completed' });
    if (existing) {
      logger.info(`Migration "${migration.name}" already completed at ${existing.executedAt.toISOString()}, skipping.`);
      continue;
    }

    logger.info(`Running migration: ${migration.name}...`);
    try {
      await migration.run();
      await Migration.create({ name: migration.name, status: 'completed' });
      logger.info(`Migration "${migration.name}" completed successfully.`);
    } catch (error) {
      logger.error(`Migration "${migration.name}" failed:`, { error: error.message });
      await Migration.create({ name: migration.name, status: 'failed', details: error.message });
      // Don't throw - let server start even if migration fails
    }
  }
}

module.exports = { runMigrations, Migration };
