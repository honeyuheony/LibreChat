const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const logViolation = require('~/cache/logViolation');

/**
 * 스킬 편집기의 AI 초안 요청(POST /api/skills/draft) 한도. 편집기는 입력이 약 1초 멈출 때마다 부른다.
 * 검증 안 됨: 사용자 30회/분은 그 호출 빈도를 보고 정한 값, IP 300회/분은 한 사무실이 IP 하나를
 * 나눠 쓰는 경우를 막지 않으려고 넉넉히 잡은 값이며 둘 다 이 환경에서 측정하지 않았다.
 */
const getEnvironmentVariables = () => {
  const DRAFT_IP_MAX = parseInt(process.env.DRAFT_IP_MAX) || 300;
  const DRAFT_IP_WINDOW = parseInt(process.env.DRAFT_IP_WINDOW) || 1;
  const DRAFT_USER_MAX = parseInt(process.env.DRAFT_USER_MAX) || 30;
  const DRAFT_USER_WINDOW = parseInt(process.env.DRAFT_USER_WINDOW) || 1;
  const DRAFT_VIOLATION_SCORE = process.env.DRAFT_VIOLATION_SCORE;

  const draftIpWindowMs = DRAFT_IP_WINDOW * 60 * 1000;
  const draftUserWindowMs = DRAFT_USER_WINDOW * 60 * 1000;

  return {
    draftIpWindowMs,
    draftIpMax: DRAFT_IP_MAX,
    draftIpWindowInMinutes: draftIpWindowMs / 60000,
    draftUserWindowMs,
    draftUserMax: DRAFT_USER_MAX,
    draftUserWindowInMinutes: draftUserWindowMs / 60000,
    draftViolationScore: DRAFT_VIOLATION_SCORE,
  };
};

const createDraftHandler = (ip = true) => {
  const {
    draftIpMax,
    draftUserMax,
    draftViolationScore,
    draftIpWindowInMinutes,
    draftUserWindowInMinutes,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.SKILL_DRAFT_LIMIT;
    const errorMessage = {
      type,
      max: ip ? draftIpMax : draftUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? draftIpWindowInMinutes : draftUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, draftViolationScore);
    res.status(429).json({ message: 'Too many draft requests. Try again later' });
  };
};

const createDraftLimiters = () => {
  const { draftIpWindowMs, draftIpMax, draftUserWindowMs, draftUserMax } =
    getEnvironmentVariables();

  const draftIpLimiter = rateLimit({
    windowMs: draftIpWindowMs,
    max: draftIpMax,
    handler: createDraftHandler(),
    keyGenerator: removePorts,
    store: limiterCache('draft_ip_limiter'),
  });
  const draftUserLimiter = rateLimit({
    windowMs: draftUserWindowMs,
    max: draftUserMax,
    handler: createDraftHandler(false),
    keyGenerator: function (req) {
      return req.user?.id;
    },
    store: limiterCache('draft_user_limiter'),
  });
  return { draftIpLimiter, draftUserLimiter };
};

module.exports = { createDraftLimiters };
