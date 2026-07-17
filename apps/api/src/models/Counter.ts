/**
 * Gapless document numbering (I6, plan.md §10.1).
 * _id: "{companyId}:{fy}:{series}". The $inc participates in the CALLER'S
 * transaction — an aborted document creation rolls the counter back.
 * Never count() + 1.
 */
import { Schema, model, type ClientSession } from 'mongoose';

interface CounterDoc {
  _id: string;
  seq: number;
  prefix: string;
  width: number;
}

const CounterSchema = new Schema<CounterDoc>(
  {
    _id: String,
    seq: { type: Number, default: 0 },
    prefix: String,
    width: { type: Number, default: 5 },
  },
  { versionKey: false },
);

export const Counter = model<CounterDoc>('Counter', CounterSchema);

const DEFAULT_PREFIX: Record<string, string> = {
  JV: 'JV/',
  INV: 'INV/',
  BILL: 'BILL/',
  PAY: 'PAY/',
  EXP: 'EXP/',
};

export async function nextNumber(
  companyId: string,
  fy: string,
  series: string,
  session: ClientSession,
): Promise<string> {
  const _id = `${companyId}:${fy}:${series}`;
  const doc = await Counter.findByIdAndUpdate(
    _id,
    {
      $inc: { seq: 1 },
      $setOnInsert: { prefix: DEFAULT_PREFIX[series] ?? `${series}/`, width: 5 },
    },
    { new: true, upsert: true, session }, // ← the session is the whole point
  );
  return `${doc!.prefix}${fy}/${String(doc!.seq).padStart(doc!.width, '0')}`;
}
