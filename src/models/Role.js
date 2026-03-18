const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Role name cannot exceed 50 characters']
  },

  permissions: {
    type: [String],
    default: [],
    validate: {
      validator: function(permissions) {
        // Validate permission format: entity.action (e.g., users.view, products.edit)
        const validPermissions = [
          '*', // Super admin - all permissions
          'users.view', 'users.create', 'users.edit', 'users.delete',
          'distributors.view', 'distributors.approve', 'distributors.edit', 'distributors.delete',
          'products.view', 'products.edit', 'products.delete',
          'orders.view', 'orders.edit', 'orders.refund',
          'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
          'coupons.view', 'coupons.create', 'coupons.edit', 'coupons.delete',
          'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
          'settings.view', 'settings.edit',
          'reviews.view', 'reviews.approve', 'reviews.delete',
          'activityLogs.view',
          'emailTemplates.view', 'emailTemplates.edit',
          'contacts.view', 'contacts.reply', 'contacts.delete',
          'subscriptions.view', 'subscriptions.edit'
        ];

        return permissions.every(perm =>
          validPermissions.includes(perm) || perm === '*'
        );
      },
      message: 'Invalid permission format'
    }
  },

  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },

  isActive: {
    type: Boolean,
    default: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  isSystem: {
    type: Boolean,
    default: false // System roles cannot be deleted
  }
}, {
  timestamps: true
});

// Index for faster queries
// name already indexed via unique:true in schema
roleSchema.index({ isActive: 1 });

// Method to check if role has specific permission
roleSchema.methods.hasPermission = function(permission) {
  // Super admin has all permissions
  if (this.permissions.includes('*')) {
    return true;
  }

  // Check exact permission match
  if (this.permissions.includes(permission)) {
    return true;
  }

  // Check wildcard permission (e.g., users.* matches users.view, users.edit, etc.)
  const [entity] = permission.split('.');
  if (this.permissions.includes(`${entity}.*`)) {
    return true;
  }

  return false;
};

// Static method to get default roles
roleSchema.statics.getDefaultRoles = function() {
  return [
    {
      name: 'Super Admin',
      permissions: ['*'],
      description: 'Full system access with all permissions',
      isActive: true,
      isSystem: true
    },
    {
      name: 'Admin',
      permissions: [
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'distributors.view', 'distributors.approve', 'distributors.edit', 'distributors.delete',
        'products.view', 'products.edit', 'products.delete',
        'orders.view', 'orders.edit', 'orders.refund',
        'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
        'coupons.view', 'coupons.create', 'coupons.edit', 'coupons.delete',
        'reviews.view', 'reviews.approve', 'reviews.delete',
        'activityLogs.view',
        'settings.view', 'settings.edit',
        'emailTemplates.view', 'emailTemplates.edit',
        'contacts.view', 'contacts.reply', 'contacts.delete',
        'subscriptions.view', 'subscriptions.edit'
      ],
      description: 'Standard admin access — all permissions except role management',
      isActive: true,
      isSystem: true
    },
    {
      name: 'Catalog Manager',
      permissions: [
        'products.view', 'products.edit', 'products.delete',
        'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
        'reviews.view', 'reviews.approve', 'reviews.delete'
      ],
      description: 'Product and catalog management',
      isActive: true,
      isSystem: true
    },
    {
      name: 'Order Manager',
      permissions: [
        'orders.view', 'orders.edit', 'orders.refund',
        'coupons.view', 'coupons.create', 'coupons.edit', 'coupons.delete',
        'users.view'
      ],
      description: 'Order processing and coupon management',
      isActive: true,
      isSystem: true
    },
    {
      name: 'Review Manager',
      permissions: [
        'reviews.view', 'reviews.approve', 'reviews.delete',
        'products.view'
      ],
      description: 'Review moderation',
      isActive: true,
      isSystem: true
    },
    {
      name: 'Support',
      permissions: [
        'contacts.view', 'contacts.reply', 'contacts.delete',
        'users.view',
        'orders.view',
        'reviews.view'
      ],
      description: 'Customer support — view orders, users, and manage messages',
      isActive: true,
      isSystem: true
    },
    {
      name: 'View Only',
      permissions: [
        'users.view',
        'distributors.view',
        'products.view',
        'orders.view',
        'categories.view',
        'coupons.view',
        'subscriptions.view',
        'reviews.view',
        'contacts.view',
        'activityLogs.view',
        'emailTemplates.view',
        'settings.view'
      ],
      description: 'Read-only access — can view all pages but cannot edit or delete',
      isActive: true,
      isSystem: true
    }
  ];
};

// Pre-delete hook to prevent deletion of system roles
roleSchema.pre('deleteOne', { document: true, query: false }, function(next) {
  if (this.isSystem) {
    return next(new Error('Cannot delete system role'));
  }
  next();
});

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
