const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { User } = require('../src/models');

function parseUsername(args) {
  if (args.length !== 2 || args[0] !== '--username' || !/^[a-z0-9_]{3,25}$/i.test(args[1]))
    throw new Error('Usage: npm run admin:create -- --username <existing-verified-username>');
  return args[1].toLowerCase();
}

async function promoteAdmin(username) {
  if (typeof username !== 'string' || !/^[a-z0-9_]{3,25}$/.test(username))
    throw new Error('Provide one valid existing username.');
  const user = await User.findOne({ username });
  if (!user || user.disabled || user.isDemo || user.seedKey || !user.emailVerified)
    throw new Error('Promotion requires an existing active, email-verified, non-demo account.');
  if (user.role === 'admin') return { username, changed: false };
  const result = await User.updateOne(
    {
      _id: user._id,
      username,
      disabled: false,
      isDemo: false,
      emailVerified: true,
      role: 'user',
      $or: [{ seedKey: { $exists: false } }, { seedKey: null }, { seedKey: '' }],
    },
    { $set: { role: 'admin' }, $inc: { sessionVersion: 1 } },
  );
  if (result.modifiedCount !== 1)
    throw new Error('The account changed during promotion. Review it and retry.');
  return { username, changed: true };
}

async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Promote an existing verified non-demo account: npm run admin:create -- --username <username>',
    );
    return;
  }
  const username = parseUsername(args);
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  if (!process.env.MONGODB_URI)
    throw new Error('Set MONGODB_URI to the intended database before provisioning an administrator.');
  try {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    } catch {
      throw new Error('Could not connect to the configured database. Check MONGODB_URI.');
    }
    const result = await promoteAdmin(username);
    console.log(
      result.changed
        ? `Promoted ${username} to administrator. Existing sessions are revoked; sign in again.`
        : `${username} is already an administrator. No changes made.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

module.exports = { parseUsername, promoteAdmin, main };
