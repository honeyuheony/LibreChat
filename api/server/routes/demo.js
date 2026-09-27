const express = require('express');
const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const { SystemRoles } = require('librechat-data-provider');
const { math, shouldUseSecureCookie } = require('@librechat/api');
const { logger, DEFAULT_REFRESH_TOKEN_EXPIRY } = require('@librechat/data-schemas');
const { requireJwtAuth, requireSameOrigin, checkBan } = require('~/server/middleware');
const { setAuthTokens, logoutUser } = require('~/server/services/AuthService');
const { findUser } = require('~/models');

const SWITCH_ORIGIN_COOKIE = 'demo_switch_origin';
const SWITCH_ORIGIN_AUDIENCE = 'librechat-demo-switch';

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
  return findUser({ email: targetEmail }, '_id name email department role twoFactorEnabled');
};

const readSwitchOrigin = (req) => {
  const parsedCookies = req.headers.cookie ? cookies.parse(req.headers.cookie) : {};
  const marker = parsedCookies[SWITCH_ORIGIN_COOKIE];
  if (!marker) {
    return null;
  }
  try {
    return jwt.verify(marker, process.env.JWT_SECRET, { audience: SWITCH_ORIGIN_AUDIENCE });
  } catch {
    return null;
  }
};

/** An admin target is reachable only by the session that switched away from that same admin. */
const canSwitchTo = (req, target) => {
  if (target.twoFactorEnabled) {
    return false;
  }
  if (target.role !== SystemRoles.ADMIN) {
    return true;
  }
  const origin = readSwitchOrigin(req);
  return origin?.from === target._id.toString() && origin?.to === req.user.id;
};

const rememberSwitchOrigin = (res, fromUserId, toUserId) => {
  const expiresIn = math(process.env.REFRESH_TOKEN_EXPIRY, DEFAULT_REFRESH_TOKEN_EXPIRY);
  const marker = jwt.sign({ from: fromUserId, to: toUserId }, process.env.JWT_SECRET, {
    audience: SWITCH_ORIGIN_AUDIENCE,
    expiresIn: Math.floor(expiresIn / 1000),
  });
  res.cookie(SWITCH_ORIGIN_COOKIE, marker, {
    expires: new Date(Date.now() + expiresIn),
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'strict',
  });
};

const toTargetSummary = (target) => ({ name: target.name, department: target.department });

router.use((_req, _res, next) => (getSwitchUsers().length ? next() : next('router')));
router.use(requireJwtAuth);
router.use(checkBan);

router.get('/switch-user', async (req, res) => {
  try {
    const target = await findSwitchTarget(req.user);
    if (!target || !canSwitchTo(req, target)) {
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
    if (!canSwitchTo(req, target)) {
      return res.status(403).json({ message: 'Switching to this account is not allowed' });
    }

    /** logoutUser without a refresh token matches any session of the user, so skip it then. */
    const previousRefreshToken = cookies.parse(req.headers.cookie ?? '').refreshToken;
    if (previousRefreshToken) {
      const logout = await logoutUser(req, previousRefreshToken);
      if (logout.status !== 200) {
        logger.error('[demo] Failed to end the previous session before switching', logout.message);
        return res.status(500).json({ message: 'Failed to switch user' });
      }
    }

    const token = await setAuthTokens(target._id, res, null, req);
    if (target.role === SystemRoles.ADMIN) {
      res.clearCookie(SWITCH_ORIGIN_COOKIE);
    } else {
      rememberSwitchOrigin(res, req.user.id, target._id.toString());
    }
    logger.info(`[demo] switch-user ${req.user.email} -> ${target.email}`);
    return res.status(200).json({ token, target: toTargetSummary(target) });
  } catch (error) {
    logger.error('[demo] Failed to switch user', error);
    return res.status(500).json({ message: 'Failed to switch user' });
  }
});

module.exports = router;
