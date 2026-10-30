/**
 * Scheme Source Watcher - Seed Script
 *
 * Seeds database with initial government scheme sources pointing to fixture server.
 */

require('dotenv').config();
const { connectDb, disconnectDb } = require('../src/db');
const Source = require('../src/models/Source');
const { checkSource } = require('../src/checker');

const INITIAL_SOURCES = [
  {
    name: 'Pradhan Mantri Kisan Kalyan Yojana',
    slug: 'farmer-income-support',
    originalUrl: 'http://localhost:4001/schemes/farmer-income-support',
    currentUrl: 'http://localhost:4001/schemes/farmer-income-support',
    checkIntervalMinutes: 60,
    status: 'active'
  },
  {
    name: 'Indira Gandhi National Widow Pension Scheme',
    slug: 'widow-pension',
    originalUrl: 'http://localhost:4001/schemes/widow-pension',
    currentUrl: 'http://localhost:4001/schemes/widow-pension',
    checkIntervalMinutes: 60,
    status: 'active'
  },
  {
    name: 'Post-Matric Merit-cum-Means Scholarship',
    slug: 'scholarship',
    originalUrl: 'http://localhost:4001/schemes/scholarship',
    currentUrl: 'http://localhost:4001/schemes/scholarship',
    checkIntervalMinutes: 60,
    status: 'active'
  },
  {
    name: 'Pradhan Mantri Gramin Awas Yojana',
    slug: 'housing',
    originalUrl: 'http://localhost:4001/schemes/housing',
    currentUrl: 'http://localhost:4001/schemes/housing',
    checkIntervalMinutes: 60,
    status: 'active'
  }
];

async function seed(runInitialChecks = false) {
  await connectDb();

  console.log('Clearing existing sources...');
  await Source.deleteMany({});

  console.log('Seeding initial scheme sources...');
  for (const s of INITIAL_SOURCES) {
    const created = await Source.create(s);
    console.log(`- Created: ${created.name} (${created.slug})`);

    if (runInitialChecks) {
      try {
        console.log(`  Running initial baseline check for ${created.slug}...`);
        await checkSource(created, { skipScreenshot: true });
      } catch (err) {
        console.warn(`  Initial check error: ${err.message}`);
      }
    }
  }

  console.log('Database seeded successfully.');
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}

module.exports = { seed, INITIAL_SOURCES };
