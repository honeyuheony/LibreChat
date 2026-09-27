const path = require('path');
const express = require('express');
const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { SystemRoles, CacheKeys } = require('librechat-data-provider');
const { logger, runAsSystem, DEFAULT_REFRESH_TOKEN_EXPIRY } = require('@librechat/data-schemas');
const { math, shouldUseSecureCookie, invalidateCachedAuthUserDoc } = require('@librechat/api');
const { requireJwtAuth, requireSameOrigin, checkBan } = require('~/server/middleware');
const { setAuthTokens, logoutUser } = require('~/server/services/AuthService');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { getAppConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { findUser } = require('~/models');
const { File } = require('~/db/models');
const { createDemoData, resolveProtectedEmails } = require(
  path.resolve(__dirname, '..', '..', '..', 'config', 'demo-data'),
);

const SWITCH_ORIGIN_COOKIE = 'demo_switch_origin';
const SWITCH_ORIGIN_AUDIENCE = 'librechat-demo-switch';
const DEFAULT_BASELINE_DIR = '/app/demo-baseline';

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

/** Admins named in DEMO_SWITCH_USERS may reset; the list's other accounts are the targets. */
const canReset = (user) =>
  user.role === SystemRoles.ADMIN && getSwitchUsers().includes(user.email?.toLowerCase());

const getResetTargets = () => {
  const protectedEmails = resolveProtectedEmails(process.env.DEMO_RESET_PROTECTED);
  return {
    emails: getSwitchUsers().filter((email) => !protectedEmails.has(email)),
    protectedEmails,
  };
};

/** File ids that another account's File document also carries. */
const findSharedFileIds = async (user, files) => {
  const owners = [user._id, String(user._id)];
  const shared = await File.find(
    { file_id: { $in: files.map((file) => file.file_id) }, user: { $nin: owners } },
    'file_id',
  ).lean();
  return new Set(shared.map((file) => file.file_id));
};

/**
 * Deletes originals the way `config/reset-demo.js` does, outside the caller's tenant scope.
 * processDeleteRequest removes File documents and agent references by file_id alone, so a
 * file_id another account also holds is skipped and reported back as failed.
 */
const createFileDeleter = (appConfig) => (user, files) =>
  runAsSystem(async () => {
    const sharedIds = await findSharedFileIds(user, files);
    if (sharedIds.size > 0) {
      logger.warn(
        `[demo] ${user.email}: file ids also held by another account, kept: ${[...sharedIds].join(', ')}`,
      );
    }
    const deletable = files.filter((file) => !sharedIds.has(file.file_id));
    const result =
      deletable.length > 0
        ? await processDeleteRequest({
            req: {
              user: { id: String(user._id), email: user.email, tenantId: user.tenantId },
              config: appConfig,
              body: {},
            },
            files: deletable,
          })
        : {};
    return { ...result, failedFileIds: [...(result.failedFileIds ?? []), ...sharedIds] };
  });

/** Reset rewrites profile fields on the user document, so cached `req.user` copies must go. */
const invalidateResetUsers = async (rows) => {
  const emails = [...new Set(rows.filter((row) => row.collection === 'users').map((r) => r.email))];
  const store = getLogStores(CacheKeys.AUTH_USER_DOC);
  const users = await Promise.all(emails.map((email) => findUser({ email }, '_id')));
  await Promise.all(
    users
      .filter(Boolean)
      .map((user) => invalidateCachedAuthUserDoc(store, { userId: user._id.toString() })),
  );
};

/** One reset per process; a second request while one runs gets 409. */
let resetInProgress = false;

router.post('/reset', requireSameOrigin, async (req, res) => {
  if (!canReset(req.user)) {
    return res.status(403).json({ message: 'Demo reset is not allowed' });
  }
  const { emails, protectedEmails } = getResetTargets();
  if (emails.length === 0) {
    return res.status(409).json({ message: 'No demo account to reset' });
  }
  if (resetInProgress) {
    return res.status(409).json({ message: 'Demo reset already in progress' });
  }

  resetInProgress = true;
  try {
    const appConfig = await getAppConfig({ baseOnly: true });
    const rows = await createDemoData(mongoose).resetDemo({
      dir: process.env.DEMO_BASELINE_DIR || DEFAULT_BASELINE_DIR,
      emails,
      includeShared: false,
      dryRun: false,
      protectedEmails,
      deleteFiles: createFileDeleter(appConfig),
      warn: (message) => logger.warn(`[demo] ${message}`),
    });
    /** The reset already happened; a stale cached `req.user` expires with its TTL. */
    await invalidateResetUsers(rows).catch((error) =>
      logger.warn('[demo] Reset done but clearing the auth user cache failed', error),
    );
    logger.info(`[demo] reset by ${req.user.email}: ${emails.join(', ')}`);
    return res.status(200).json({ rows });
  } catch (error) {
    logger.error('[demo] Failed to reset the demo accounts', error);
    return res.status(500).json({ message: 'Failed to reset the demo accounts' });
  } finally {
    resetInProgress = false;
  }
});

module.exports = router;
