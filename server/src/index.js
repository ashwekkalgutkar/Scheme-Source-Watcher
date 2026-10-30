/**
 * Scheme Source Watcher - Server Entry Point
 */

require('dotenv').config();
const app = require('./app');
const { connectDb, disconnectDb } = require('./db');
const { startScheduler, stopScheduler } = require('./scheduler');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // 1. Connect to Mongo (or boot in-memory Mongo if unset)
    await connectDb();

    // 2. Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`Scheme Source Watcher Server listening on port ${PORT}`);
      console.log(`API Base: http://localhost:${PORT}/api`);
      console.log(`===============================================`);
    });

    // 3. Start cron scheduler
    startScheduler();

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down server...');
      stopScheduler();
      server.close(async () => {
        await disconnectDb();
        console.log('Server and database shut down gracefully.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
