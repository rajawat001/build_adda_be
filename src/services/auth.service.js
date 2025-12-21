const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Distributor = require('../models/Distributor');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const registerUser = async (userData) => {
  const { role, ...data } = userData;

  let user;
  
  if (role === 'distributor') {
    const exists = await Distributor.findOne({ email: data.email });
    if (exists) {
      throw new Error('Distributor already exists');
    }
    user = await Distributor.create(data);
  } else {
    const exists = await User.findOne({ email: data.email });
    if (exists) {
      throw new Error('User already exists');
    }
    user = await User.create({ ...data, role: role || 'user' });
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id, user.role)
  };
};

const loginUser = async (email, password) => {
  // Try to find in User collection first (admin and regular users)
  let user = await User.findOne({ email });
  let accountType = 'user';

  // If not found in User, check Distributor
  if (!user) {
    user = await Distributor.findOne({ email });
    accountType = 'distributor';
  }

  // If still not found, throw error
  if (!user) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  if (!(await user.matchPassword(password))) {
    throw new Error('Invalid email or password');
  }

  // Check if distributor is approved
  if (accountType === 'distributor' && !user.isApproved) {
    throw new Error('Your account is pending approval from admin');
  }

  // Check if account is active
  if (!user.isActive) {
    throw new Error('Your account has been deactivated. Please contact support.');
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id, user.role)
  };
};

module.exports = {
  registerUser,
  loginUser,
  generateToken
};