const express = require('express');
const {
  getDeskRelayConfig,
  createDeskStatusHandler,
  createDeskAppReleaseHandler,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.get('/desk-status', requireJwtAuth, createDeskStatusHandler(getDeskRelayConfig()));
// No auth: the sign-in screen links to the download page, which reads this.
router.get('/desk-app', createDeskAppReleaseHandler(getDeskRelayConfig()));

module.exports = router;
