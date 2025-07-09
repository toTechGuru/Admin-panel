const express = require('express');
const User = require('../models/User');
const Plan = require('../models/Plan');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const plans = await Plan.find();
 

    // Print all emailLimit values for each plan
    plans.forEach(plan => {
      console.log(`Plan: ${plan.name}, Email Limit: ${plan.emailLimit}`);
    });

    // Build an array of email limits where index matches plan number
    // planEmailLimits[1] = 'basic', [2] = 'premium', [3] = 'premiumPlus'
    const planNumberToName = { 1: 'basic', 2: 'premium', 3: 'premiumPlus' };
    // Build a map: plan name -> emailLimit
    const planEmailLimitMap = {};
    plans.forEach(plan => {
      planEmailLimitMap[plan.name] = plan.emailLimit;
    });

    const billingData = users.map(user => {
      let planName = null;
      if (typeof user.plan === 'number') {
        planName = planNumberToName[user.plan];
      } else if (typeof user.plan === 'string') {
        if (!isNaN(user.plan)) {
          planName = planNumberToName[parseInt(user.plan, 10)];
        } else {
          planName = user.plan;
        }
      }
      let emailLimit = null;
      if (planName) {
        const planDoc = plans.find(p => p.name === planName);
        if (planDoc) {
          emailLimit = planDoc.emailLimit;
        }
      }
      return {
        name: user.username,
        plan: planName,
        emailLimit,
        status: user.isVerified ? 'active' : 'inactive',
        expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        role: user.role,
      };
    });

    res.json(billingData);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching billing data', message: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Get plan details from Plan collection
    const userPlan = await Plan.findOne({ name: user.plan });
    const allPlans = await Plan.find();
    res.json({
      user,
      plan: userPlan,
      availablePlans: allPlans
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user billing', message: error.message });
  }
});

router.patch('/user/:userId/plan', async (req, res) => {
  try {
    const { plan } = req.body;

    const planExists = await Plan.findOne({ name: plan });
    if (!planExists) {
      return res.status(400).json({ error: 'Invalid plan. Plan not found in database' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { plan },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: `User plan updated to ${plan}`,
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Error updating user plan', message: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const users = await User.find();
    const plans = await Plan.find();
    const planMap = {};
    plans.forEach(plan => {
      planMap[plan.name] = plan;
    });

    const planDistribution = [];
    const planCounts = {};
    
    users.forEach(user => {
      const planName = user.plan || 'basic';
      planCounts[planName] = (planCounts[planName] || 0) + 1;
    });

    Object.keys(planCounts).forEach(planName => {
      const plan = planMap[planName];
      const count = planCounts[planName];
      const price = plan ? plan.price / 100 : 0;
      
      planDistribution.push({
        _id: planName,
        count,
        price,
        monthlyRevenue: count * price,
        yearlyRevenue: count * price * 12
      });
    });

    const totalUsers = users.length;
    const totalMonthlyRevenue = planDistribution.reduce((sum, plan) => sum + plan.monthlyRevenue, 0);
    const totalYearlyRevenue = planDistribution.reduce((sum, plan) => sum + plan.yearlyRevenue, 0);
    
    planDistribution.forEach(plan => {
      plan.percentage = totalUsers > 0 ? Math.round((plan.count / totalUsers) * 100) : 0;
    });

    const analytics = {
      planDistribution,
      totalUsers,
      revenue: {
        monthly: totalMonthlyRevenue,
        yearly: totalYearlyRevenue,
        projected: totalYearlyRevenue * 12
      },
      conversionRate: totalUsers > 0 ? Math.round((planDistribution.filter(p => p.price > 0).reduce((sum, plan) => sum + plan.count, 0) / totalUsers) * 100) : 0
    };

    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching billing analytics', message: error.message });
  }
});

router.post('/process-payment', async (req, res) => {
  try {
    const { userId, amount, paymentMethod } = req.body;

    const paymentResult = {
      success: true,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency: 'USD',
      status: 'succeeded',
      timestamp: new Date().toISOString()
    };

    res.json({
      message: 'Payment processed successfully',
      payment: paymentResult
    });
  } catch (error) {
    res.status(500).json({ error: 'Error processing payment', message: error.message });
  }
});

// Update a plan's emailLimit
router.patch('/plan/:planName', async (req, res) => {
  try {
    const { emailLimit } = req.body;
    const { planName } = req.params;
    if (typeof emailLimit !== 'number' || emailLimit < 0) {
      return res.status(400).json({ error: 'Invalid emailLimit' });
    }
    const updatedPlan = await Plan.findOneAndUpdate(
      { name: planName },
      { emailLimit },
      { new: true }
    );
    if (!updatedPlan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    res.json(updatedPlan);
  } catch (error) {
    res.status(500).json({ error: 'Error updating plan', message: error.message });
  }
});

// Get all plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching plans', message: error.message });
  }
});

// Create a new plan
router.post('/plan', async (req, res) => {
  try {
    const { name, emailLimit, price, stripePriceId, description } = req.body;
    if (!name || typeof emailLimit !== 'number' || emailLimit < 0) {
      return res.status(400).json({ error: 'Invalid plan data' });
    }
    const existing = await Plan.findOne({ name });
    if (existing) {
      return res.status(400).json({ error: 'Plan with this name already exists' });
    }
    const newPlan = new Plan({ name, emailLimit, price, stripePriceId, description });
    await newPlan.save();
    res.status(201).json(newPlan);
  } catch (error) {
    res.status(500).json({ error: 'Error creating plan', message: error.message });
  }
});

// Delete a plan by name
router.delete('/plan/:planName', async (req, res) => {
  try {
    const { planName } = req.params;
    const deleted = await Plan.findOneAndDelete({ name: planName });
    if (!deleted) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting plan', message: error.message });
  }
});

module.exports = router; 