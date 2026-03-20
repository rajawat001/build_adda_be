const mongoose = require('mongoose');
const slugify = require('slugify');

// Helper: resolve a category value (name string, slug, or ObjectId) to a Category ObjectId.
// Returns the ObjectId if found, or the original value if it's already an ObjectId.
async function resolveCategoryToObjectId(value) {
  if (!value) return value;
  // Already an ObjectId instance
  if (value instanceof mongoose.Types.ObjectId) return value;
  // Valid 24-hex ObjectId string — assume it's an ObjectId
  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  // Otherwise treat as category name or slug — look it up
  if (typeof value === 'string') {
    const Category = mongoose.model('Category');
    const category = await Category.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } },
        { slug: value.toLowerCase() }
      ]
    });
    if (category) return category._id;
    // If not found, throw a meaningful error
    throw new Error(`Category "${value}" not found. Please create it first or use a valid Category ObjectId.`);
  }
  return value;
}

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  realPrice: {
    type: Number,
    min: 0,
    validate: {
      validator: function(value) {
        if (value == null) return true;
        return value >= this.price;
      },
      message: 'Real price (MRP) must be greater than or equal to selling price'
    }
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  image: {
    type: String,
    default: ''
  },
  images: {
    type: [String],
    default: [],
    validate: {
      validator: function(v) { return v.length <= 10; },
      message: 'Maximum 10 images allowed'
    }
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  unit: {
    type: String,
    required: true,
    default: 'unit'
  },
  unitType: {
    type: String,
    enum: ['kg', 'g', 'L', 'mL', 'ton', 'piece', 'bag', 'box', 'sqft', 'sqm', 'bundle', 'set', 'meter', 'feet', 'unit'],
    default: 'unit'
  },
  brand: { type: String, trim: true, default: '' },
  manufacturer: { type: String, trim: true, default: '' },
  origin: { type: String, trim: true, default: '' },
  material: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '' },
  weight: { type: String, trim: true, default: '' },
  warranty: { type: String, trim: true, default: '' },
  hsnCode: { type: String, trim: true, default: '' },
  dimensions: {
    length: { type: String, default: '' },
    width: { type: String, default: '' },
    height: { type: String, default: '' },
    dimensionUnit: { type: String, enum: ['mm', 'cm', 'inch', 'feet', 'm', ''], default: '' }
  },
  specifications: [{
    key: { type: String, required: true },
    value: { type: String, required: true }
  }],
  distributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor',
    required: true
  },
  minQuantity: {
    type: Number,
    default: 1,
    min: 1
  },
  maxQuantity: {
    type: Number,
    default: null,
    min: 1,
    validate: {
      validator: function(value) {
        if (value === null || value === undefined) return true;
        return value >= this.minQuantity;
      },
      message: 'Max quantity must be greater than or equal to min quantity'
    }
  },
  acceptedPaymentMethods: {
    type: [String],
    enum: ['COD', 'Online'],
    default: ['COD', 'Online'],
    validate: {
      validator: function(value) {
        return value && value.length > 0;
      },
      message: 'At least one payment method must be selected'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Pre-validate hook: resolve category name/slug strings to ObjectId for backward compatibility
productSchema.pre('validate', async function(next) {
  if (this.isModified('category') && this.category) {
    try {
      this.category = await resolveCategoryToObjectId(this.category);
    } catch (err) {
      return next(err);
    }
  }
  next();
});

productSchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });

    // Ensure uniqueness by checking DB and appending counter
    let slug = baseSlug;
    let counter = 1;
    while (await mongoose.model('Product').findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    this.slug = slug;
  }
  next();
});

// slug already indexed via unique:true/index:true in schema
productSchema.index({ category: 1 });
productSchema.index({ distributor: 1 });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ brand: 1 });
productSchema.index({ manufacturer: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ price: 1 });
productSchema.index({ distributor: 1, isActive: 1, createdAt: -1 });
// slug index already defined via unique:true in schema field
productSchema.index({ category: 1, isActive: 1 });

const Product = mongoose.model('Product', productSchema);

// Export both the model and the helper for use in controllers
Product.resolveCategoryToObjectId = resolveCategoryToObjectId;

module.exports = Product;