/**
 * Scheme Source Watcher - Express App
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const Source = require('./models/Source');
const Snapshot = require('./models/Snapshot');
const ReviewItem = require('./models/ReviewItem');
const CheckLog = require('./models/CheckLog');
const { checkSource } = require('./checker');
const { SCREENSHOTS_DIR } = require('./screenshot');

const app = express();
app.use(cors());
app.use(express.json());

// Serve screenshots statically
app.use('/screenshots', express.static(SCREENSHOTS_DIR));

// -------------------------------------------------------------
// SOURCES API
// -------------------------------------------------------------

// List all sources
app.get('/api/sources', async (req, res) => {
  try {
    const sources = await Source.find({}).sort({ name: 1 });
    res.json(sources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new source
app.post('/api/sources', async (req, res) => {
  try {
    const { name, slug, originalUrl, checkIntervalMinutes = 60 } = req.body;
    if (!name || !slug || !originalUrl) {
      return res.status(400).json({ error: 'name, slug, and originalUrl are required' });
    }

    const existing = await Source.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: `Source with slug "${slug}" already exists` });
    }

    const source = await Source.create({
      name,
      slug,
      originalUrl,
      currentUrl: originalUrl,
      checkIntervalMinutes,
      status: 'active'
    });

    res.status(201).json(source);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger on-demand check for a source
app.post('/api/sources/:id/check', async (req, res) => {
  try {
    const source = await Source.findById(req.params.id);
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    const result = await checkSource(source);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get snapshots for a source
app.get('/api/sources/:id/snapshots', async (req, res) => {
  try {
    const snapshots = await Snapshot.find({ sourceId: req.params.id })
      .select('-rawHtml') // omit heavy rawHtml buffer in list
      .sort({ capturedAt: -1 })
      .limit(20);
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single snapshot details including decompressed rawHtml
app.get('/api/snapshots/:id', async (req, res) => {
  try {
    const snapshot = await Snapshot.findById(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    const htmlString = snapshot.getRawHtmlString();
    res.json({
      ...snapshot.toObject(),
      rawHtml: htmlString
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// REVIEW ITEMS API
// -------------------------------------------------------------

// List review items
app.get('/api/review-items', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.type) {
      filter.type = req.query.type;
    }
    if (req.query.sourceId) {
      filter.sourceId = req.query.sourceId;
    }

    const items = await ReviewItem.find(filter)
      .populate('sourceId', 'name slug currentUrl status')
      .populate('beforeSnapshotId', 'capturedAt screenshotPath finalUrl')
      .populate('afterSnapshotId', 'capturedAt screenshotPath finalUrl')
      .sort({ createdAt: -1 });

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept review item
app.post('/api/review-items/:id/accept', async (req, res) => {
  try {
    const item = await ReviewItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Review item not found' });
    }

    item.status = 'accepted';
    item.resolvedAt = new Date();
    item.resolvedBy = req.body.resolvedBy || 'reviewer';
    await item.save();

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dismiss review item
app.post('/api/review-items/:id/dismiss', async (req, res) => {
  try {
    const { dismissReason } = req.body;
    if (!dismissReason) {
      return res.status(400).json({ error: 'dismissReason is required' });
    }

    const item = await ReviewItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Review item not found' });
    }

    item.status = 'dismissed';
    item.resolvedAt = new Date();
    item.resolvedBy = req.body.resolvedBy || 'reviewer';
    item.dismissReason = dismissReason;
    await item.save();

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CHECK LOGS API (Audit trail)
// -------------------------------------------------------------

app.get('/api/check-logs', async (req, res) => {
  try {
    const filter = {};
    if (req.query.sourceId) {
      filter.sourceId = req.query.sourceId;
    }

    const logs = await CheckLog.find(filter)
      .populate('sourceId', 'name slug')
      .sort({ at: -1 })
      .limit(50);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// FIXTURE SERVER PROXY HELPERS
// (Allows frontend to advance or reset fixtures without CORS issues)
// -------------------------------------------------------------

const FIXTURES_URL = process.env.FIXTURES_URL || 'http://localhost:4001';

app.get('/api/fixtures/state', async (req, res) => {
  try {
    const response = await fetch(`${FIXTURES_URL}/fixtures/state`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `Could not reach fixture server at ${FIXTURES_URL}: ${err.message}` });
  }
});

app.post('/api/fixtures/advance/:slug', async (req, res) => {
  try {
    const response = await fetch(`${FIXTURES_URL}/fixtures/advance/${req.params.slug}`, {
      method: 'POST'
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `Could not reach fixture server: ${err.message}` });
  }
});

app.post('/api/fixtures/reset', async (req, res) => {
  try {
    const response = await fetch(`${FIXTURES_URL}/fixtures/reset`, { method: 'POST' });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `Could not reach fixture server: ${err.message}` });
  }
});

module.exports = app;
