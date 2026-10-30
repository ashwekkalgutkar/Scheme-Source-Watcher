/**
 * Scheme Source Watcher - Database Connection
 *
 * If MONGO_URI is unset, boots an in-memory Mongo using mongodb-memory-server.
 * Uses local system binary if available to ensure instant startup.
 */

const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServerInstance = null;

async function connectDb(uri) {
  const targetUri = uri || process.env.MONGO_URI;

  if (targetUri) {
    console.log(`Connecting to MongoDB at: ${targetUri}`);
    await mongoose.connect(targetUri);
    return targetUri;
  }

  console.log('MONGO_URI is unset. Booting in-memory MongoDB server...');

  // Check if system binary exists for fast local start
  const defaultSystemBinary = 'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe';
  if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(defaultSystemBinary)) {
    process.env.MONGOMS_SYSTEM_BINARY = defaultSystemBinary;
  }

  const memoryServerOptions = {
    instance: {
      storageEngine: 'wiredTiger'
    }
  };

  mongoServerInstance = await MongoMemoryServer.create(memoryServerOptions);
  const inMemoryUri = mongoServerInstance.getUri();
  console.log(`In-memory MongoDB started at: ${inMemoryUri}`);

  await mongoose.connect(inMemoryUri);
  return inMemoryUri;
}

async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServerInstance) {
    await mongoServerInstance.stop();
    mongoServerInstance = null;
  }
}

module.exports = {
  connectDb,
  disconnectDb
};
