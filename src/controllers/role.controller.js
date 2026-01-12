const Role = require('../models/Role');
const User = require('../models/User');

// @desc    Get all roles
// @route   GET /api/admin/roles
// @access  Private/Admin
exports.getAllRoles = async (req, res) => {
  try {
    const { includeInactive } = req.query;

    const filter = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const roles = await Role.find(filter).sort({ createdAt: -1 });

    // Get user count for each role
    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({ role: role._id });
        return {
          ...role.toObject(),
          userCount
        };
      })
    );

    res.json({
      success: true,
      roles: rolesWithCounts,
      count: rolesWithCounts.length
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
};

// @desc    Get single role by ID
// @route   GET /api/admin/roles/:id
// @access  Private/Admin
exports.getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Get user count
    const userCount = await User.countDocuments({ role: role._id });

    res.json({
      success: true,
      role: {
        ...role.toObject(),
        userCount
      }
    });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role',
      error: error.message
    });
  }
};

// @desc    Create new role
// @route   POST /api/admin/roles
// @access  Private/Admin
exports.createRole = async (req, res) => {
  try {
    const { name, description, permissions, isActive } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Role name is required'
      });
    }

    // Check if role with same name already exists
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name already exists'
      });
    }

    // Create role
    const role = await Role.create({
      name,
      description,
      permissions: permissions || [],
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      role
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create role',
      error: error.message
    });
  }
};

// @desc    Update role
// @route   PUT /api/admin/roles/:id
// @access  Private/Admin
exports.updateRole = async (req, res) => {
  try {
    const { name, description, permissions, isActive } = req.body;

    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if updating name and if it conflicts with existing role
    if (name && name !== role.name) {
      const existingRole = await Role.findOne({ name });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role with this name already exists'
        });
      }
    }

    // Update fields
    if (name) role.name = name;
    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = permissions;
    if (isActive !== undefined) role.isActive = isActive;

    await role.save();

    res.json({
      success: true,
      message: 'Role updated successfully',
      role
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update role',
      error: error.message
    });
  }
};

// @desc    Delete role
// @route   DELETE /api/admin/roles/:id
// @access  Private/Admin
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if role is assigned to any users
    const userCount = await User.countDocuments({ role: role._id });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role with ${userCount} assigned user(s). Please reassign users first.`
      });
    }

    await role.deleteOne();

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete role',
      error: error.message
    });
  }
};

// @desc    Get role statistics
// @route   GET /api/admin/roles/stats
// @access  Private/Admin
exports.getRoleStats = async (req, res) => {
  try {
    const totalRoles = await Role.countDocuments();
    const activeRoles = await Role.countDocuments({ isActive: true });

    // Get total users with roles
    const totalUsers = await User.countDocuments({ role: { $exists: true, $ne: null } });

    res.json({
      success: true,
      stats: {
        total: totalRoles,
        active: activeRoles,
        totalUsers
      }
    });
  } catch (error) {
    console.error('Get role stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role statistics',
      error: error.message
    });
  }
};

// @desc    Check if user has permission
// @route   POST /api/admin/roles/check-permission
// @access  Private/Admin
exports.checkPermission = async (req, res) => {
  try {
    const { userId, permission } = req.body;

    const user = await User.findById(userId).populate('role');

    if (!user || !user.role) {
      return res.json({
        success: true,
        hasPermission: false
      });
    }

    const hasPermission = user.role.hasPermission(permission);

    res.json({
      success: true,
      hasPermission
    });
  } catch (error) {
    console.error('Check permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check permission',
      error: error.message
    });
  }
};
