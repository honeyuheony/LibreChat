const express = require('express');
const { createDeskStatusHandler, getDeskRelayConfig } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.get('/desk-status', requireJwtAuth, createDeskStatusHandler(getDeskRelayConfig()));

module.exports = router;
