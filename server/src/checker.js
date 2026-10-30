/**
 * Scheme Source Watcher - Checker Engine
 *
 * Core execution pipeline for checking a source:
 * 1. Fetch source with conditional GET, redirect hops, robots.txt, retries
 * 2. Handle dead / blocked / moved states with deduplicated review items
 * 3. Auto-resolve source_blocked / source_dead when source recovers
 * 4. Normalize HTML and extract facts
 * 5. Capture Playwright screenshot (non-blocking failure)
 * 6. Classify changes (meaningful vs cosmetic vs text_changed vs unchanged)
 * 7. Store gzipped Snapshot
 * 8. Create ReviewItem if meaningful or text_changed (never for cosmetic)
 * 9. Write CheckLog for audit trail
 */

const crypto = require('crypto');
const Source = require('./models/Source');
const Snapshot = require('./models/Snapshot');
const ReviewItem = require('./models/ReviewItem');
const CheckLog = require('./models/CheckLog');
const { fetchSource } = require('./fetcher');
const { normalizeHtml } = require('./normalizer');
const { extractFacts } = require('./factExtractor');
const { classifySnapshotChange } = require('./classifier');
const { captureScreenshot } = require('./screenshot');

/**
 * Check a source by ID or Document
 *
 * @param {string|object} sourceOrId - Source document or ObjectId
 * @param {object} [options]
 * @param {boolean} [options.skipScreenshot=false]
 * @returns {Promise<object>} Check summary
 */
async function checkSource(sourceOrId, options = {}) {
  const startTime = Date.now();

  let source;
  if (typeof sourceOrId === 'string' || sourceOrId instanceof require('mongoose').Types.ObjectId) {
    source = await Source.findById(sourceOrId);
  } else {
    source = sourceOrId;
  }

  if (!source) {
    throw new Error(`Source not found: ${sourceOrId}`);
  }

  // Check Retry-After active window
  if (source.retryAfterUntil && new Date() < new Date(source.retryAfterUntil)) {
    const remainingSeconds = Math.ceil((new Date(source.retryAfterUntil) - Date.now()) / 1000);
    const durationMs = Date.now() - startTime;
    await CheckLog.create({
      sourceId: source._id,
      at: new Date(),
      outcome: 'blocked',
      classification: 'blocked',
      reasons: [`Check skipped: 429 Retry-After is active for another ${remainingSeconds}s`],
      durationMs
    });
    return { outcome: 'blocked', classification: 'blocked', skipped: true };
  }

  // Get previous snapshot
  const prevSnapshot = await Snapshot.findOne({ sourceId: source._id }).sort({ capturedAt: -1 });

  // Fetch source
  const fetchResult = await fetchSource(source.currentUrl, {
    etag: prevSnapshot?.etag,
    lastModified: prevSnapshot?.lastModified
  });

  const durationMs = Date.now() - startTime;

  // -------------------------------------------------------------
  // Case A: Source is Blocked (403, 429, or robots-disallow)
  // -------------------------------------------------------------
  if (fetchResult.outcome === 'blocked') {
    source.status = 'blocked';
    source.lastCheckedAt = new Date();
    source.lastOutcome = 'blocked';
    if (fetchResult.retryAfterSeconds) {
      source.retryAfterUntil = new Date(Date.now() + fetchResult.retryAfterSeconds * 1000);
    }
    await source.save();

    // Deduplicated review item: one open item per source+type
    const existingOpenItem = await ReviewItem.findOne({
      sourceId: source._id,
      type: 'source_blocked',
      status: 'open'
    });

    if (!existingOpenItem) {
      await ReviewItem.create({
        sourceId: source._id,
        type: 'source_blocked',
        priority: 'high',
        status: 'open',
        changes: [
          {
            type: 'access',
            key: 'http_blocked',
            before: 'accessible',
            after: fetchResult.reason || 'Blocked',
            location: 'HTTP Header'
          }
        ]
      });
    }

    const snapshot = new Snapshot({
      sourceId: source._id,
      capturedAt: new Date(),
      httpStatus: fetchResult.statusCode,
      finalUrl: fetchResult.finalUrl,
      redirectChain: fetchResult.redirectChain,
      outcome: 'blocked',
      facts: []
    });
    await snapshot.save();

    await CheckLog.create({
      sourceId: source._id,
      at: new Date(),
      outcome: 'blocked',
      classification: 'blocked',
      reasons: [fetchResult.reason || 'Source access blocked'],
      durationMs
    });

    return { outcome: 'blocked', classification: 'blocked' };
  }

  // -------------------------------------------------------------
  // Case B: Source is Dead (404 or 410)
  // -------------------------------------------------------------
  if (fetchResult.outcome === 'dead') {
    source.status = 'dead';
    source.lastCheckedAt = new Date();
    source.lastOutcome = 'dead';
    await source.save();

    // Deduplicated review item: one open item per source+type
    const existingOpenItem = await ReviewItem.findOne({
      sourceId: source._id,
      type: 'source_dead',
      status: 'open'
    });

    if (!existingOpenItem) {
      await ReviewItem.create({
        sourceId: source._id,
        type: 'source_dead',
        priority: 'high',
        status: 'open',
        changes: [
          {
            type: 'status',
            key: 'http_status',
            before: 200,
            after: fetchResult.statusCode,
            location: 'HTTP Status'
          }
        ]
      });
    }

    const snapshot = new Snapshot({
      sourceId: source._id,
      capturedAt: new Date(),
      httpStatus: fetchResult.statusCode,
      finalUrl: fetchResult.finalUrl,
      redirectChain: fetchResult.redirectChain,
      outcome: 'dead',
      facts: []
    });
    await snapshot.save();

    await CheckLog.create({
      sourceId: source._id,
      at: new Date(),
      outcome: 'dead',
      classification: 'dead',
      reasons: [fetchResult.reason || `Source returned ${fetchResult.statusCode}`],
      durationMs
    });

    return { outcome: 'dead', classification: 'dead' };
  }

  // -------------------------------------------------------------
  // Case C: Source is 304 Not Modified
  // -------------------------------------------------------------
  if (fetchResult.outcome === 'not_modified') {
    // If source recovered from blocked/dead state, auto-resolve
    await autoResolveRecovery(source);

    source.lastCheckedAt = new Date();
    source.lastOutcome = 'not_modified';
    await source.save();

    await CheckLog.create({
      sourceId: source._id,
      at: new Date(),
      outcome: 'not_modified',
      classification: 'unchanged',
      reasons: ['HTTP 304 Not Modified: server indicates content is identical'],
      durationMs
    });

    return { outcome: 'not_modified', classification: 'unchanged' };
  }

  // -------------------------------------------------------------
  // Case D & E: Source is OK or MOVED (200 with content)
  // -------------------------------------------------------------
  if (fetchResult.outcome === 'ok' || fetchResult.outcome === 'moved') {
    // Auto-resolve any prior blocked/dead review items
    await autoResolveRecovery(source);

    // Handle permanent move (301/308)
    if (fetchResult.isPermanentMove && fetchResult.finalUrl !== source.currentUrl) {
      const oldUrl = source.currentUrl;
      source.currentUrl = fetchResult.finalUrl;
      source.status = 'moved';

      const existingMovedItem = await ReviewItem.findOne({
        sourceId: source._id,
        type: 'source_moved',
        status: 'open'
      });

      if (!existingMovedItem) {
        await ReviewItem.create({
          sourceId: source._id,
          type: 'source_moved',
          priority: 'medium',
          status: 'open',
          changes: [
            {
              type: 'url',
              key: 'current_url',
              before: oldUrl,
              after: fetchResult.finalUrl,
              location: 'HTTP 301/308 Redirect'
            }
          ]
        });
      }
    } else if (source.status === 'blocked' || source.status === 'dead') {
      source.status = 'active';
    }

    source.lastCheckedAt = new Date();
    source.lastOutcome = fetchResult.outcome;
    source.etag = fetchResult.etag || source.etag;
    source.lastModified = fetchResult.lastModified || source.lastModified;
    await source.save();

    // Process HTML content
    const rawHtml = fetchResult.rawHtml || '';
    const rawHtmlHash = crypto.createHash('sha256').update(rawHtml).digest('hex');
    const { mainText } = normalizeHtml(rawHtml);
    const facts = extractFacts(rawHtml);

    // Screenshot (with optional skip for fast unit tests)
    let screenshotPath = null;
    if (!options.skipScreenshot) {
      screenshotPath = await captureScreenshot(fetchResult.finalUrl, source.slug);
    }

    // Save Snapshot
    const snapshot = new Snapshot({
      sourceId: source._id,
      capturedAt: new Date(),
      httpStatus: fetchResult.statusCode,
      finalUrl: fetchResult.finalUrl,
      redirectChain: fetchResult.redirectChain,
      rawHtmlHash,
      mainText,
      facts,
      screenshotPath,
      outcome: fetchResult.outcome
    });
    snapshot.setRawHtml(rawHtml);
    await snapshot.save();

    // Classify against previous snapshot
    const { classification, reasons, changes } = classifySnapshotChange(prevSnapshot, {
      facts,
      rawHtmlHash,
      mainText
    });

    // Handle review item creation with deduplication
    if (classification === 'meaningful') {
      const isIdenticalOpen = await isIdenticalOpenItem(source._id, 'meaningful_change', changes);
      if (!isIdenticalOpen) {
        await ReviewItem.create({
          sourceId: source._id,
          type: 'meaningful_change',
          priority: 'high',
          status: 'open',
          changes,
          beforeSnapshotId: prevSnapshot?._id || null,
          afterSnapshotId: snapshot._id
        });
      }
    } else if (classification === 'text_changed') {
      const existingOpenTextChange = await ReviewItem.findOne({
        sourceId: source._id,
        type: 'text_changed',
        status: 'open'
      });

      if (!existingOpenTextChange) {
        await ReviewItem.create({
          sourceId: source._id,
          type: 'text_changed',
          priority: 'low',
          status: 'open',
          changes: [],
          beforeSnapshotId: prevSnapshot?._id || null,
          afterSnapshotId: snapshot._id
        });
      }
    }
    // Note: If cosmetic or unchanged, MUST NOT create a review item!

    // Write CheckLog
    await CheckLog.create({
      sourceId: source._id,
      at: new Date(),
      outcome: fetchResult.outcome,
      classification,
      reasons,
      durationMs: Date.now() - startTime
    });

    return {
      outcome: fetchResult.outcome,
      classification,
      reasons,
      changes,
      snapshotId: snapshot._id
    };
  }

  // Any other error outcome
  source.lastCheckedAt = new Date();
  source.lastOutcome = 'error';
  await source.save();

  await CheckLog.create({
    sourceId: source._id,
    at: new Date(),
    outcome: 'error',
    classification: 'error',
    reasons: [fetchResult.reason || 'Fetch error'],
    durationMs: Date.now() - startTime
  });

  return { outcome: 'error', classification: 'error' };
}

/**
 * Auto-resolve open source_blocked or source_dead items when source recovers
 */
async function autoResolveRecovery(source) {
  const openItems = await ReviewItem.find({
    sourceId: source._id,
    type: { $in: ['source_blocked', 'source_dead'] },
    status: 'open'
  });

  for (const item of openItems) {
    item.status = 'accepted';
    item.resolvedAt = new Date();
    item.resolvedBy = 'system (auto-recovered)';
    await item.save();
  }

  if (source.status === 'blocked' || source.status === 'dead') {
    source.status = 'active';
  }
}

/**
 * Check if an identical open review item exists
 */
async function isIdenticalOpenItem(sourceId, type, newChanges) {
  const openItems = await ReviewItem.find({ sourceId, type, status: 'open' });
  if (openItems.length === 0) return false;

  const newChangesJson = JSON.stringify(
    newChanges.map(c => ({ type: c.type, key: c.key, before: c.before, after: c.after }))
  );

  for (const item of openItems) {
    const itemChangesJson = JSON.stringify(
      (item.changes || []).map(c => ({ type: c.type, key: c.key, before: c.before, after: c.after }))
    );
    if (newChangesJson === itemChangesJson) {
      return true;
    }
  }

  return false;
}

module.exports = {
  checkSource,
  autoResolveRecovery,
  isIdenticalOpenItem
};
