const authService = require('../services/auth.service');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError, AuthenticationError } = require('../utils/errors');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, location } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ValidationError('User with this email already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    phone,
    location
  });

  // Generate token
  const token = authService.generateToken(user._id, user.role);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user and explicitly select password
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Check if account is locked
  if (user.isLocked) {
    const lockTime = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
    throw new AuthenticationError(`Account is locked. Please try again in ${lockTime} minutes`);
  }

  // Check password
  const isPasswordMatch = await user.matchPassword(password);

  if (!isPasswordMatch) {
    // Increment failed login attempts
    await user.incrementLoginAttempts();
    throw new AuthenticationError('Invalid email or password');
  }

  // Check if account is active
  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  // Reset failed login attempts on successful login
  await user.resetLoginAttempts();

  // Generate token
  const token = authService.generateToken(user._id, user.role);

  // Set httpOnly cookie (SECURITY ENHANCEMENT)
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified
    }
  });
});

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = asyncHandler(async (req, res) => {
  // User is already attached by auth middleware
  const user = await User.findById(req.user._id).populate('wishlist');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    success: true,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      addresses: user.addresses,
      wishlist: user.wishlist,
      cart: user.cart,
      emailVerified: user.emailVerified,
      profileImage: user.profileImage,
      createdAt: user.createdAt
    }
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { name, phone, currentPassword, newPassword } = req.body;

  // FIX: Use _id consistently (was using .id)
  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Update basic info with validation
  if (name !== undefined) {
    if (name.trim().length < 2) {
      throw new ValidationError('Name must be at least 2 characters');
    }
    user.name = name.trim();
  }

  if (phone !== undefined) {
    // Phone validation happens in model, but double-check
    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new ValidationError('Invalid phone number format');
    }
    user.phone = phone;
  }

  // Update password if provided
  if (newPassword) {
    if (!currentPassword) {
      throw new ValidationError('Current password is required to set new password');
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Password strength validation
    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(newPassword)) {
      throw new ValidationError('Password must contain uppercase, lowercase, number, and special character');
    }

    user.password = newPassword;
    // lastPasswordChange is updated automatically in pre-save hook
  }

  await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

// @desc    Add new address
// @route   POST /api/auth/addresses
// @access  Private
const addAddress = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { fullName, phone, address, city, state, pincode, isDefault } = req.body;

  // FIX: Validate and whitelist fields (prevent mass assignment)
  const addressData = {
    fullName: fullName?.trim(),
    phone,
    address: address?.trim(),
    city: city?.trim(),
    state: state?.trim(),
    pincode,
    isDefault: isDefault || false
  };

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // If this is the first address or marked as default, make it default
  if (user.addresses.length === 0 || addressData.isDefault) {
    user.addresses.forEach(addr => addr.isDefault = false);
    addressData.isDefault = true;
  }

  user.addresses.push(addressData);
  await user.save();

  res.status(201).json({
    success: true,
    message: 'Address added successfully',
    addresses: user.addresses
  });
});

// @desc    Update address
// @route   PUT /api/auth/addresses/:addressId
// @access  Private
const updateAddress = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { addressId } = req.params;
  const { fullName, phone, address, city, state, pincode, isDefault } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const addressToUpdate = user.addresses.id(addressId);

  if (!addressToUpdate) {
    throw new NotFoundError('Address not found');
  }

  // FIX: Whitelist fields instead of Object.assign
  if (fullName !== undefined) addressToUpdate.fullName = fullName.trim();
  if (phone !== undefined) addressToUpdate.phone = phone;
  if (address !== undefined) addressToUpdate.address = address.trim();
  if (city !== undefined) addressToUpdate.city = city.trim();
  if (state !== undefined) addressToUpdate.state = state.trim();
  if (pincode !== undefined) addressToUpdate.pincode = pincode;

  // Handle default address logic
  if (isDefault) {
    user.addresses.forEach(addr => {
      if (addr._id.toString() !== addressId) {
        addr.isDefault = false;
      }
    });
    addressToUpdate.isDefault = true;
  }

  await user.save();

  res.json({
    success: true,
    message: 'Address updated successfully',
    addresses: user.addresses
  });
});

// @desc    Delete address
// @route   DELETE /api/auth/addresses/:addressId
// @access  Private
const deleteAddress = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { addressId } = req.params;

  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const addressToDelete = user.addresses.id(addressId);

  if (!addressToDelete) {
    throw new NotFoundError('Address not found');
  }

  // If deleting default address and there are other addresses, make the first one default
  if (addressToDelete.isDefault && user.addresses.length > 1) {
    user.addresses.forEach((addr, index) => {
      if (addr._id.toString() !== addressId && index === 0) {
        addr.isDefault = true;
      }
    });
  }

  user.addresses.pull(addressId);
  await user.save();

  res.json({
    success: true,
    message: 'Address deleted successfully',
    addresses: user.addresses
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  // Clear httpOnly cookie
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  logout
};
