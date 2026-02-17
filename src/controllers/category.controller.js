const Category = require('../models/Category');
const Product = require('../models/Product');

// @desc    Get all categories
// @route   GET /api/admin/categories
// @access  Private/Admin
exports.getAllCategories = async (req, res) => {
  try {
    const { includeInactive, parentId } = req.query;

    const filter = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }
    if (parentId) {
      filter.parent = parentId === 'null' ? null : parentId;
    }

    const categories = await Category.find(filter)
      .populate('parent', 'name slug')
      .sort({ order: 1, name: 1 })
      .lean();

    // Get product counts in a single aggregation instead of N separate queries
    const productCounts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(productCounts.map(c => [c._id, c.count]));

    const categoriesWithCounts = categories.map(category => ({
      ...category,
      productCount: countMap.get(category.name) || 0
    }));

    res.json({
      success: true,
      categories: categoriesWithCounts,
      count: categoriesWithCounts.length
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

// @desc    Get category tree (hierarchical)
// @route   GET /api/admin/categories/tree
// @access  Private/Admin
exports.getCategoryTree = async (req, res) => {
  try {
    const { includeInactive } = req.query;

    const filter = includeInactive === 'true' ? {} : { isActive: true };
    const categories = await Category.find(filter).sort({ order: 1, name: 1 }).lean();

    // Build tree structure
    const buildTree = (parentId = null) => {
      return categories
        .filter(cat => {
          if (parentId === null) {
            return !cat.parent;
          }
          return cat.parent && cat.parent.toString() === parentId.toString();
        })
        .map(cat => ({
          ...cat,
          children: buildTree(cat._id)
        }));
    };

    const tree = buildTree();

    res.json({
      success: true,
      tree,
      count: tree.length
    });
  } catch (error) {
    console.error('Get category tree error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category tree',
      error: error.message
    });
  }
};

// @desc    Get single category by ID
// @route   GET /api/admin/categories/:id
// @access  Private/Admin
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name slug')
      .populate('children');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Get product count (Product.category is a String enum, not ObjectId)
    const productCount = await Product.countDocuments({ category: category.name });

    // Get category path
    const path = await category.getPath();

    res.json({
      success: true,
      category: {
        ...category.toObject(),
        productCount,
        path
      }
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category',
      error: error.message
    });
  }
};

// @desc    Create new category
// @route   POST /api/admin/categories
// @access  Private/Admin
exports.createCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      image,
      parent,
      isActive,
      order,
      metaTitle,
      metaDescription
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    // Check if category with same name already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    // Validate parent category if provided
    if (parent) {
      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(404).json({
          success: false,
          message: 'Parent category not found'
        });
      }
    }

    // Create category
    const category = await Category.create({
      name,
      description,
      icon,
      image,
      parent: parent || null,
      isActive: isActive !== undefined ? isActive : true,
      order: order || 0,
      metaTitle: metaTitle || name,
      metaDescription: metaDescription || description
    });

    await category.populate('parent', 'name slug');

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message
    });
  }
};

// @desc    Update category
// @route   PUT /api/admin/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      image,
      parent,
      isActive,
      order,
      metaTitle,
      metaDescription
    } = req.body;

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if updating name and if it conflicts with existing category
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }
    }

    // Validate parent category if provided
    if (parent) {
      // Check if trying to set self as parent
      if (parent === req.params.id) {
        return res.status(400).json({
          success: false,
          message: 'Category cannot be its own parent'
        });
      }

      // Check if parent exists
      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(404).json({
          success: false,
          message: 'Parent category not found'
        });
      }

      // Check if trying to create circular reference
      const descendants = await category.children;
      const isCircular = descendants.some(child => child._id.toString() === parent);
      if (isCircular) {
        return res.status(400).json({
          success: false,
          message: 'Cannot set a descendant category as parent (circular reference)'
        });
      }
    }

    // Update fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (icon !== undefined) category.icon = icon;
    if (image !== undefined) category.image = image;
    if (parent !== undefined) category.parent = parent || null;
    if (isActive !== undefined) category.isActive = isActive;
    if (order !== undefined) category.order = order;
    if (metaTitle !== undefined) category.metaTitle = metaTitle;
    if (metaDescription !== undefined) category.metaDescription = metaDescription;

    await category.save();
    await category.populate('parent', 'name slug');

    res.json({
      success: true,
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: error.message
    });
  }
};

// @desc    Delete category
// @route   DELETE /api/admin/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has products (Product.category is a String enum, not ObjectId)
    const productCount = await Product.countDocuments({ category: category.name });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category with ${productCount} product(s). Please reassign or delete products first.`
      });
    }

    // Check if category has children
    const childrenCount = await Category.countDocuments({ parent: category._id });
    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category with ${childrenCount} subcategory(ies). Please delete or reassign subcategories first.`
      });
    }

    await category.deleteOne();

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message
    });
  }
};

// @desc    Reorder categories
// @route   PUT /api/admin/categories/reorder
// @access  Private/Admin
exports.reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body;

    if (!Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        message: 'Categories must be an array'
      });
    }

    // Update order for each category
    const updatePromises = categories.map((cat, index) => {
      return Category.findByIdAndUpdate(
        cat._id,
        { order: index },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Categories reordered successfully'
    });
  } catch (error) {
    console.error('Reorder categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder categories',
      error: error.message
    });
  }
};

// @desc    Get category statistics
// @route   GET /api/admin/categories/stats
// @access  Private/Admin
exports.getCategoryStats = async (req, res) => {
  try {
    const totalCategories = await Category.countDocuments();
    const activeCategories = await Category.countDocuments({ isActive: true });
    const inactiveCategories = await Category.countDocuments({ isActive: false });
    const rootCategories = await Category.countDocuments({ parent: null });

    // Get top categories by product count in a single aggregation
    const allCategories = await Category.find().lean();
    const productCounts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(productCounts.map(c => [c._id, c.count]));

    const topCategories = allCategories
      .map(category => ({
        _id: category._id,
        name: category.name,
        productCount: countMap.get(category.name) || 0
      }))
      .sort((a, b) => b.productCount - a.productCount)
      .slice(0, 5);

    res.json({
      success: true,
      stats: {
        total: totalCategories,
        active: activeCategories,
        inactive: inactiveCategories,
        root: rootCategories,
        topCategories
      }
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category statistics',
      error: error.message
    });
  }
};
