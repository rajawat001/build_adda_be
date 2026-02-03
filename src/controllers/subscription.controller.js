const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Coupon = require('../models/Coupon');
const Distributor = require('../models/Distributor');
const paymentService = require('../services/payment.service');
const { redirectBaseUrl } = require('../config/phonepe');

// Helper function to approve distributor after successful subscription
const approveDistributorAfterSubscription = async (distributorId) => {
  try {
    await Distributor.findByIdAndUpdate(distributorId, {
      isApproved: true,
      approvedAt: new Date()
    });
    console.log(`Distributor ${distributorId} auto-approved after subscription`);
  } catch (error) {
    console.error('Error auto-approving distributor:', error);
  }
};

// Get all active subscription plans
exports.getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ durationInDays: 1 });

    res.status(200).json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans',
      error: error.message
    });
  }
};

// Get current user's active subscription
exports.getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      distributor: req.user._id,
      status: 'active'
    })
      .populate('plan')
      .populate('couponApplied')
      .sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Check if expired
    if (subscription.endDate <= new Date()) {
      subscription.status = 'expired';
      await subscription.save();

      return res.status(200).json({
        success: true,
        subscription,
        isExpired: true
      });
    }

    res.status(200).json({
      success: true,
      subscription,
      isExpired: false
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: error.message
    });
  }
};

// Validate and apply coupon
exports.applyCoupon = async (req, res) => {
  try {
    const { code, planId } = req.body;

    if (!code || !planId) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code and plan ID are required'
      });
    }

    // Find coupon
    const coupon = await Coupon.findOne({
      code: code.toUpperCase()
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    // Validate coupon
    if (!coupon.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Coupon has expired or reached usage limit'
      });
    }

    // Check if applicable for subscription
    if (coupon.applicableFor !== 'subscription' && coupon.applicableFor !== 'both') {
      return res.status(400).json({
        success: false,
        message: 'This coupon is not applicable for subscriptions'
      });
    }

    // Get plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Calculate discount
    let discount = 0;
    let finalAmount = plan.offerPrice;

    if (coupon.freeMonths > 0) {
      // Free subscription for X months
      discount = plan.offerPrice;
      finalAmount = 0;
    } else if (coupon.discountType === 'percentage') {
      discount = (plan.offerPrice * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
      finalAmount = plan.offerPrice - discount;
    } else {
      // Fixed discount
      discount = coupon.discountValue;
      finalAmount = plan.offerPrice - discount;
    }

    // Ensure final amount is not negative
    if (finalAmount < 0) finalAmount = 0;

    res.status(200).json({
      success: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        freeMonths: coupon.freeMonths,
        description: coupon.description
      },
      originalPrice: plan.offerPrice,
      discount,
      finalAmount
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply coupon',
      error: error.message
    });
  }
};

// Create PhonePe payment order
exports.createOrder = async (req, res) => {
  try {
    const { planId, couponCode } = req.body;

    // Get plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    let amount = plan.offerPrice;
    let discount = 0;
    let coupon = null;

    // Apply coupon if provided
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

      if (coupon && coupon.isValid() && (coupon.applicableFor === 'subscription' || coupon.applicableFor === 'both')) {
        if (coupon.freeMonths > 0) {
          discount = amount;
          amount = 0;
        } else if (coupon.discountType === 'percentage') {
          discount = (amount * coupon.discountValue) / 100;
          if (coupon.maxDiscount && discount > coupon.maxDiscount) {
            discount = coupon.maxDiscount;
          }
          amount -= discount;
        } else {
          discount = coupon.discountValue;
          amount -= discount;
        }

        if (amount < 0) amount = 0;
      }
    }

    // If amount is 0 (free subscription), create subscription directly
    if (amount === 0) {
      const endDate = new Date();
      const daysToAdd = coupon && coupon.freeMonths > 0
        ? coupon.freeMonths * 30
        : plan.durationInDays;
      endDate.setDate(endDate.getDate() + daysToAdd);

      const subscription = new Subscription({
        distributor: req.user._id,
        plan: plan._id,
        startDate: new Date(),
        endDate,
        status: 'active',
        paymentStatus: 'paid',
        amount: plan.offerPrice,
        couponApplied: coupon ? coupon._id : null,
        discount,
        finalAmount: 0,
        paymentMethod: 'coupon'
      });

      await subscription.save();

      // Increment coupon usage
      if (coupon) {
        coupon.usedCount += 1;
        await coupon.save();
      }

      // Auto-approve distributor after successful subscription
      await approveDistributorAfterSubscription(req.user._id);

      return res.status(200).json({
        success: true,
        message: 'Free subscription activated successfully',
        subscription,
        isFree: true
      });
    }

    // Create pending subscription
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.durationInDays);

    const merchantOrderId = `SUB_${req.user._id}_${Date.now()}`;

    const subscription = new Subscription({
      distributor: req.user._id,
      plan: plan._id,
      startDate: new Date(),
      endDate,
      status: 'pending',
      paymentStatus: 'pending',
      amount: plan.offerPrice,
      couponApplied: coupon ? coupon._id : null,
      discount,
      finalAmount: amount,
      phonepeMerchantTransactionId: merchantOrderId
    });

    await subscription.save();

    // Initiate PhonePe v2 payment
    const phonepeRedirectUrl = `${redirectBaseUrl}/payment/status?merchantOrderId=${merchantOrderId}&type=subscription&subscriptionId=${subscription._id}`;

    const phonePeResponse = await paymentService.initiatePayment({
      merchantOrderId,
      amount,
      redirectUrl: phonepeRedirectUrl
    });

    // v2 response: { orderId, state, redirectUrl }
    const paymentUrl = phonePeResponse.redirectUrl;

    res.status(200).json({
      success: true,
      paymentUrl,
      subscription: subscription._id,
      merchantOrderId
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

// Check PhonePe payment status for subscription
exports.verifyPayment = async (req, res) => {
  try {
    // Support both old (merchantTransactionId) and new (merchantOrderId) field names
    const merchantOrderId = req.body.merchantOrderId || req.body.merchantTransactionId;
    const { subscriptionId } = req.body;

    if (!merchantOrderId || !subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'merchantOrderId and subscriptionId are required'
      });
    }

    // Find subscription
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // If already paid (e.g. by webhook), return success immediately
    if (subscription.paymentStatus === 'paid') {
      await subscription.populate('plan');
      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        paymentStatus: 'paid',
        subscription
      });
    }

    // Check status with PhonePe v2 API
    const statusResponse = await paymentService.checkPaymentStatus(merchantOrderId);
    const state = statusResponse.state;

    if (state === 'COMPLETED') {
      const paymentDetails = statusResponse.paymentDetails || [];
      const firstPayment = paymentDetails.length > 0 ? paymentDetails[0] : {};

      subscription.phonepeTransactionId = firstPayment.transactionId || '';
      subscription.status = 'active';
      subscription.paymentStatus = 'paid';
      await subscription.save();

      // Increment coupon usage if applicable
      if (subscription.couponApplied) {
        await Coupon.findByIdAndUpdate(
          subscription.couponApplied,
          { $inc: { usedCount: 1 } }
        );
      }

      // Auto-approve distributor after successful subscription
      await approveDistributorAfterSubscription(subscription.distributor);

      await subscription.populate('plan');

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        paymentStatus: 'paid',
        subscription
      });
    }

    if (state === 'PENDING') {
      return res.status(200).json({
        success: true,
        message: 'Payment is still pending',
        paymentStatus: 'pending',
        subscription
      });
    }

    // Payment failed
    subscription.paymentStatus = 'failed';
    await subscription.save();

    return res.status(200).json({
      success: false,
      message: 'Payment failed',
      paymentStatus: 'failed',
      subscription
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

// Get subscription history
exports.getSubscriptionHistory = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({
      distributor: req.user._id
    })
      .populate('plan')
      .populate('couponApplied')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      subscriptions
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription history',
      error: error.message
    });
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId, reason } = req.body;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      distributor: req.user._id,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Active subscription not found'
      });
    }

    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.cancelReason = reason || '';
    await subscription.save();

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: error.message
    });
  }
};

module.exports = exports;
