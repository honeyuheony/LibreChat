const express = require('express');
const { escapeRegExp } = require('lodash');
const { Constants } = require('librechat-data-provider');
const {
  getDeskRelayConfig,
  createDeskStatusHandler,
  createDeskPermissionsHandler,
  createDeskAppReleaseHandler,
  createConnectorActivityHandler,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const { Message, Conversation } = require('~/db/models');

const router = express.Router();

router.get('/desk-status', requireJwtAuth, createDeskStatusHandler(getDeskRelayConfig()));
router.get('/desk-permissions', requireJwtAuth, createDeskPermissionsHandler(getDeskRelayConfig()));
router.get(
  '/activity',
  requireJwtAuth,
  createConnectorActivityHandler({
    findToolCallMessages: (userId, limit) =>
      Message.find({
        user: userId,
        'content.tool_call.name': { $regex: escapeRegExp(Constants.mcp_delimiter) },
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select({ conversationId: 1, createdAt: 1, 'content.type': 1, 'content.tool_call.name': 1 })
        .lean(),
    findConversationTitles: (userId, conversationIds) =>
      Conversation.find({ user: userId, conversationId: { $in: conversationIds } })
        .select({ conversationId: 1, title: 1 })
        .lean(),
  }),
);
// 로그인 화면에서 여는 다운로드 페이지가 읽으므로 인증을 걸지 않는다.
router.get('/desk-app', createDeskAppReleaseHandler(getDeskRelayConfig()));

module.exports = router;
