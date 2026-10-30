const request = require('supertest');
const app = require('../src/app');
const { connectDb, disconnectDb } = require('../src/db');
const Source = require('../src/models/Source');
const ReviewItem = require('../src/models/ReviewItem');
const CheckLog = require('../src/models/CheckLog');

describe('Express REST API Endpoints', () => {
  beforeAll(async () => {
    await connectDb();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  beforeEach(async () => {
    await Source.deleteMany({});
    await ReviewItem.deleteMany({});
    await CheckLog.deleteMany({});
  });

  test('GET /api/sources and POST /api/sources', async () => {
    const postRes = await request(app)
      .post('/api/sources')
      .send({
        name: 'Test Farmer Scheme',
        slug: 'test-farmer',
        originalUrl: 'http://localhost:4001/schemes/farmer-income-support',
        checkIntervalMinutes: 30
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body.slug).toBe('test-farmer');
    expect(postRes.body.status).toBe('active');

    const getRes = await request(app).get('/api/sources');
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveLength(1);
    expect(getRes.body[0].name).toBe('Test Farmer Scheme');
  });

  test('Review Item accept and dismiss workflows', async () => {
    const source = await Source.create({
      name: 'Scholarship Scheme',
      slug: 'scholarship-test',
      originalUrl: 'http://localhost:4001/schemes/scholarship',
      currentUrl: 'http://localhost:4001/schemes/scholarship'
    });

    const item1 = await ReviewItem.create({
      sourceId: source._id,
      type: 'meaningful_change',
      priority: 'high',
      status: 'open',
      changes: [{ type: 'amount', key: 'scholarship_amount', before: '25000/year', after: '30000/year' }]
    });

    const item2 = await ReviewItem.create({
      sourceId: source._id,
      type: 'text_changed',
      priority: 'low',
      status: 'open',
      changes: []
    });

    // Accept item1
    const acceptRes = await request(app)
      .post(`/api/review-items/${item1._id}/accept`)
      .send({ resolvedBy: 'senior_officer' });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('accepted');
    expect(acceptRes.body.resolvedBy).toBe('senior_officer');

    // Dismiss item2
    const dismissRes = await request(app)
      .post(`/api/review-items/${item2._id}/dismiss`)
      .send({ dismissReason: 'Routine typographical revision only', resolvedBy: 'reviewer_1' });

    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.status).toBe('dismissed');
    expect(dismissRes.body.dismissReason).toBe('Routine typographical revision only');

    // Filter review items by status
    const openItemsRes = await request(app).get('/api/review-items?status=open');
    expect(openItemsRes.body).toHaveLength(0);

    const acceptedRes = await request(app).get('/api/review-items?status=accepted');
    expect(acceptedRes.body).toHaveLength(1);

    const dismissedRes = await request(app).get('/api/review-items?status=dismissed');
    expect(dismissedRes.body).toHaveLength(1);
  });

  test('GET /api/check-logs lists audit entries', async () => {
    const source = await Source.create({
      name: 'Log Test Source',
      slug: 'log-test',
      originalUrl: 'http://localhost:4001/schemes/test',
      currentUrl: 'http://localhost:4001/schemes/test'
    });

    await CheckLog.create({
      sourceId: source._id,
      at: new Date(),
      outcome: 'ok',
      classification: 'cosmetic',
      reasons: ['ignored: only banner/counter/date-stamp differed'],
      durationMs: 42
    });

    const res = await request(app).get('/api/check-logs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].classification).toBe('cosmetic');
    expect(res.body[0].reasons[0]).toContain('ignored');
  });
});
