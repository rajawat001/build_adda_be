const Role = require('../models/Role');
const User = require('../models/User');
const Distributor = require('../models/Distributor');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

// Helper: Map a Role name to its matching User.role string(s)
// User.role is an enum: 'user' | 'admin' | 'distributor'
const getRoleUserMapping = (roleName) => {
  const lower = roleName.toLowerCase();
  if (lower === 'super admin' || lower === 'admin') return ['admin'];
  if (lower === 'user' || lower === 'customer') return ['user'];
  if (lower === 'distributor') return ['distributor'];
  // Manager, Support, and custom roles — no direct User.role mapping
  return [];
};

// Helper: Seed default roles — creates missing system roles
const seedDefaultRoles = async () => {
  const defaults = Role.getDefaultRoles();
  for (const defaultRole of defaults) {
    const exists = await Role.findOne({ name: defaultRole.name });
    if (!exists) {
      await Role.create(defaultRole);
    }
  }
};

// @desc    Get all roles
// @route   GET /api/admin/roles
// @access  Private (Admin only)
exports.getAllRoles = asyncHandler(async (req, res) => {
  // Auto-seed default roles on first access
  await seedDefaultRoles();

  const roles = await Role.find().sort({ isSystem: -1, createdAt: -1 });

  // Get user counts — batch query for performance
  const [adminCount, userCount, distributorCount] = await Promise.all([
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ role: 'user' }),
    Distributor.countDocuments()
  ]);

  const countMap = { admin: adminCount, user: userCount, distributor: distributorCount };

  const rolesWithCounts = roles.map((role) => {
    const mappedRoles = getRoleUserMapping(role.name);
    const total = mappedRoles.reduce((sum, r) => sum + (countMap[r] || 0), 0);
    return {
      ...role.toObject(),
      userCount: total
    };
  });

  res.json({
    success: true,
    roles: rolesWithCounts,
    count: rolesWithCounts.length
  });
});

// @desc    Get single role by ID
// @route   GET /api/admin/roles/:id
// @access  Private (Admin only)
exports.getRoleById = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);

  if (!role) {
    throw new NotFoundError('Role not found');
  }

  const mappedRoles = getRoleUserMapping(role.name);
  let userCount = 0;
  for (const r of mappedRoles) {
    if (r === 'distributor') {
      userCount += await Distributor.countDocuments();
    } else {
      userCount += await User.countDocuments({ role: r });
    }
  }

  res.json({
    success: true,
    role: {
      ...role.toObject(),
      userCount
    }
  });
});

// @desc    Create new role
// @route   POST /api/admin/roles
// @access  Private (Admin only)
exports.createRole = asyncHandler(async (req, res) => {
  const { name, description, permissions, isActive } = req.body;

  if (!name || !name.trim()) {
    throw new ValidationError('Role name is required');
  }

  const existingRole = await Role.findOne({ name: name.trim() });
  if (existingRole) {
    throw new ConflictError('Role with this name already exists');
  }

  const role = await Role.create({
    name: name.trim(),
    description: description || '',
    permissions: permissions || [],
    isActive: isActive !== undefined ? isActive : true,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    message: 'Role created successfully',
    role
  });
});

// @desc    Update role
// @route   PUT /api/admin/roles/:id
// @access  Private (Admin only)
exports.updateRole = asyncHandler(async (req, res) => {
  const { name, description, permissions, isActive } = req.body;

  const role = await Role.findById(req.params.id);

  if (!role) {
    throw new NotFoundError('Role not found');
  }

  // Check name uniqueness if changing
  if (name && name.trim() !== role.name) {
    const existingRole = await Role.findOne({ name: name.trim() });
    if (existingRole) {
      throw new ConflictError('Role with this name already exists');
    }
    role.name = name.trim();
  }

  if (description !== undefined) role.description = description;
  if (permissions !== undefined) role.permissions = permissions;
  if (isActive !== undefined) role.isActive = isActive;

  await role.save();

  res.json({
    success: true,
    message: 'Role updated successfully',
    role
  });
});

// @desc    Delete role
// @route   DELETE /api/admin/roles/:id
// @access  Private (Admin only)
exports.deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);

  if (!role) {
    throw new NotFoundError('Role not found');
  }

  if (role.isSystem) {
    throw new ValidationError('Cannot delete system role');
  }

  // Check if role name maps to any users
  const mappedRoles = getRoleUserMapping(role.name);
  let userCount = 0;
  for (const r of mappedRoles) {
    if (r === 'distributor') {
      userCount += await Distributor.countDocuments();
    } else {
      userCount += await User.countDocuments({ role: r });
    }
  }

  if (userCount > 0) {
    throw new ValidationError(
      `Cannot delete role with ${userCount} assigned user(s). Please reassign users first.`
    );
  }

  await role.deleteOne();

  res.json({
    success: true,
    message: 'Role deleted successfully'
  });
});

// @desc    Get role statistics
// @route   GET /api/admin/roles/stats
// @access  Private (Admin only)
exports.getRoleStats = asyncHandler(async (req, res) => {
  // Auto-seed default roles on first access
  await seedDefaultRoles();

  const [totalRoles, activeRoles, totalAdmins, totalUsers, totalDistributors] = await Promise.all([
    Role.countDocuments(),
    Role.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ role: 'user' }),
    Distributor.countDocuments()
  ]);

  res.json({
    success: true,
    stats: {
      total: totalRoles,
      active: activeRoles,
      totalUsers: totalAdmins + totalUsers + totalDistributors
    }
  });
});

// @desc    Assign a role to an admin user
// @route   PUT /api/admin/users/:userId/assign-role
// @access  Private (Admin only)
exports.assignRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { roleId } = req.body;

  if (!roleId) {
    throw new ValidationError('roleId is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.role !== 'admin') {
    throw new ValidationError('Roles can only be assigned to admin users');
  }

  const role = await Role.findById(roleId);
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  user.assignedRole = roleId;
  await user.save();

  res.json({
    success: true,
    message: `Role "${role.name}" assigned to user "${user.name}" successfully`,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      assignedRole: role
    }
  });
});

// @desc    Check if user has permission
// @route   POST /api/admin/roles/check-permission
// @access  Private (Admin only)
exports.checkPermission = asyncHandler(async (req, res) => {
  const { userId, permission } = req.body;

  if (!userId || !permission) {
    throw new ValidationError('userId and permission are required');
  }

  // Since User.role is a string, find Role by matching name
  const user = await User.findById(userId).select('role');

  if (!user) {
    return res.json({ success: true, hasPermission: false });
  }

  // Find a role that maps to this user's role string
  const roles = await Role.find({ isActive: true });
  const matchingRole = roles.find((r) => {
    const mapped = getRoleUserMapping(r.name);
    return mapped.includes(user.role);
  });

  if (!matchingRole) {
    return res.json({ success: true, hasPermission: false });
  }

  const hasPermission = matchingRole.hasPermission(permission);

  res.json({ success: true, hasPermission });
});
