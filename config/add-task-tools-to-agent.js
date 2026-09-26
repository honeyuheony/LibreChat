/**
 * Adds the document task tools (extract_table, summarize_documents, write_report) to one agent.
 * Usage: node config/add-task-tools-to-agent.js [agent_id] [--dry-run]
 */
const path = require('path');
const mongoose = require('mongoose');
const { TaskTools } = require('librechat-data-provider');
const { Agent } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');

/** Demo default agent (`librechat.yaml` modelSpecs); pass another id as the first argument. */
const DEFAULT_AGENT_ID = 'agent_mFf0h9SHTwJ6za2e8HUiv';

(async () => {
  await connect();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const agentId = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_AGENT_ID;
  const taskTools = Object.values(TaskTools);

  const agent = await Agent.findOne({ id: agentId }, { id: 1, name: 1, tools: 1 }).lean();
  if (!agent) {
    console.red(`Agent "${agentId}" not found.`);
    silentExit(1);
  }

  const current = agent.tools ?? [];
  const missing = taskTools.filter((name) => !current.includes(name));
  console.purple(`Agent ${agent.id} (${agent.name ?? 'unnamed'})`);
  console.purple(`Current tools: ${current.join(', ') || '(none)'}`);
  if (missing.length === 0) {
    console.green('All task tools are already present. Nothing to change.');
    silentExit(0);
  }
  console.purple(`Tools to add: ${missing.join(', ')}`);
  if (dryRun) {
    console.orange('Dry run: no changes written.');
    silentExit(0);
  }

  await Agent.updateOne({ id: agentId }, { $addToSet: { tools: { $each: missing } } });
  const updated = await Agent.findOne({ id: agentId }, { tools: 1 }).lean();
  const stillMissing = taskTools.filter((name) => !(updated?.tools ?? []).includes(name));
  if (stillMissing.length > 0) {
    console.red(`Update did not take effect for: ${stillMissing.join(', ')}`);
    silentExit(1);
  }
  console.green(`Updated tools: ${updated.tools.join(', ')}`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }
  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});
