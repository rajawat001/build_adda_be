require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

const fixSuperAdmin = async () => {
  await connectDB();

  try {
    // Step 1: Fix role field — "Super Admin" -> "admin"
    const result = await mongoose.connection.db.collection('users').updateMany(
      { role: { $nin: ['user', 'admin', 'distributor'] } },
      [{ $set: { role: { $cond: { if: { $regexMatch: { input: { $toLower: '$role' }, regex: /admin/ } }, then: 'admin', else: 'user' } } } }]
    );
    console.log(`Step 1: Fixed ${result.modifiedCount} user(s) with invalid role values`);

    // Step 2: Find or create Super Admin role
    let superAdminRole = await Role.findOne({ name: 'Super Admin' });
    if (!superAdminRole) {
      superAdminRole = await Role.create({
        name: 'Super Admin',
        permissions: ['*'],
        description: 'Full system access with all permissions',
        isActive: true,
        isSystem: true
      });
      console.log('Step 2: Created "Super Admin" role');
    } else {
      console.log(`Step 2: "Super Admin" role already exists (${superAdminRole._id})`);
    }

    // Step 3: Assign Super Admin role to admin@buildadda.com
    const adminUser = await User.findOne({ email: 'admin@buildadda.com' });
    if (adminUser) {
      // Fix role if needed (bypass mongoose validation using direct update)
      await mongoose.connection.db.collection('users').updateOne(
        { _id: adminUser._id },
        { $set: { role: 'admin', assignedRole: superAdminRole._id } }
      );
      console.log(`Step 3: Assigned "Super Admin" role to ${adminUser.name} (${adminUser.email})`);
    } else {
      console.log('Step 3: admin@buildadda.com not found — skipping');
    }

    // Step 4: Also seed any missing default roles
    const defaults = Role.getDefaultRoles();
    let created = 0;
    for (const defaultRole of defaults) {
      const exists = await Role.findOne({ name: defaultRole.name });
      if (!exists) {
        await Role.create(defaultRole);
        created++;
      }
    }
    console.log(`Step 4: Created ${created} missing default role(s)`);

    // Summary
    console.log('\n--- DONE ---');
    console.log('admin@buildadda.com is now Super Admin with full access.');
    console.log('Please re-login to apply changes.');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

fixSuperAdmin();
