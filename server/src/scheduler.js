/**
 * Scheme Source Watcher - Scheduler
 *
 * Runs periodic checks using node-cron.
 * Respects per-source checkIntervalMinutes (default 60).
 */

const cron = require('node-cron');
const Source = require('./models/Source');
const { checkSource } = require('./checker');

let scheduledTask = null;

/**
 * Check all active sources that are due for a check
 */
async function runDueChecks() {
  try {
    const sources = await Source.find({});
    const now = Date.now();

    for (const source of sources) {
      const intervalMs = (source.checkIntervalMinutes || 60) * 60 * 1000;
      const lastChecked = source.lastCheckedAt ? new Date(source.lastCheckedAt).getTime() : 0;

      if (now - lastChecked >= intervalMs) {
        try {
          await checkSource(source);
        } catch (err) {
          console.error(`Error checking source ${source.name} (${source.slug}):`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error in scheduler runDueChecks:', err.message);
  }
}

/**
 * Start the cron scheduler
 * Default: every 1 minute checks for due sources, or custom cron expression
 */
function startScheduler(cronExpression = '*/1 * * * *') {
  if (scheduledTask) {
    scheduledTask.stop();
  }

  const expr = process.env.CRON_SCHEDULE || cronExpression;
  console.log(`Starting scheduler with expression: ${expr}`);

  scheduledTask = cron.schedule(expr, async () => {
    await runDueChecks();
  });

  return scheduledTask;
}

function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runDueChecks
};
