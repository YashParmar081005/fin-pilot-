/**
 * Make a user a platform operator.
 *
 * `superAdmin` is deliberately a flag no API can grant (see
 * middleware/requireSuperAdmin.ts): if the console could mint its own
 * operators, compromising one account would compromise the platform. So it is
 * set out of band, here, by whoever has database access — and that is the
 * point, not an oversight.
 *
 * Usage:
 *   pnpm --filter @finpilot/api admin:grant you@example.com
 *   pnpm --filter @finpilot/api admin:grant you@example.com --revoke
 */
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env';
import { User } from '../src/models/User';
import { AdminAudit } from '../src/models/AdminAudit';

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('usage: admin:grant <email> [--revoke]');
  process.exit(2);
}

const env = getEnv();
await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });

const user = await User.findOne({ email }).select('+superAdmin');
if (!user) {
  console.error(`no user with email ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

const already = user.superAdmin === true;
if (already === !revoke) {
  console.log(`${email} is already ${revoke ? 'not ' : ''}a platform operator — nothing to do.`);
} else {
  user.superAdmin = !revoke;
  await user.save();
  // The grant itself is an audited event: the operator list is exactly the
  // kind of thing you want a trail for.
  await AdminAudit.create({
    adminUserId: user._id,
    action: revoke ? 'superadmin.revoked' : 'superadmin.granted',
    targetType: 'User',
    targetId: user._id,
    reason: 'granted out of band via admin:grant script',
    meta: { email },
  });
  console.log(`${email} is ${revoke ? 'no longer' : 'now'} a platform operator.`);
}

await mongoose.disconnect();
