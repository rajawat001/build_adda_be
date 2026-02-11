const Contact = require('../models/Contact');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');
const emailService = require('../services/email.service');

const subjectLabels = {
  'product-inquiry': 'Product Inquiry',
  'order-issue': 'Order Issue',
  'delivery-question': 'Delivery Question',
  'payment-issue': 'Payment Issue',
  'return-refund': 'Return/Refund',
  'distributor-inquiry': 'Become a Distributor',
  'partnership': 'Partnership',
  'feedback': 'Feedback',
  'other': 'Other'
};

// @desc    Submit a contact form message (groups by email into threads)
// @route   POST /api/contact
// @access  Public
exports.submitContact = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    throw new ValidationError('Please fill in all required fields');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Please provide a valid email address');
  }

  if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    throw new ValidationError('Please provide a valid 10-digit phone number');
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Find existing thread for this email or create new one
  let contact = await Contact.findOne({ email: normalizedEmail });

  if (contact) {
    // Existing thread — add new message, update user info
    contact.messages.push({ sender: 'user', subject, message });
    contact.name = name;
    if (phone) contact.phone = phone;
    contact.status = 'new';
    contact.lastMessageAt = new Date();
    await contact.save();
  } else {
    // New thread
    contact = await Contact.create({
      name,
      email: normalizedEmail,
      phone: phone || '',
      status: 'new',
      lastMessageAt: new Date(),
      messages: [{ sender: 'user', subject, message }]
    });
  }

  res.status(201).json({
    success: true,
    message: 'Your message has been sent successfully. We will get back to you soon.',
    contactId: contact._id
  });
});

// @desc    Get logged-in user's own contact thread
// @route   GET /api/contact/my-thread
// @access  Private (authenticated users)
exports.getMyThread = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({ email: req.user.email.toLowerCase().trim() });

  res.json({
    success: true,
    contact: contact || null
  });
});

// @desc    Get contact stats (admin)
// @route   GET /api/admin/contacts/stats
// @access  Private/Admin
exports.getContactStats = asyncHandler(async (req, res) => {
  const [total, newCount, readCount, repliedCount, closedCount] = await Promise.all([
    Contact.countDocuments(),
    Contact.countDocuments({ status: 'new' }),
    Contact.countDocuments({ status: 'read' }),
    Contact.countDocuments({ status: 'replied' }),
    Contact.countDocuments({ status: 'closed' })
  ]);

  res.json({
    success: true,
    stats: { total, new: newCount, read: readCount, replied: repliedCount, closed: closedCount }
  });
});

// @desc    Get all contact threads (admin)
// @route   GET /api/admin/contacts
// @access  Private/Admin
exports.getAllContacts = asyncHandler(async (req, res) => {
  const { status, search, subject, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (subject) filter['messages.subject'] = subject;

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { 'messages.message': searchRegex },
      { phone: searchRegex }
    ];
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const contacts = await Contact.find(filter)
    .sort('-lastMessageAt')
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum);

  const total = await Contact.countDocuments(filter);

  res.json({
    success: true,
    contacts,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    }
  });
});

// @desc    Update contact status (admin)
// @route   PATCH /api/admin/contacts/:id
// @access  Private/Admin
exports.updateContactStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const validStatuses = ['new', 'read', 'replied', 'closed'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError('Invalid status');
  }

  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );

  if (!contact) {
    throw new NotFoundError('Contact thread not found');
  }

  res.json({ success: true, contact });
});

// @desc    Reply to a contact thread (admin) — sends email via Brevo
// @route   POST /api/admin/contacts/:id/reply
// @access  Private/Admin
exports.replyToContact = asyncHandler(async (req, res) => {
  const { reply } = req.body;

  if (!reply || !reply.trim()) {
    throw new ValidationError('Reply message is required');
  }

  const contact = await Contact.findById(req.params.id);
  if (!contact) {
    throw new NotFoundError('Contact thread not found');
  }

  // Find last user message for email context
  const lastUserMessage = [...contact.messages].reverse().find(m => m.sender === 'user');
  const subjectLabel = subjectLabels[lastUserMessage?.subject] || lastUserMessage?.subject || 'Contact';

  // Send email to user
  const emailResult = await emailService.sendContactReplyEmail(
    contact, reply.trim(), subjectLabel, lastUserMessage?.message || ''
  );

  if (!emailResult.success) {
    throw new ValidationError('Failed to send reply email: ' + (emailResult.error || 'Unknown error'));
  }

  // Add admin reply to thread
  contact.messages.push({
    sender: 'admin',
    message: reply.trim(),
    sentBy: req.user._id
  });
  contact.status = 'replied';
  contact.lastMessageAt = new Date();
  await contact.save();

  res.json({
    success: true,
    message: 'Reply sent successfully',
    contact
  });
});

// @desc    Delete contact thread (admin)
// @route   DELETE /api/admin/contacts/:id
// @access  Private/Admin
exports.deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findByIdAndDelete(req.params.id);

  if (!contact) {
    throw new NotFoundError('Contact thread not found');
  }

  res.json({ success: true, message: 'Contact thread deleted' });
});
