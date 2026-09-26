import mongoose, { Schema, Document, Types } from 'mongoose';
import type { TaskCell } from 'librechat-data-provider';

export interface ITaskExtractionDocument extends Omit<Document, 'model'> {
  user: Types.ObjectId;
  tenantId?: string;
  fileId: string;
  textHash: string;
  field: string;
  promptVersion: string;
  model: string;
  cell: TaskCell;
  createdAt?: Date;
  updatedAt?: Date;
}

const taskExtractionSchema: Schema<ITaskExtractionDocument> = new Schema(
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
    fileId: {
      type: String,
      required: true,
    },
    textHash: {
      type: String,
      required: true,
    },
    field: {
      type: String,
      required: true,
    },
    promptVersion: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    cell: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
);

taskExtractionSchema.index(
  { user: 1, tenantId: 1, fileId: 1, textHash: 1, field: 1, promptVersion: 1, model: 1 },
  { unique: true },
);

export default taskExtractionSchema;
