const express = require('express');
const {
  buildTaskWorkbook,
  estimateTask,
  EXTRACT_PROMPT_VERSION,
  loadConversationDocuments,
  normalizeKey,
} = require('@librechat/api');
const { TaskExtraction, TaskResult } = require('~/db');
const { getFiles, getMessages } = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

function getQueryFields(value) {
  if (Array.isArray(value)) {
    return value.filter((field) => typeof field === 'string');
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

router.get('/estimate', async (req, res, next) => {
  const { conversationId, kind } = req.query;
  if (typeof conversationId !== 'string' || kind !== 'table') {
    return res.status(400).json({ error: 'A conversationId and table kind are required.' });
  }
  const fields = getQueryFields(req.query.fields).map(normalizeKey).filter(Boolean);
  if (fields.length === 0) {
    return res.status(400).json({ error: 'At least one field is required.' });
  }
  try {
    const userId = req.user.id;
    const docs = await loadConversationDocuments({
      userId,
      conversationId,
      getMessages,
      getFiles,
    });
    const previousResult = await TaskResult.findOne({ user: userId, conversationId, kind: 'table' })
      .sort({ createdAt: -1 })
      .lean();
    const model = previousResult?.result?.extractor?.model;
    const cachedCells = model
      ? await TaskExtraction.find({
          user: userId,
          fileId: { $in: docs.map((doc) => doc.file_id) },
          field: { $in: fields },
          promptVersion: EXTRACT_PROMPT_VERSION,
          model,
        })
          .select({ fileId: 1, textHash: 1, field: 1 })
          .lean()
      : [];
    return res.json(estimateTask({ docs, fields, cachedCells }));
  } catch (error) {
    return next(error);
  }
});

router.get('/results/:resultId/export.xlsx', async (req, res, next) => {
  try {
    const taskResult = await TaskResult.findOne({
      user: req.user.id,
      resultId: req.params.resultId,
    }).lean();
    if (!taskResult || taskResult.kind !== 'table') {
      return res.status(404).json({ error: 'Task result not found.' });
    }
    const workbook = buildTaskWorkbook(taskResult.result);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="task-result.xlsx"');
    return res.send(workbook);
  } catch (error) {
    return next(error);
  }
});

router.get('/results/:resultId', async (req, res, next) => {
  try {
    const taskResult = await TaskResult.findOne({
      user: req.user.id,
      resultId: req.params.resultId,
    }).lean();
    if (!taskResult) {
      return res.status(404).json({ error: 'Task result not found.' });
    }
    return res.json(taskResult.result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
