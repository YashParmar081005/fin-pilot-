/**
 * Create or promote a platform operator — the bootstrap that the portal
 * deliberately cannot perform itself.
 *
 * `superAdmin` is a flag no API can grant (see middleware/requireSuperAdmin.ts
 * and adminService.createOperator): the FIRST operator has to come from
 * somewhere outside the console, because a console that could mint its own
 * operators would turn any compromised account into a platform takeover. After
 * that, operators add each other in the portal.
 *
 * Operators are their own accounts and may not belong to a company, so this
 * refuses to promote a user who holds a membership.
 *
 * Usage:
 *   pnpm --filter @finpilot/api admin:grant ops@example.com --password "at-least-12-chars" --name "Ops"
 *   pnpm --filter @finpilot/api admin:grant ops@example.com            # promote an existing account
 *   pnpm --filter @finpilot/api admin:grant ops@example.com --revoke
 */
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env';
import { User } from '../src/models/User';
import { AdminAudit } from '../src/models/AdminAudit';
import { Membership } from '../src/models/Membership';
import { hashPassword } from '../src/services/passwordService';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes('--revoke');
const password = flag('password');
const name = flag('name') ?? 'Platform Operator';

if (!email || email.startsWith('--')) {
  console.error('usage: admin:grant <email> [--password <12+ chars>] [--name <name>] [--revoke]');
  process.exit(2);
}

const env = getEnv();
await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });

try {
  const user = await User.findOne({ email }).select('+superAdmin');

  if (revoke) {
    if (!user?.superAdmin) {
      console.log(`${email} is not an operator — nothing to do.`);
    } else {
      const others = await User.countDocuments({
        superAdmin: true,
        disabledAt: null,
        _id: { $ne: user._id },
      });
      if (others === 0) {
        console.error('refusing: that is the last active operator, the platform would be unreachable.');
        process.exit(1);
      }
      user.superAdmin = false;
      await user.save();
      await AdminAudit.create({
        adminUserId: user._id,
        action: 'superadmin.revoked',
        targetType: 'User',
        targetId: user._id,
        reason: 'revoked out of band via admin:grant script',
        meta: { email },
      });
      console.log(`${email} is no longer a platform operator.`);
    }
  } else if (!user) {
    if (!password || password.length < 12) {
      console.error(
        `no account for ${email}. To create one, pass --password with at least 12 characters.`,
      );
      process.exit(1);
    }
    const created = await User.create({
      email,
      name,
      passwordHash: await hashPassword(password),
      superAdmin: true,
      emailVerifiedAt: new Date(), // nobody to verify with; it is an ops account
    });
    await AdminAudit.create({
      adminUserId: created._id,
      action: 'operator.created',
      targetType: 'User',
      targetId: created._id,
      reason: 'first operator created out of band via admin:grant script',
      meta: { email },
    });
    console.log(`created operator account ${email} (${name}).`);
  } else if (user.superAdmin) {
    console.log(`${email} is already a platform operator — nothing to do.`);
  } else {
    // Operators are not customers. Promoting a member would blur exactly the
    // line that separate operator accounts exist to hold.
    const memberships = await Membership.countDocuments({ userId: user._id });
    if (memberships > 0) {
      console.error(
        `refusing: ${email} belongs to ${memberships} compan${memberships === 1 ? 'y' : 'ies'}.\n` +
          'Operators may not be customers — create a separate operator account instead.',
      );
      process.exit(1);
    }
    user.superAdmin = true;
    await user.save();
    await AdminAudit.create({
      adminUserId: user._id,
      action: 'superadmin.granted',
      targetType: 'User',
      targetId: user._id,
      reason: 'granted out of band via admin:grant script',
      meta: { email },
    });
    console.log(`${email} is now a platform operator.`);
  }
} finally {
  await mongoose.disconnect();
}
