const express = require('express');
const mongoose = require('mongoose');
const {
  buildTaskWorkbook,
  estimateTask,
  EXTRACT_PROMPT_VERSION,
  loadConversationDocuments,
  normalizeKey,
} = require('@librechat/api');
const { Conversation, TaskExtraction, TaskResult } = require('~/db/models');
const { getAgent, getConvo, getFiles, getMessages } = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth);

const TASK_RESULTS_PAGE_SIZE = 50;
const TASK_RESULTS_FETCH_SIZE = TASK_RESULTS_PAGE_SIZE + 1;

function getQueryFields(value) {
  if (Array.isArray(value)) {
    return value.filter((field) => typeof field === 'string');
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function parseTaskResultsCursor(value) {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return undefined;
  }
  try {
    const cursorData = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      cursorData == null ||
      typeof cursorData !== 'object' ||
      Array.isArray(cursorData) ||
      typeof cursorData.createdAt !== 'string' ||
      typeof cursorData.id !== 'string' ||
      !/^[a-f\d]{24}$/i.test(cursorData.id)
    ) {
      return undefined;
    }
    const createdAt = new Date(cursorData.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== cursorData.createdAt) {
      return undefined;
    }
    return { createdAt, id: new mongoose.Types.ObjectId(cursorData.id) };
  } catch {
    return undefined;
  }
}

function createTaskResultsFilter(userId, cursor) {
  if (cursor == null) {
    return { user: userId };
  }
  return {
    user: userId,
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  };
}

function encodeTaskResultsCursor(taskResult) {
  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(taskResult.createdAt).toISOString(),
      id: String(taskResult._id),
    }),
  ).toString('base64url');
}

function toTaskResultListItem(taskResult, conversationTitle) {
  const storedResult = taskResult.result;
  const listItem = {
    resultId: taskResult.resultId,
    conversationId: taskResult.conversationId,
    conversationTitle,
    kind: taskResult.kind,
    title: storedResult.title,
    createdAt: taskResult.createdAt,
  };
  if (taskResult.kind === 'table' && Array.isArray(storedResult.rows)) {
    listItem.rows = storedResult.rows.length;
  }
  if (taskResult.kind === 'report' && typeof storedResult.file?.filename === 'string') {
    listItem.fileName = storedResult.file.filename;
  }
  return listItem;
}

function findOwnTaskResult(req) {
  return TaskResult.findOne({ user: req.user.id, resultId: req.params.resultId }).lean();
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
    const [docs, conversation, previousResult] = await Promise.all([
      loadConversationDocuments({ userId, conversationId, getMessages, getFiles }),
      getConvo(userId, conversationId),
      TaskResult.findOne({ user: userId, conversationId, kind: 'table' })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    const agent = conversation?.agent_id ? await getAgent({ id: conversation.agent_id }) : null;
    const agentModel = agent?.model_parameters?.model;
    const model =
      (typeof agentModel === 'string' && agentModel) ||
      agent?.model ||
      conversation?.model ||
      previousResult?.result?.extractor?.model;
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

router.get('/results', async (req, res, next) => {
  const cursor = parseTaskResultsCursor(req.query.cursor);
  if (cursor === undefined) {
    return res.status(400).json({ error: 'Invalid cursor.' });
  }
  try {
    const userId = req.user.id;
    const taskResults = await TaskResult.find(createTaskResultsFilter(userId, cursor))
      .sort({ createdAt: -1, _id: -1 })
      .limit(TASK_RESULTS_FETCH_SIZE)
      .lean();
    const conversations = taskResults.length
      ? await Conversation.find({
          user: userId,
          conversationId: {
            $in: [...new Set(taskResults.map(({ conversationId }) => conversationId))],
          },
          isArchived: { $ne: true },
        })
          .select('conversationId title')
          .lean()
      : [];
    const conversationsById = new Map(
      conversations.map((conversation) => [conversation.conversationId, conversation]),
    );
    const listEntries = [];
    for (const taskResult of taskResults) {
      const conversation = conversationsById.get(taskResult.conversationId);
      if (!conversation) {
        continue;
      }
      listEntries.push({
        taskResult,
        item: toTaskResultListItem(taskResult, conversation.title),
      });
    }
    const pageEntries = listEntries.slice(0, TASK_RESULTS_PAGE_SIZE);
    const hasMore =
      listEntries.length > TASK_RESULTS_PAGE_SIZE || taskResults.length > TASK_RESULTS_PAGE_SIZE;
    const lastReturned = pageEntries[pageEntries.length - 1];
    const cursorResult =
      listEntries.length > TASK_RESULTS_PAGE_SIZE
        ? pageEntries[pageEntries.length - 1].taskResult
        : (lastReturned?.taskResult ?? taskResults[TASK_RESULTS_PAGE_SIZE]);
    return res.json({
      results: pageEntries.map(({ item }) => item),
      nextCursor: hasMore && cursorResult ? encodeTaskResultsCursor(cursorResult) : null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/results/:resultId/export.xlsx', async (req, res, next) => {
  try {
    const taskResult = await findOwnTaskResult(req);
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
    const taskResult = await findOwnTaskResult(req);
    if (!taskResult) {
      return res.status(404).json({ error: 'Task result not found.' });
    }
    return res.json(taskResult.result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
