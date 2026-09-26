import { Model } from 'mongoose';
import taskExtractionSchema, { ITaskExtractionDocument } from '~/schema/taskExtraction';
import taskSummarySchema, { ITaskSummaryDocument } from '~/schema/taskSummary';
import taskResultSchema, { ITaskResultDocument } from '~/schema/taskResult';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createTaskExtractionModel(
  mongoose: typeof import('mongoose'),
): Model<ITaskExtractionDocument> {
  applyTenantIsolation(taskExtractionSchema);
  return (
    mongoose.models.TaskExtraction ||
    mongoose.model<ITaskExtractionDocument>('TaskExtraction', taskExtractionSchema)
  );
}

export function createTaskSummaryModel(
  mongoose: typeof import('mongoose'),
): Model<ITaskSummaryDocument> {
  applyTenantIsolation(taskSummarySchema);
  return (
    mongoose.models.TaskSummary ||
    mongoose.model<ITaskSummaryDocument>('TaskSummary', taskSummarySchema)
  );
}

export function createTaskResultModel(
  mongoose: typeof import('mongoose'),
): Model<ITaskResultDocument> {
  applyTenantIsolation(taskResultSchema);
  return (
    mongoose.models.TaskResult ||
    mongoose.model<ITaskResultDocument>('TaskResult', taskResultSchema)
  );
}
