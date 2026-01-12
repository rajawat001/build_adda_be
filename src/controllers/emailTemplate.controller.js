const EmailTemplate = require('../models/EmailTemplate');

// @desc    Get all email templates
// @route   GET /api/admin/email-templates
// @access  Private/Admin
exports.getAllEmailTemplates = async (req, res) => {
  try {
    const { includeInactive } = req.query;

    const filter = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const templates = await EmailTemplate.find(filter).sort({ createdAt: -1 });

    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email templates',
      error: error.message
    });
  }
};

// @desc    Get single email template
// @route   GET /api/admin/email-templates/:id
// @access  Private/Admin
exports.getEmailTemplateById = async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email template',
      error: error.message
    });
  }
};

// @desc    Get template by slug
// @route   GET /api/admin/email-templates/slug/:slug
// @access  Private/Admin
exports.getEmailTemplateBySlug = async (req, res) => {
  try {
    const template = await EmailTemplate.findOne({ slug: req.params.slug });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email template',
      error: error.message
    });
  }
};

// @desc    Create new email template
// @route   POST /api/admin/email-templates
// @access  Private/Admin
exports.createEmailTemplate = async (req, res) => {
  try {
    const { name, slug, subject, body, variables, isActive } = req.body;

    // Validate required fields
    if (!name || !slug || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: 'Name, slug, subject, and body are required'
      });
    }

    // Check if template with same name or slug already exists
    const existingTemplate = await EmailTemplate.findOne({
      $or: [{ name }, { slug }]
    });

    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Email template with this name or slug already exists'
      });
    }

    // Extract variables from body
    const extractedVariables = [];
    const regex = /{{(\w+)}}/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
      if (!extractedVariables.includes(match[1])) {
        extractedVariables.push(match[1]);
      }
    }

    // Create template
    const template = await EmailTemplate.create({
      name,
      slug,
      subject,
      body,
      variables: variables || extractedVariables,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({
      success: true,
      message: 'Email template created successfully',
      template
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email template',
      error: error.message
    });
  }
};

// @desc    Update email template
// @route   PUT /api/admin/email-templates/:id
// @access  Private/Admin
exports.updateEmailTemplate = async (req, res) => {
  try {
    const { name, slug, subject, body, variables, isActive } = req.body;

    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    // Check if updating name/slug conflicts with existing template
    if ((name && name !== template.name) || (slug && slug !== template.slug)) {
      const existingTemplate = await EmailTemplate.findOne({
        _id: { $ne: req.params.id },
        $or: [
          ...(name ? [{ name }] : []),
          ...(slug ? [{ slug }] : [])
        ]
      });

      if (existingTemplate) {
        return res.status(400).json({
          success: false,
          message: 'Email template with this name or slug already exists'
        });
      }
    }

    // Extract variables from body if body is updated
    if (body) {
      const extractedVariables = [];
      const regex = /{{(\w+)}}/g;
      let match;
      while ((match = regex.exec(body)) !== null) {
        if (!extractedVariables.includes(match[1])) {
          extractedVariables.push(match[1]);
        }
      }
      template.variables = variables || extractedVariables;
    }

    // Update fields
    if (name) template.name = name;
    if (slug) template.slug = slug;
    if (subject) template.subject = subject;
    if (body) template.body = body;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();

    res.json({
      success: true,
      message: 'Email template updated successfully',
      template
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update email template',
      error: error.message
    });
  }
};

// @desc    Delete email template
// @route   DELETE /api/admin/email-templates/:id
// @access  Private/Admin
exports.deleteEmailTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    await template.deleteOne();

    res.json({
      success: true,
      message: 'Email template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete email template',
      error: error.message
    });
  }
};

// @desc    Send test email
// @route   POST /api/admin/email-templates/:id/test
// @access  Private/Admin
exports.sendTestEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    // Sample data for testing
    const sampleData = {
      userName: 'John Doe',
      userEmail: email,
      orderNumber: 'TEST-001',
      orderDate: new Date().toLocaleDateString(),
      orderAmount: '₹15,000',
      distributorName: 'ABC Building Materials',
      productName: 'Premium Cement',
      quantity: '50 bags',
      trackingNumber: 'TRK123456789'
    };

    const { subject, body } = template.render(sampleData);

    // TODO: Implement actual email sending with nodemailer
    // For now, just return success
    console.log('Test email would be sent to:', email);
    console.log('Subject:', subject);
    console.log('Body:', body);

    res.json({
      success: true,
      message: 'Test email sent successfully (simulated)',
      preview: { subject, body }
    });
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
};

// @desc    Get email template statistics
// @route   GET /api/admin/email-templates/stats
// @access  Private/Admin
exports.getEmailTemplateStats = async (req, res) => {
  try {
    const totalTemplates = await EmailTemplate.countDocuments();
    const activeTemplates = await EmailTemplate.countDocuments({ isActive: true });
    const inactiveTemplates = await EmailTemplate.countDocuments({ isActive: false });

    res.json({
      success: true,
      stats: {
        total: totalTemplates,
        active: activeTemplates,
        inactive: inactiveTemplates
      }
    });
  } catch (error) {
    console.error('Get template stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email template statistics',
      error: error.message
    });
  }
};
