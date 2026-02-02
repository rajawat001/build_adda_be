const Settings = require('../models/Settings');

// @desc    Get system settings
// @route   GET /api/admin/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
  try {
    // Get the first (and should be only) settings document
    let settings = await Settings.findOne();

    // If no settings exist, create default settings
    if (!settings) {
      settings = await Settings.create({
        // General
        siteName: 'BuildAdda',
        siteDescription: 'Building Materials E-commerce Platform',
        contactEmail: 'contact@buildadda.com',
        contactPhone: '+91 1234567890',
        address: '123 Main Street, City, State, PIN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',

        // Payment
        phonepeMerchantId: '',
        phonepeSaltKey: '',
        phonepeSaltIndex: '1',
        phonepeEnv: 'sandbox',
        codEnabled: true,
        minOrderAmount: 500,

        // Shipping
        defaultShippingCharge: 50,
        freeShippingThreshold: 1000,
        shippingZones: ['Local', 'Regional', 'National'],

        // Tax
        taxRate: 18,
        taxCalculationMethod: 'exclusive',
        taxEnabled: true,

        // Email
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpFromEmail: 'noreply@buildadda.com',
        smtpFromName: 'BuildAdda',
        emailSignature: 'Best regards,\nBuildAdda Team',

        // Notifications
        adminNotifications: true,
        orderNotifications: true,
        distributorNotifications: true,
        smsEnabled: false,
        pushEnabled: false,

        // Advanced
        maintenanceMode: false,
        debugMode: false,
        cacheEnabled: true,
        apiRateLimit: 100
      });
    }

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
};

// @desc    Update system settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
  try {
    const settingsData = req.body;

    // Validate critical settings
    if (settingsData.taxRate && (settingsData.taxRate < 0 || settingsData.taxRate > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Tax rate must be between 0 and 100'
      });
    }

    if (settingsData.minOrderAmount && settingsData.minOrderAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum order amount cannot be negative'
      });
    }

    if (settingsData.apiRateLimit && settingsData.apiRateLimit < 10) {
      return res.status(400).json({
        success: false,
        message: 'API rate limit must be at least 10 requests per 15 minutes'
      });
    }

    // Get existing settings
    let settings = await Settings.findOne();

    if (!settings) {
      // Create new settings if they don't exist
      settings = await Settings.create(settingsData);
    } else {
      // Update existing settings
      Object.keys(settingsData).forEach(key => {
        settings[key] = settingsData[key];
      });
      await settings.save();
    }

    // Log the settings update
    // TODO: Add activity log entry here

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
};

// @desc    Reset settings to default
// @route   POST /api/admin/settings/reset
// @access  Private/Admin
exports.resetSettings = async (req, res) => {
  try {
    const defaultSettings = {
      // General
      siteName: 'BuildAdda',
      siteDescription: 'Building Materials E-commerce Platform',
      contactEmail: 'contact@buildadda.com',
      contactPhone: '+91 1234567890',
      address: '123 Main Street, City, State, PIN',
      currency: 'INR',
      timezone: 'Asia/Kolkata',

      // Payment
      phonepeMerchantId: '',
      phonepeSaltKey: '',
      phonepeSaltIndex: '1',
      phonepeEnv: 'sandbox',
      codEnabled: true,
      minOrderAmount: 500,

      // Shipping
      defaultShippingCharge: 50,
      freeShippingThreshold: 1000,
      shippingZones: ['Local', 'Regional', 'National'],

      // Tax
      taxRate: 18,
      taxCalculationMethod: 'exclusive',
      taxEnabled: true,

      // Email
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpFromEmail: 'noreply@buildadda.com',
      smtpFromName: 'BuildAdda',
      emailSignature: 'Best regards,\nBuildAdda Team',

      // Notifications
      adminNotifications: true,
      orderNotifications: true,
      distributorNotifications: true,
      smsEnabled: false,
      pushEnabled: false,

      // Advanced
      maintenanceMode: false,
      debugMode: false,
      cacheEnabled: true,
      apiRateLimit: 100
    };

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create(defaultSettings);
    } else {
      Object.keys(defaultSettings).forEach(key => {
        settings[key] = defaultSettings[key];
      });
      await settings.save();
    }

    res.json({
      success: true,
      message: 'Settings reset to defaults successfully',
      settings
    });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings',
      error: error.message
    });
  }
};

// @desc    Test email configuration
// @route   POST /api/admin/settings/test-email
// @access  Private/Admin
exports.testEmailConfig = async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        message: 'Test email address is required'
      });
    }

    const settings = await Settings.findOne();

    if (!settings || !settings.smtpHost || !settings.smtpUser) {
      return res.status(400).json({
        success: false,
        message: 'SMTP configuration is incomplete'
      });
    }

    // TODO: Implement actual email sending with Nodemailer
    // For now, just return success
    res.json({
      success: true,
      message: `Test email would be sent to ${testEmail}`,
      note: 'Email service not yet implemented'
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
};

// @desc    Get public settings (for frontend)
// @route   GET /api/settings/public
// @access  Public
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne();

    if (!settings) {
      return res.json({
        success: true,
        settings: {
          siteName: 'BuildAdda',
          siteDescription: 'Building Materials E-commerce Platform',
          currency: 'INR',
          taxEnabled: true,
          taxRate: 18,
          codEnabled: true,
          minOrderAmount: 500,
          freeShippingThreshold: 1000,
          maintenanceMode: false
        }
      });
    }

    // Return only public settings (no sensitive data)
    res.json({
      success: true,
      settings: {
        siteName: settings.siteName,
        siteDescription: settings.siteDescription,
        currency: settings.currency,
        taxEnabled: settings.taxEnabled,
        taxRate: settings.taxRate,
        taxCalculationMethod: settings.taxCalculationMethod,
        codEnabled: settings.codEnabled,
        minOrderAmount: settings.minOrderAmount,
        freeShippingThreshold: settings.freeShippingThreshold,
        defaultShippingCharge: settings.defaultShippingCharge,
        maintenanceMode: settings.maintenanceMode
      }
    });
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public settings',
      error: error.message
    });
  }
};
