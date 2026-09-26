import mongoose, { Schema, Document, Types } from 'mongoose';
import type { TaskResult } from 'librechat-data-provider';

export interface ITaskResultDocument extends Document {
  user: Types.ObjectId;
  tenantId?: string;
  conversationId: string;
  resultId: string;
  kind: TaskResult['kind'];
  result: TaskResult;
  createdAt?: Date;
  updatedAt?: Date;
}

const taskResultSchema: Schema<ITaskResultDocument> = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
    },
    resultId: {
      type: String,
      required: true,
    },
    kind: {
      type: String,
      enum: ['table', 'summary', 'report'],
      required: true,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
);

taskResultSchema.index({ user: 1, tenantId: 1, conversationId: 1, resultId: 1 }, { unique: true });
taskResultSchema.index({ user: 1, tenantId: 1, conversationId: 1, createdAt: -1 });

export default taskResultSchema;
