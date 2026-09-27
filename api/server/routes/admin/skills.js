const express = require('express');
const mongoose = require('mongoose');
const {
  createSkillMetricsHandler,
  getDeploymentSkillRegistry,
  createAdminSkillsSyncAccess,
  createAdminSkillsSyncHandlers,
} = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { hasCapability, requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const {
  countPublishedForks,
  getDeploymentSkillUsage,
  upsertSkillSyncCredential,
  deleteSkillSyncCredential,
  getSkillAuthorDepartments,
} = require('~/models');
const { getGitHubSkillSyncRunnerForRequest } = require('~/server/services/Skills/sync');
const { getAppConfig } = require('~/server/services/Config');
const configMiddleware = require('~/server/middleware/config/app');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const syncAccess = createAdminSkillsSyncAccess({
  getAppConfig,
  hasCapability,
});

const handlers = createAdminSkillsSyncHandlers({
  getRunner: getGitHubSkillSyncRunnerForRequest,
  upsertCredential: upsertSkillSyncCredential,
  deleteCredential: deleteSkillSyncCredential,
});

const metricsHandler = createSkillMetricsHandler({
  listUserSkills: () =>
    mongoose.models.Skill.find({})
      .select(
        'name displayTitle author authorName useCount runTimeTotalSeconds runTimeSampleCount manualMinutes forkOf',
      )
      .lean(),
  listDeploymentSkills: () => getDeploymentSkillRegistry().list(),
  countPublishedForks,
  getDeploymentSkillUsage,
  getSkillAuthorDepartments,
});

router.use(
  requireJwtAuth,
  requireAdminAccess,
  configMiddleware,
  syncAccess.attachBaseSkillSyncConfig,
);

router.get(
  '/sync/status',
  syncAccess.requireReadSkills,
  syncAccess.attachCredentialReadAccess,
  handlers.getSyncStatus,
);
router.get('/metrics', metricsHandler);
router.post('/sync/run', syncAccess.requireSyncRunCapability, handlers.runSync);
router.put(
  '/sync/credentials/:credentialKey',
  syncAccess.requirePlatformManageSkills,
  handlers.setCredential,
);
router.delete(
  '/sync/credentials/:credentialKey',
  syncAccess.requirePlatformManageSkills,
  handlers.deleteCredential,
);

module.exports = router;
