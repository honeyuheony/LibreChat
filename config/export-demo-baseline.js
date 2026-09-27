/**
 * Writes the demo accounts' data to a baseline folder that `reset-demo.js` restores from.
 * Usage: node config/export-demo-baseline.js <output-dir> [--users a@x,b@y] [--include-shared]
 */
const path = require('path');
const mongoose = require('mongoose');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { parseCliArgs, createDemoData } = require('./demo-data');
const { silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  const { dir, emails, includeShared, protectedEmails } = parseCliArgs(
    process.argv.slice(2),
    process.env,
  );
  if (!dir || emails.length === 0) {
    console.red('Give the output folder and target accounts (--users or DEMO_RESET_USERS).');
    silentExit(1);
  }

  await connect();
  const counts = await createDemoData(mongoose).exportBaseline({
    dir: path.resolve(dir),
    emails,
    includeShared,
    protectedEmails,
    warn: (message) => console.yellow(message),
  });
  Object.entries(counts).forEach(([file, count]) => console.purple(`${file}: ${count}`));
  console.green(`Baseline written to ${path.resolve(dir)}`);
  silentExit(0);
})().catch(async (err) => {
  console.error('Baseline export failed:');
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
