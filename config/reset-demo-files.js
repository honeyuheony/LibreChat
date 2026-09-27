const createResetDemoFileDeleter =
  ({ appConfig, processDeleteRequest, runAsSystem }) =>
  (user, files) =>
    runAsSystem(() =>
      processDeleteRequest({
        req: {
          user: { id: String(user._id), email: user.email, tenantId: user.tenantId },
          config: appConfig,
          body: {},
        },
        files,
      }),
    );

module.exports = { createResetDemoFileDeleter };
