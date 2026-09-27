const path = require('path');
const express = require('express');
const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MeiliSearch } = require('meilisearch');
const { SystemRoles, CacheKeys } = require('librechat-data-provider');
const { logger, runAsSystem, DEFAULT_REFRESH_TOKEN_EXPIRY } = require('@librechat/data-schemas');
const {
  math,
  shouldUseSecureCookie,
  invalidateCachedAuthUserDoc,
  createDemoFileDeleter,
  createDemoSearchIndex,
} = require('@librechat/api');
const { requireJwtAuth, requireSameOrigin, checkBan } = require('~/server/middleware');
const { setAuthTokens, logoutUser } = require('~/server/services/AuthService');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { getAppConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { findUser } = require('~/models');
const { File, Conversation, Message } = require('~/db/models');
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

/** 현재 사용자가 전환해 들어갈 계정을 찾는다. null 이면 경로를 숨긴다(404). */
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

/** 관리자 계정으로는 바로 그 관리자에게서 전환해 나온 session 만 돌아갈 수 있다. */
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

    /** refresh token 없이 logoutUser 를 부르면 그 사용자의 모든 session 이 걸리므로 그때는 건너뛴다. */
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

/** DEMO_SWITCH_USERS 에 든 관리자만 초기화할 수 있고, 목록의 나머지 계정이 초기화 대상이다. */
const canReset = (user) =>
  user.role === SystemRoles.ADMIN && getSwitchUsers().includes(user.email?.toLowerCase());

const getResetTargets = () => {
  const protectedEmails = resolveProtectedEmails(process.env.DEMO_RESET_PROTECTED);
  return {
    emails: getSwitchUsers().filter((email) => !protectedEmails.has(email)),
    protectedEmails,
  };
};

/** 초기화가 사용자 문서의 프로필 필드를 다시 쓰므로 캐시된 `req.user` 를 비운다. */
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

/** 프로세스마다 초기화는 한 번에 하나만 돈다. 도는 중에 온 요청은 409 를 받는다. */
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
      deleteFiles: createDemoFileDeleter({
        File,
        processDeleteRequest,
        runAsSystem,
        logger,
        appConfig,
      }),
      searchIndex: createDemoSearchIndex({
        env: process.env,
        createClient: (config) => new MeiliSearch(config),
        models: { Conversation, Message },
        runAsSystem,
      }),
      warn: (message) => logger.warn(`[demo] ${message}`),
    });
    /** 초기화는 이미 끝났으므로, 남은 `req.user` 캐시는 TTL 이 지나면 사라진다. */
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
