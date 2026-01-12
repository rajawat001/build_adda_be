const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },

  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product is required']
  },

  distributor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Distributor'
  },

  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },

  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },

  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },

  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    trim: true,
    minlength: [10, 'Comment must be at least 10 characters'],
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },

  images: [{
    type: String
  }],

  isApproved: {
    type: Boolean,
    default: false
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  approvedAt: {
    type: Date
  },

  isRejected: {
    type: Boolean,
    default: false
  },

  rejectionReason: {
    type: String
  },

  isFlagged: {
    type: Boolean,
    default: false
  },

  flagReason: {
    type: String,
    enum: ['spam', 'inappropriate', 'fake', 'offensive', 'other']
  },

  flaggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  adminReply: {
    comment: String,
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    repliedAt: Date
  },

  helpful: {
    type: Number,
    default: 0
  },

  notHelpful: {
    type: Number,
    default: 0
  },

  verified: {
    type: Boolean,
    default: false // True if user purchased the product
  }
}, {
  timestamps: true
});

// Compound index to ensure one review per user per product
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

// Indexes for queries
reviewSchema.index({ product: 1, isApproved: 1 });
reviewSchema.index({ distributor: 1, isApproved: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ isApproved: 1, createdAt: -1 });
reviewSchema.index({ isFlagged: 1 });

// Virtual for status
reviewSchema.virtual('status').get(function() {
  if (this.isRejected) return 'rejected';
  if (this.isApproved) return 'approved';
  if (this.isFlagged) return 'flagged';
  return 'pending';
});

// Method to approve review
reviewSchema.methods.approve = async function(adminId) {
  this.isApproved = true;
  this.isRejected = false;
  this.approvedBy = adminId;
  this.approvedAt = new Date();
  await this.save();
};

// Method to reject review
reviewSchema.methods.reject = async function(reason) {
  this.isApproved = false;
  this.isRejected = true;
  this.rejectionReason = reason;
  await this.save();
};

// Method to flag review
reviewSchema.methods.flag = async function(reason, userId) {
  this.isFlagged = true;
  this.flagReason = reason;
  this.flaggedBy = userId;
  await this.save();
};

// Method to add admin reply
reviewSchema.methods.addAdminReply = async function(comment, adminId) {
  this.adminReply = {
    comment,
    repliedBy: adminId,
    repliedAt: new Date()
  };
  await this.save();
};

// Static method to get average rating for a product
reviewSchema.statics.getAverageRating = async function(productId) {
  const result = await this.aggregate([
    {
      $match: {
        product: mongoose.Types.ObjectId(productId),
        isApproved: true
      }
    },
    {
      $group: {
        _id: '$product',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        ratingDistribution: {
          $push: '$rating'
        }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }

  const data = result[0];
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  data.ratingDistribution.forEach(rating => {
    distribution[rating] = (distribution[rating] || 0) + 1;
  });

  return {
    averageRating: Math.round(data.averageRating * 10) / 10,
    totalReviews: data.totalReviews,
    ratingDistribution: distribution
  };
};

// Static method to get distributor rating
reviewSchema.statics.getDistributorRating = async function(distributorId) {
  const result = await this.aggregate([
    {
      $match: {
        distributor: mongoose.Types.ObjectId(distributorId),
        isApproved: true
      }
    },
    {
      $group: {
        _id: '$distributor',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (result.length === 0) {
    return { averageRating: 0, totalReviews: 0 };
  }

  return {
    averageRating: Math.round(result[0].averageRating * 10) / 10,
    totalReviews: result[0].totalReviews
  };
};

// Pre-save middleware to set distributor from product
reviewSchema.pre('save', async function(next) {
  if (this.isNew && !this.distributor) {
    const Product = mongoose.model('Product');
    const product = await Product.findById(this.product).select('distributor');
    if (product) {
      this.distributor = product.distributor;
    }
  }
  next();
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
