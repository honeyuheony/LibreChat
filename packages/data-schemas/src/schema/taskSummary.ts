import mongoose, { Schema, Document, Types } from 'mongoose';

export type TaskSummaryPoint = { id: string; text: string; quote: string };

export interface ITaskSummaryDocument extends Omit<Document, 'model'> {
  user: Types.ObjectId;
  tenantId?: string;
  fileId: string;
  textHash: string;
  view: string;
  promptVersion: string;
  model: string;
  summary: string;
  oneLine: string;
  points: TaskSummaryPoint[];
  createdAt?: Date;
  updatedAt?: Date;
}

const taskSummaryPointSchema = new Schema<TaskSummaryPoint>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    quote: { type: String, required: true },
  },
  { _id: false },
);

const taskSummarySchema: Schema<ITaskSummaryDocument> = new Schema(
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
    view: {
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
    summary: {
      type: String,
      required: true,
    },
    oneLine: {
      type: String,
      required: true,
    },
    points: {
      type: [taskSummaryPointSchema],
      required: true,
    },
  },
  { timestamps: true },
);

taskSummarySchema.index(
  { user: 1, tenantId: 1, fileId: 1, textHash: 1, view: 1, promptVersion: 1, model: 1 },
  { unique: true },
);

export default taskSummarySchema;
