const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const mongoose = require('mongoose');
const router = express.Router();

// Validation middleware
const validateUser = [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Must be a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'regular']).withMessage('Role must be admin or regular'),
  body('plan').isIn(['Free', 'Pro']).withMessage('Plan must be Free or Pro')
];

// Get all users
router.get('/', async (req, res) => {
  try {
    const { email, role, plan, isVerified } = req.query;
    let filter = {};

    if (email) filter.email = { $regex: email, $options: 'i' };
    if (role) filter.role = role;
    if (plan) filter.plan = plan;
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching users', message: error.message });
  }
});

// Get user by ID (with ObjectId validation)
router.get('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user', message: error.message });
  }
});

// Create new user
router.post('/', validateUser, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, role, plan } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    const user = new User({
      username,
      email,
      password,
      role,
      plan
    });

    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error creating user', message: error.message });
  }
});

// Update user
router.patch('/:id', async (req, res) => {
  try {
    const { role, plan, isVerified, username, email } = req.body;
    const updateData = {};

    if (role !== undefined) updateData.role = role;
    if (plan !== undefined) updateData.plan = plan;
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error updating user', message: error.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting user', message: error.message });
  }
});

// Get user statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const proUsers = await User.countDocuments({ plan: 'Pro' });
    const adminUsers = await User.countDocuments({ role: 'admin' });

    res.json({
      totalUsers,
      verifiedUsers,
      proUsers,
      adminUsers,
      verificationRate: totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user stats', message: error.message });
  }
});

module.exports = router; 