/**
 * Restores the demo accounts from a baseline folder written by `export-demo-baseline.js`.
 * Usage: node config/reset-demo.js <baseline-dir> [--users a@x,b@y] [--include-shared] [--dry-run]
 */
const path = require('path');
const mongoose = require('mongoose');
const { MeiliSearch } = require('meilisearch');
const { createDemoSearchIndex } = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { processDeleteRequest } = require('~/server/services/Files/process');
const { File, Conversation, Message } = require('~/db/models');
const { getAppConfig } = require('~/server/services/Config');
const { parseCliArgs, createDemoData } = require('./demo-data');
const { createResetDemoFileDeleter } = require('./reset-demo-files');
const { silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  const { dir, emails, includeShared, dryRun, protectedEmails } = parseCliArgs(
    process.argv.slice(2),
    process.env,
  );
  if (!dir || emails.length === 0) {
    console.red('Give the baseline folder and target accounts (--users or DEMO_RESET_USERS).');
    silentExit(1);
  }

  await connect();
  const appConfig = dryRun ? undefined : await getAppConfig({ baseOnly: true });
  const deleteFiles = createResetDemoFileDeleter({
    File,
    appConfig,
    logger,
    processDeleteRequest,
    runAsSystem,
  });

  const rows = await createDemoData(mongoose).resetDemo({
    dir: path.resolve(dir),
    emails,
    includeShared,
    dryRun,
    protectedEmails,
    deleteFiles,
    searchIndex: createDemoSearchIndex({
      env: process.env,
      createClient: (config) => new MeiliSearch(config),
      models: { Conversation, Message },
      runAsSystem,
    }),
    warn: (message) => console.yellow(message),
  });
  rows.forEach(({ email, collection, deleted, replaced, created }) =>
    console.purple(
      `${email ?? '(shared)'} ${collection}: delete ${deleted}, replace ${replaced}, create ${created}`,
    ),
  );
  console.green(dryRun ? 'Dry run: no changes written.' : 'Demo reset complete.');
  silentExit(0);
})().catch(async (err) => {
  console.error('Demo reset failed:');
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
