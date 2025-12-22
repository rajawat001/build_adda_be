// Reset admin password script
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const resetAdminPassword = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = mongoose.connection.collection('users');

    // Find admin user
    const adminUser = await User.findOne({ email: 'admin@buildmat.com' });

    if (!adminUser) {
      console.log('❌ Admin user not found');
      process.exit(1);
    }

    // New password
    const newPassword = 'Admin@123456';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const result = await User.updateOne(
      { email: 'admin@buildmat.com' },
      {
        $set: {
          password: hashedPassword,
          lastPasswordChange: new Date()
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log('\n✅ Admin password reset successfully!');
      console.log('=' .repeat(60));
      console.log('📧 Email: admin@buildmat.com');
      console.log('🔑 New Password: Admin@123456');
      console.log('=' .repeat(60));
      console.log('\n⚠️  IMPORTANT NEXT STEPS:');
      console.log('1. Logout from the application');
      console.log('2. Login with the new password');
      console.log('3. You should see "Admin Dashboard" button in the header');
      console.log('4. Change this password after logging in!\n');
    } else {
      console.log('❌ Failed to update password');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

resetAdminPassword();
