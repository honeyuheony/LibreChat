const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth, requireSameOrigin } = require('~/server/middleware');
const { setAuthTokens } = require('~/server/services/AuthService');
const { findUser } = require('~/models');

const router = express.Router();

const getSwitchUsers = () => [
  ...new Set(
    (process.env.DEMO_SWITCH_USERS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
];

/** Resolves the account the current user switches to; null keeps the route hidden (404). */
const findSwitchTarget = async (user) => {
  const switchUsers = getSwitchUsers();
  const index = switchUsers.indexOf(user.email?.toLowerCase());
  if (index === -1 || switchUsers.length < 2) {
    return null;
  }
  const targetEmail = switchUsers[(index + 1) % switchUsers.length];
  return findUser({ email: targetEmail }, '_id name email department');
};

const toTargetSummary = (target) => ({ name: target.name, department: target.department });

router.use((_req, _res, next) => (getSwitchUsers().length ? next() : next('router')));
router.use(requireJwtAuth);

router.get('/switch-user', async (req, res) => {
  try {
    const target = await findSwitchTarget(req.user);
    if (!target) {
      return res.status(404).json({ message: 'Not found' });
    }
    return res.status(200).json({ target: toTargetSummary(target) });
  } catch (error) {
    logger.error('[demo] Failed to read the switch-user target', error);
    return res.status(500).json({ message: 'Failed to read the switch-user target' });
  }
});

router.post('/switch-user', requireSameOrigin, async (req, res) => {
  try {
    const target = await findSwitchTarget(req.user);
    if (!target) {
      return res.status(404).json({ message: 'Not found' });
    }
    const token = await setAuthTokens(target._id, res, null, req);
    logger.info(`[demo] switch-user ${req.user.email} -> ${target.email}`);
    return res.status(200).json({ token, target: toTargetSummary(target) });
  } catch (error) {
    logger.error('[demo] Failed to switch user', error);
    return res.status(500).json({ message: 'Failed to switch user' });
  }
});

module.exports = router;
