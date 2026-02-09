const User = require('../models/User');
const Distributor = require('../models/Distributor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Invoice = require('../models/Invoice');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { Parser } = require('json2csv');
const multer = require('multer');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

// Map collection names to models
const collectionModels = {
  users: User,
  distributors: Distributor,
  products: Product,
  orders: Order,
  reviews: Review,
  invoices: Invoice,
  transactions: Transaction,
  settings: Settings
};

// Fields to exclude from exports (sensitive data)
const excludedFields = {
  users: ['password', '__v'],
  distributors: ['password', '__v'],
  products: ['__v'],
  orders: ['__v'],
  reviews: ['__v'],
  invoices: ['__v'],
  transactions: ['__v'],
  settings: ['__v', 'smtpPassword', 'phonepeSaltKey', 'smsApiKey']
};

/**
 * Get record counts for all collections
 * GET /api/admin/export/stats
 */
const getExportStats = async (req, res) => {
  try {
    const [users, distributors, products, orders, reviews, invoices, transactions, settings] = await Promise.all([
      User.countDocuments(),
      Distributor.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Review.countDocuments(),
      Invoice.countDocuments(),
      Transaction.countDocuments(),
      Settings.countDocuments()
    ]);

    res.json({
      success: true,
      stats: {
        users,
        distributors,
        products,
        orders,
        reviews,
        invoices,
        transactions,
        settings
      }
    });
  } catch (error) {
    console.error('Export stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch export stats' });
  }
};

/**
 * Export a single collection as CSV or JSON
 * GET /api/admin/export/:collection?format=csv|json
 */
const exportCollection = async (req, res) => {
  try {
    const { collection } = req.params;
    const format = req.query.format || 'csv';

    const Model = collectionModels[collection];
    if (!Model) {
      return res.status(400).json({ success: false, message: `Invalid collection: ${collection}` });
    }

    const excluded = excludedFields[collection] || ['__v'];
    const excludeProjection = excluded.reduce((acc, field) => {
      acc[field] = 0;
      return acc;
    }, {});

    const data = await Model.find({}, excludeProjection).lean();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${collection}_${new Date().toISOString().split('T')[0]}.json"`);
      return res.json(data);
    }

    // CSV format
    if (data.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${collection}_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send('No data found');
    }

    // Flatten nested objects for CSV
    const flattenedData = data.map(item => flattenObject(item));

    const parser = new Parser({ flatten: true });
    const csv = parser.parse(flattenedData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${collection}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export collection error:', error);
    res.status(500).json({ success: false, message: 'Failed to export collection' });
  }
};

/**
 * Export all collections as a single JSON backup
 * GET /api/admin/export-all
 */
const exportAll = async (req, res) => {
  try {
    const allData = {};

    for (const [name, Model] of Object.entries(collectionModels)) {
      const excluded = excludedFields[name] || ['__v'];
      const excludeProjection = excluded.reduce((acc, field) => {
        acc[field] = 0;
        return acc;
      }, {});

      allData[name] = await Model.find({}, excludeProjection).lean();
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      platform: 'BuildAdda',
      version: '1.0.0',
      collections: allData
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="buildadda_backup_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Export all error:', error);
    res.status(500).json({ success: false, message: 'Failed to export all data' });
  }
};

/**
 * Import CSV data into a collection
 * POST /api/admin/import/:collection
 */
const importCollection = async (req, res) => {
  try {
    const { collection } = req.params;

    const Model = collectionModels[collection];
    if (!Model) {
      return res.status(400).json({ success: false, message: `Invalid collection: ${collection}` });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const records = [];
    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row) => {
          // Unflatten the CSV row back to nested objects
          const unflattened = unflattenObject(row);
          records.push(unflattened);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'CSV file is empty or has invalid format' });
    }

    let imported = 0;
    let updated = 0;
    let errors = 0;

    for (const record of records) {
      try {
        // Remove _id if it's empty or invalid, let MongoDB generate it
        if (record._id) {
          // Try to upsert by _id
          await Model.findByIdAndUpdate(record._id, record, { upsert: true, new: true, setDefaultsOnInsert: true });
          updated++;
        } else {
          delete record._id;
          await Model.create(record);
          imported++;
        }
      } catch (err) {
        errors++;
        console.error(`Import record error:`, err.message);
      }
    }

    res.json({
      success: true,
      message: `Import completed for ${collection}`,
      imported,
      updated,
      errors,
      total: records.length
    });
  } catch (error) {
    console.error('Import collection error:', error);
    res.status(500).json({ success: false, message: 'Failed to import collection' });
  }
};

// Helper: Flatten nested objects for CSV export
function flattenObject(obj, prefix = '') {
  const result = {};

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;

    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value._bsontype)) {
      Object.assign(result, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      result[newKey] = JSON.stringify(value);
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

// Helper: Unflatten dotted keys back to nested objects
function unflattenObject(obj) {
  const result = {};

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;

    const keys = key.split('.');
    let current = result;

    for (let i = 0; i < keys.length; i++) {
      if (i === keys.length - 1) {
        // Try to parse JSON arrays
        let value = obj[key];
        if (typeof value === 'string' && value.startsWith('[')) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            // Keep as string
          }
        }
        current[keys[i]] = value;
      } else {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
    }
  }

  return result;
}

/**
 * Import all collections from a JSON backup file
 * POST /api/admin/import/all
 */
const importAll = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    let backupData;
    try {
      backupData = JSON.parse(req.file.buffer.toString());
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid JSON file' });
    }

    const collections = backupData.collections || backupData;
    if (!collections || typeof collections !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid backup format. Expected { collections: { ... } } or { collectionName: [...] }' });
    }

    const results = {};
    let totalImported = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    for (const [name, records] of Object.entries(collections)) {
      const Model = collectionModels[name];
      if (!Model || !Array.isArray(records)) {
        results[name] = { skipped: true, reason: !Model ? 'Unknown collection' : 'Invalid data format' };
        continue;
      }

      let imported = 0;
      let updated = 0;
      let errors = 0;

      for (const record of records) {
        try {
          if (record._id) {
            await Model.findByIdAndUpdate(record._id, record, { upsert: true, new: true, setDefaultsOnInsert: true });
            updated++;
          } else {
            delete record._id;
            await Model.create(record);
            imported++;
          }
        } catch (err) {
          errors++;
          console.error(`Import all - ${name} record error:`, err.message);
        }
      }

      results[name] = { total: records.length, imported, updated, errors };
      totalImported += imported;
      totalUpdated += updated;
      totalErrors += errors;
    }

    res.json({
      success: true,
      message: 'Full import completed',
      summary: { totalImported, totalUpdated, totalErrors },
      results
    });
  } catch (error) {
    console.error('Import all error:', error);
    res.status(500).json({ success: false, message: 'Failed to import all data' });
  }
};

module.exports = {
  getExportStats,
  exportCollection,
  exportAll,
  importCollection,
  importAll
};
