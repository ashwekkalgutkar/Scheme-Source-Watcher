/**
 * Scheme Source Watcher - Database Connection
 *
 * Connects to MONGO_URI if provided.
 * If unset or if remote connection fails (e.g., Atlas IP whitelist),
 * automatically boots an in-memory Mongo using mongodb-memory-server.
 */

const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServerInstance = null;

async function startInMemoryMongo() {
  console.log('Booting in-memory MongoDB server...');

  // Check if system binary exists for fast local start
  const defaultSystemBinary = 'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe';
  if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(defaultSystemBinary)) {
    process.env.MONGOMS_SYSTEM_BINARY = defaultSystemBinary;
  }

  const memoryServerOptions = {
    instance: {
      storageEngine: 'wiredTiger'
    },
    spawn: {
      timeout: 30000
    }
  };

  mongoServerInstance = await MongoMemoryServer.create(memoryServerOptions);
  const inMemoryUri = mongoServerInstance.getUri();
  console.log(`In-memory MongoDB started at: ${inMemoryUri}`);

  await mongoose.connect(inMemoryUri);
  return inMemoryUri;
}

async function connectDb(uri) {
  const targetUri = uri || process.env.MONGO_URI;

  if (targetUri) {
    try {
      console.log(`Attempting connection to MongoDB at: ${targetUri}`);
      await mongoose.connect(targetUri, { serverSelectionTimeoutMS: 5000 });
      console.log('Connected to MongoDB successfully.');
      return targetUri;
    } catch (err) {
      console.warn(`\n[WARNING] Could not connect to remote MONGO_URI (${err.message}).`);
      console.warn(`Tip: If using MongoDB Atlas, ensure your IP address is whitelisted in Atlas Network Access (or set to 0.0.0.0/0).`);
      console.warn(`Falling back to local in-memory MongoDB...\n`);
    }
  }

  return await startInMemoryMongo();
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
