const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
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
  category: {
    type: String,
    required: true,
    enum: ['Cement', 'Steel', 'Bricks', 'Sand', 'Paint', 'Tiles', 'Other']
  },
  image: {
    type: String,
    default: ''
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

productSchema.index({ category: 1 });
productSchema.index({ distributor: 1 });
productSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Product', productSchema);