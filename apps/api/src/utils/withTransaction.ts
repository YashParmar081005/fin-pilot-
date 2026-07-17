/**
 * The one transaction wrapper (plan.md §22.1).
 * `session.withTransaction` retries TransientTransactionError and
 * UnknownTransactionCommitResult automatically — do not hand-roll that loop.
 *
 * Hard rules: every query inside takes the session; transactions are short
 * (<100 ms target); the callback may run MORE THAN ONCE, so no side effects
 * outside Mongo — Redis/queue/log side effects go after commit or via outbox.
 */
import mongoose, { type ClientSession } from 'mongoose';

export async function withTransaction<T>(fn: (s: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(
      async (s) => {
        result = await fn(s);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
        maxCommitTimeMS: 10_000,
      },
    );
    return result!;
  } finally {
    await session.endSession();
  }
}
