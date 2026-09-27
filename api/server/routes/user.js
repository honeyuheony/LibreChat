const express = require('express');
const {
  createUserPreferencesHandler,
  getWorkspacePreferencesHandler,
  createConnectorDefaultsHandler,
  createWorkspacePreferencesHandler,
} = require('@librechat/api');
const {
  updateUserPluginsController,
  resendVerificationController,
  getTermsStatusController,
  acceptTermsController,
  verifyEmailController,
  deleteUserController,
  getUserController,
} = require('~/server/controllers/UserController');
const {
  verifyEmailLimiter,
  verifyEmailSubmissionLimiter,
  configMiddleware,
  canDeleteAccount,
  requireJwtAuth,
} = require('~/server/middleware');

const settings = require('./settings');
const {
  updateUserConnectorDefaults,
  updateUserWorkspacePreferences,
  updateUserStatefulCodeEnvironment,
} = require('~/models');

const router = express.Router();

const updateUserPreferences = createUserPreferencesHandler({
  updateStatefulCodeEnvironment: updateUserStatefulCodeEnvironment,
});
const updateConnectorDefaults = createConnectorDefaultsHandler({
  updateConnectorDefaults: updateUserConnectorDefaults,
});
const updateWorkspacePreferences = createWorkspacePreferencesHandler({
  updateWorkspacePreferences: updateUserWorkspacePreferences,
});

router.use('/settings', settings);
router.get('/', requireJwtAuth, getUserController);
router.patch('/preferences', requireJwtAuth, configMiddleware, updateUserPreferences);
router.patch('/preferences/connectors', requireJwtAuth, updateConnectorDefaults);
router.get('/preferences/workspace', requireJwtAuth, getWorkspacePreferencesHandler);
router.patch('/preferences/workspace', requireJwtAuth, updateWorkspacePreferences);
router.get('/terms', requireJwtAuth, getTermsStatusController);
router.post('/terms/accept', requireJwtAuth, acceptTermsController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, configMiddleware, deleteUserController);
router.post('/verify', verifyEmailSubmissionLimiter, verifyEmailController);
router.post('/verify/resend', verifyEmailLimiter, resendVerificationController);

module.exports = router;
