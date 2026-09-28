/**
 * 빈 DB 에 시연 상태(관리자 계정, 기준 계정과 자료, 기본 agent·권한, 스킬 사용 수)를 만든다. 여러 번 실행해도 결과가 같다.
 * 사용법: node config/bootstrap-demo.js <baseline-dir> — BOOTSTRAP_ADMIN_EMAIL(기본 admin@admin.com)·BOOTSTRAP_PASSWORD 를 .env 에서 읽는다.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { MeiliSearch } = require('meilisearch');
const { createDemoSearchIndex } = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { processDeleteRequest } = require('~/server/services/Files/process');
const { File, Conversation, Message } = require('~/db/models');
const { getAppConfig } = require('~/server/services/Config');
const { createDemoData } = require('./demo-data');
const { createResetDemoFileDeleter } = require('./reset-demo-files');
const { silentExit } = require('./helpers');
const connect = require('./connect');

/** `api/server/services/AuthService.js` 의 가입 처리와 같은 salt 강도. */
const BCRYPT_ROUNDS = 10;

/** `librechat-config/docker-compose.override.yml` 의 DEMO_SWITCH_USERS 가 이 주소를 쓴다. */
const DEFAULT_ADMIN_EMAIL = 'admin@admin.com';

(async () => {
  const dir = process.argv[2] ?? process.env.DEMO_BASELINE_DIR;
  if (!dir) {
    console.red('Give the baseline folder (argument or DEMO_BASELINE_DIR).');
    silentExit(1);
  }

  // 로그인 검증(api/strategies/validators.js)보다 짧으면 만든 계정으로 로그인하지 못한다.
  const minLength = parseInt(process.env.MIN_PASSWORD_LENGTH, 10) || 8;
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (password && password.length < minLength) {
    console.red(`BOOTSTRAP_PASSWORD must be at least ${minLength} characters.`);
    silentExit(1);
  }

  await connect();
  const appConfig = await getAppConfig({ baseOnly: true });
  const rows = await createDemoData(mongoose).bootstrapDemo({
    dir: path.resolve(dir),
    adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
    password,
    hashPassword: (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
    deleteFiles: createResetDemoFileDeleter({
      File,
      appConfig,
      logger,
      processDeleteRequest,
      runAsSystem,
    }),
    searchIndex: createDemoSearchIndex({
      env: process.env,
      createClient: (config) => new MeiliSearch(config),
      models: { Conversation, Message },
      runAsSystem,
    }),
    warn: (message) => console.yellow(message),
  });
  rows.forEach(({ collection, created }) => console.purple(`${collection}: create ${created}`));
  console.green('Demo bootstrap complete.');
  silentExit(0);
})().catch(async (err) => {
  console.error('Demo bootstrap failed:');
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
