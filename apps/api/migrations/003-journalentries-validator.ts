/**
 * Migration 003 — journalentries server-side guards (plan.md §10).
 * 1. collMod $expr validator: a rogue mongosh session cannot insert an
 *    unbalanced entry, and any update that would UNBALANCE a document fails
 *    at the DB layer. (A balance-preserving raw edit — e.g. narration — is
 *    blocked at the application layer; see the honest note in the phase log.)
 * 2. The six §10 indexes, background: true.
 *
 * Run: pnpm --filter @finpilot/api exec tsx migrations/003-journalentries-validator.ts
 * Forward-only, idempotent, re-runnable.
 */
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env';

export const JOURNALENTRIES_VALIDATOR = {
  $expr: { $eq: [{ $sum: '$lines.debitPaise' }, { $sum: '$lines.creditPaise' }] },
};

export async function up(db: mongoose.mongo.Db): Promise<void> {
  const collections = await db.listCollections({ name: 'journalentries' }).toArray();
  if (collections.length === 0) await db.createCollection('journalentries');

  await db.command({
    collMod: 'journalentries',
    validator: JOURNALENTRIES_VALIDATOR,
    validationLevel: 'strict',
    validationAction: 'error',
  });

  const coll = db.collection('journalentries');
  await coll.createIndex({ companyId: 1, date: -1, _id: -1 }, { background: true });
  await coll.createIndex({ companyId: 1, 'lines.accountId': 1, date: -1 }, { background: true });
  await coll.createIndex({ companyId: 1, fy: 1, 'lines.accountId': 1 }, { background: true });
  await coll.createIndex({ companyId: 1, 'source.documentId': 1 }, { background: true });
  await coll.createIndex(
    { companyId: 1, 'lines.partyId': 1, date: -1 },
    { background: true, partialFilterExpression: { 'lines.partyId': { $type: 'objectId' } } },
  );
  await coll.createIndex({ companyId: 1, entryNumber: 1 }, { unique: true, background: true });
}

// standalone runner
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('003-journalentries-validator.ts');
if (isMain) {
  const env = getEnv();
  mongoose
    .connect(env.MONGO_URI)
    .then(async () => {
      await up(mongoose.connection.db!);
      console.warn('migration 003 applied');
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
