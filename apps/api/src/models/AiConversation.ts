/** Copilot persistence (plan.md §8.1): conversations, tool-call audit, usage. */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface AiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string | null;
  at: Date;
}

export interface AiConversationDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  messages: AiMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const AiConversationSchema = new Schema<AiConversationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, default: 'New conversation' },
    messages: [
      {
        _id: false,
        role: { type: String, enum: ['user', 'assistant', 'tool'] },
        content: String,
        toolName: { type: String, default: null },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
AiConversationSchema.plugin(tenantScope);
export const AiConversation = model<AiConversationDoc>('AiConversation', AiConversationSchema);

/** Every tool invocation, for audit + cost (§8.1, TTL 180 d). */
export interface AiToolCallDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  conversationId: Types.ObjectId;
  toolName: string;
  args: Record<string, unknown>; // as EXECUTED — companyId is the server's
  resultPreview: string;
  createdAt: Date;
}
const AiToolCallSchema = new Schema<AiToolCallDoc>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true },
    toolName: { type: String, required: true },
    args: Schema.Types.Mixed,
    resultPreview: String,
    createdAt: { type: Date, default: Date.now, expires: 15_552_000 },
  },
  { versionKey: false },
);
AiToolCallSchema.plugin(tenantScope);
export const AiToolCall = model<AiToolCallDoc>('AiToolCall', AiToolCallSchema);

/** Monthly token meter — MONGO is the source of truth (fail closed, §19.6). */
export interface AiUsageDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  month: string; // '2026-07'
  tokensUsed: number;
}
const AiUsageSchema = new Schema<AiUsageDoc>(
  {
    month: { type: String, required: true },
    tokensUsed: { type: Number, default: 0 },
  },
  { versionKey: false },
);
AiUsageSchema.plugin(tenantScope);
AiUsageSchema.index({ companyId: 1, month: 1 }, { unique: true });
export const AiUsage = model<AiUsageDoc>('AiUsage', AiUsageSchema);
