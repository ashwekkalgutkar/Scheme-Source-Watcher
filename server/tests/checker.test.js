const { connectDb, disconnectDb } = require('../src/db');
const { startFixtureServer, stopFixtureServer, slugVersions } = require('../fixtures/server');
const Source = require('../src/models/Source');
const Snapshot = require('../src/models/Snapshot');
const ReviewItem = require('../src/models/ReviewItem');
const CheckLog = require('../src/models/CheckLog');
const { checkSource } = require('../src/checker');

describe('Full Checker Integration Suite (Scenarios A through H)', () => {
  let fixturePort = 4002;
  let fixtureUrl;

  beforeAll(async () => {
    await connectDb();
    await startFixtureServer(fixturePort);
    fixtureUrl = `http://127.0.0.1:${fixturePort}`;
  });

  afterAll(async () => {
    await stopFixtureServer();
    await disconnectDb();
  });

  beforeEach(async () => {
    await Source.deleteMany({});
    await Snapshot.deleteMany({});
    await ReviewItem.deleteMany({});
    await CheckLog.deleteMany({});

    // Reset fixtures
    for (const key of Object.keys(slugVersions)) {
      slugVersions[key] = 0;
    }
  });

  test('Scenario A (Cosmetic only): banner, visitor counter, last-updated stamp change MUST NOT create review item', async () => {
    const source = await Source.create({
      name: 'Farmer Income Support',
      slug: 'farmer-income-support',
      originalUrl: `${fixtureUrl}/schemes/farmer-income-support`,
      currentUrl: `${fixtureUrl}/schemes/farmer-income-support`,
      checkIntervalMinutes: 60,
      status: 'active'
    });

    // Check baseline (version 0)
    const check1 = await checkSource(source, { skipScreenshot: true });
    expect(check1.outcome).toBe('ok');
    expect(check1.classification).toBe('unchanged');

    let reviewItems = await ReviewItem.find({ sourceId: source._id });
    expect(reviewItems).toHaveLength(0);

    // Advance to Version 1 (Cosmetic: banner text changed, visitor counter changed, last updated changed)
    slugVersions['farmer-income-support'] = 1;

    const check2 = await checkSource(source, { skipScreenshot: true });
    expect(check2.outcome).toBe('ok');
    expect(check2.classification).toBe('cosmetic');
    expect(check2.reasons[0]).toContain('ignored: only cosmetic elements');

    // CRITICAL: MUST NOT create a review item!
    reviewItems = await ReviewItem.find({ sourceId: source._id });
    expect(reviewItems).toHaveLength(0);

    const log = await CheckLog.findOne({ sourceId: source._id }).sort({ at: -1 });
    expect(log.classification).toBe('cosmetic');
  });

  test('Scenario B (Meaningful amount change): Rs 6,000 -> Rs 8,000 creates high-priority review item', async () => {
    const source = await Source.create({
      name: 'Farmer Income Support',
      slug: 'farmer-income-support',
      originalUrl: `${fixtureUrl}/schemes/farmer-income-support`,
      currentUrl: `${fixtureUrl}/schemes/farmer-income-support`
    });

    // Baseline
    await checkSource(source, { skipScreenshot: true });

    // Advance to Version 2 (Amount becomes Rs 8,000)
    slugVersions['farmer-income-support'] = 2;

    const checkRes = await checkSource(source, { skipScreenshot: true });
    expect(checkRes.classification).toBe('meaningful');

    const reviewItems = await ReviewItem.find({ sourceId: source._id, status: 'open' });
    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0].type).toBe('meaningful_change');
    expect(reviewItems[0].priority).toBe('high');

    const amtChange = reviewItems[0].changes.find(c => c.type === 'amount');
    expect(amtChange).toBeDefined();
    expect(amtChange.before).toBe('6000/year');
    expect(amtChange.after).toBe('8000/year');

    // Deduplication check: checkSource again must NOT duplicate identical open review item
    await checkSource(source, { skipScreenshot: true });
    const countAfter = await ReviewItem.countDocuments({ sourceId: source._id, status: 'open' });
    expect(countAfter).toBe(1);
  });

  test('Scenario C (Deadline change vs wording change): 31 March 2026 -> 30 June 2026 alerts, but rewording with same date does NOT alert', async () => {
    // Part 1: Widow pension deadline wording change with same date
    const widowSource = await Source.create({
      name: 'Widow Pension',
      slug: 'widow-pension',
      originalUrl: `${fixtureUrl}/schemes/widow-pension`,
      currentUrl: `${fixtureUrl}/schemes/widow-pension`
    });

    await checkSource(widowSource, { skipScreenshot: true });

    // Advance to Version 1: wording changes from "31 March 2026" to "31/03/2026"
    slugVersions['widow-pension'] = 1;
    const widowCheck2 = await checkSource(widowSource, { skipScreenshot: true });

    // Facts are identical ("2026-03-31"), so MUST NOT alert!
    expect(widowCheck2.classification).not.toBe('meaningful');
    const widowItems = await ReviewItem.find({ sourceId: widowSource._id });
    expect(widowItems).toHaveLength(0);

    // Part 2: Farmer scheme deadline changes 31 March 2026 -> 30 June 2026
    const farmerSource = await Source.create({
      name: 'Farmer Income Support',
      slug: 'farmer-income-support',
      originalUrl: `${fixtureUrl}/schemes/farmer-income-support`,
      currentUrl: `${fixtureUrl}/schemes/farmer-income-support`
    });
    slugVersions['farmer-income-support'] = 2; // has 31 March 2026
    await checkSource(farmerSource, { skipScreenshot: true });

    slugVersions['farmer-income-support'] = 3; // has 30 June 2026
    const farmerCheck = await checkSource(farmerSource, { skipScreenshot: true });

    expect(farmerCheck.classification).toBe('meaningful');
    const farmerItems = await ReviewItem.find({ sourceId: farmerSource._id, status: 'open' });
    expect(farmerItems).toHaveLength(1);
    const deadlineChange = farmerItems[0].changes.find(c => c.type === 'deadline');
    expect(deadlineChange.before).toBe('2026-03-31');
    expect(deadlineChange.after).toBe('2026-06-30');
  });

  test('Scenario D (Meaningful income & age change): income Rs 2.5L -> 3L, age 60 -> 58 years', async () => {
    const source = await Source.create({
      name: 'Widow Pension',
      slug: 'widow-pension',
      originalUrl: `${fixtureUrl}/schemes/widow-pension`,
      currentUrl: `${fixtureUrl}/schemes/widow-pension`
    });

    // Baseline
    slugVersions['widow-pension'] = 0;
    await checkSource(source, { skipScreenshot: true });

    // Advance to Version 2 (income Rs 3 lakh, age 58)
    slugVersions['widow-pension'] = 2;
    const checkRes = await checkSource(source, { skipScreenshot: true });

    expect(checkRes.classification).toBe('meaningful');
    const reviewItems = await ReviewItem.find({ sourceId: source._id, status: 'open' });
    expect(reviewItems).toHaveLength(1);

    const incomeChange = reviewItems[0].changes.find(c => c.type === 'eligibility_income');
    expect(incomeChange).toBeDefined();
    expect(incomeChange.before).toBe(250000);
    expect(incomeChange.after).toBe(300000);

    const ageChange = reviewItems[0].changes.find(c => c.type === 'eligibility_age');
    expect(ageChange).toBeDefined();
    expect(ageChange.before).toBe(60);
    expect(ageChange.after).toBe(58);
  });

  test('Scenario E (Moved 301): updates source.currentUrl and raises source_moved review item', async () => {
    const source = await Source.create({
      name: 'Housing Scheme',
      slug: 'housing',
      originalUrl: `${fixtureUrl}/schemes/housing`,
      currentUrl: `${fixtureUrl}/schemes/housing`
    });

    await checkSource(source, { skipScreenshot: true });

    // Advance housing to 1 -> returns 301 to /schemes/housing-new-portal
    slugVersions['housing'] = 1;
    const checkRes = await checkSource(source, { skipScreenshot: true });

    expect(checkRes.outcome).toBe('moved');

    const updatedSource = await Source.findById(source._id);
    expect(updatedSource.currentUrl).toBe(`${fixtureUrl}/schemes/housing-new-portal`);
    expect(updatedSource.status).toBe('moved');

    const movedItems = await ReviewItem.find({ sourceId: source._id, type: 'source_moved' });
    expect(movedItems).toHaveLength(1);
    expect(movedItems[0].priority).toBe('medium');
  });

  test('Scenario F (Dead 404 and 410): flags source as dead and creates source_dead review item', async () => {
    const source404 = await Source.create({
      name: 'Dead Scheme 404',
      slug: 'dead-404',
      originalUrl: `${fixtureUrl}/schemes/dead-404`,
      currentUrl: `${fixtureUrl}/schemes/dead-404`
    });

    slugVersions['dead-404'] = 1; // returns 404
    const checkRes = await checkSource(source404, { skipScreenshot: true });

    expect(checkRes.outcome).toBe('dead');
    const updatedSource = await Source.findById(source404._id);
    expect(updatedSource.status).toBe('dead');

    const items = await ReviewItem.find({ sourceId: source404._id, type: 'source_dead' });
    expect(items).toHaveLength(1);
    expect(items[0].priority).toBe('high');
  });

  test('Scenario G (Blocked 403 and 429 with Retry-After)', async () => {
    // 403
    const source403 = await Source.create({
      name: 'Blocked Scheme 403',
      slug: 'blocked-403',
      originalUrl: `${fixtureUrl}/schemes/blocked-403`,
      currentUrl: `${fixtureUrl}/schemes/blocked-403`
    });

    slugVersions['blocked-403'] = 1;
    const check403 = await checkSource(source403, { skipScreenshot: true });
    expect(check403.outcome).toBe('blocked');

    const items403 = await ReviewItem.find({ sourceId: source403._id, type: 'source_blocked' });
    expect(items403).toHaveLength(1);

    // 429
    const source429 = await Source.create({
      name: 'Blocked Scheme 429',
      slug: 'blocked-429',
      originalUrl: `${fixtureUrl}/schemes/blocked-429`,
      currentUrl: `${fixtureUrl}/schemes/blocked-429`
    });

    slugVersions['blocked-429'] = 1;
    const check429 = await checkSource(source429, { skipScreenshot: true });
    expect(check429.outcome).toBe('blocked');

    const updated429 = await Source.findById(source429._id);
    expect(updated429.status).toBe('blocked');
    expect(updated429.retryAfterUntil).toBeDefined();

    // Re-check while retry-after is active -> should be skipped gracefully
    const skippedCheck = await checkSource(source429, { skipScreenshot: true });
    expect(skippedCheck.skipped).toBe(true);
  });

  test('Scenario H (Ambiguous paragraph rewritten, facts unchanged): low-priority text_changed review item', async () => {
    const source = await Source.create({
      name: 'Scholarship Scheme',
      slug: 'scholarship',
      originalUrl: `${fixtureUrl}/schemes/scholarship`,
      currentUrl: `${fixtureUrl}/schemes/scholarship`
    });

    // Baseline
    slugVersions['scholarship'] = 0;
    await checkSource(source, { skipScreenshot: true });

    // Advance to rewritten text with same facts
    slugVersions['scholarship'] = 1;
    const checkRes = await checkSource(source, { skipScreenshot: true });

    expect(checkRes.classification).toBe('text_changed');
    const items = await ReviewItem.find({ sourceId: source._id, type: 'text_changed' });
    expect(items).toHaveLength(1);
    expect(items[0].priority).toBe('low'); // Low priority bucket, NOT an alert!
  });

  test('Auto-recovery: when blocked or dead source recovers, review item is auto-resolved', async () => {
    const source = await Source.create({
      name: 'Recoverable Scheme',
      slug: 'blocked-403',
      originalUrl: `${fixtureUrl}/schemes/blocked-403`,
      currentUrl: `${fixtureUrl}/schemes/blocked-403`
    });

    // Block it
    slugVersions['blocked-403'] = 1;
    await checkSource(source, { skipScreenshot: true });

    let item = await ReviewItem.findOne({ sourceId: source._id, type: 'source_blocked' });
    expect(item.status).toBe('open');

    // Unblock it
    slugVersions['blocked-403'] = 0;
    await checkSource(source, { skipScreenshot: true });

    item = await ReviewItem.findOne({ sourceId: source._id, type: 'source_blocked' });
    expect(item.status).toBe('accepted');
    expect(item.resolvedBy).toBe('system (auto-recovered)');

    const updatedSource = await Source.findById(source._id);
    expect(updatedSource.status).toBe('active');
  });
});
