/**
 * Scheme Source Watcher - Classifier
 *
 * Compares previous vs new fact sets by (type, key).
 * Outcomes:
 * - meaningful: value added / removed / changed -> creates high/medium priority review item
 * - cosmetic: facts identical, raw hash differs (e.g. visitor counter, banner, date stamp) -> NO alert
 * - text_changed: facts identical but mainText similarity < 0.85 -> low priority review item ("needs a look")
 * - unchanged: facts and content identical -> NO alert
 *
 * Logs deterministic reasoning for every outcome.
 */

const { calculateTextSimilarity } = require('./normalizer');

/**
 * Classify changes between previous and new snapshots
 *
 * @param {object|null} prevSnapshot - Previous snapshot { facts, rawHtmlHash, mainText }
 * @param {object} newSnapshot - Current snapshot { facts, rawHtmlHash, mainText }
 * @returns {object} { classification, reasons, changes, similarity }
 */
function classifySnapshotChange(prevSnapshot, newSnapshot) {
  if (!prevSnapshot) {
    return {
      classification: 'unchanged',
      reasons: ['Initial baseline snapshot captured. No previous version to compare.'],
      changes: [],
      similarity: 1.0
    };
  }

  const prevFacts = prevSnapshot.facts || [];
  const newFacts = newSnapshot.facts || [];

  const changes = [];
  const reasons = [];

  // Helper map by type:key
  const makeKey = f => `${f.type}:${f.key}`;
  const prevMap = new Map();
  const newMap = new Map();

  for (const f of prevFacts) {
    prevMap.set(makeKey(f), f);
  }
  for (const f of newFacts) {
    newMap.set(makeKey(f), f);
  }

  // 1. Detect Changed & Removed facts
  for (const [key, prevF] of prevMap.entries()) {
    const newF = newMap.get(key);
    if (!newF) {
      // Removed fact
      changes.push({
        type: prevF.type,
        key: prevF.key,
        before: prevF.value,
        after: null,
        beforeQuote: prevF.rawQuote || '',
        afterQuote: '',
        location: prevF.location || 'General'
      });
      reasons.push(`${prevF.type} "${prevF.key}" was removed (was: ${prevF.value})`);
    } else {
      // Compare values
      const prevValStr = JSON.stringify(prevF.value);
      const newValStr = JSON.stringify(newF.value);

      if (prevValStr !== newValStr) {
        changes.push({
          type: newF.type,
          key: newF.key,
          before: prevF.value,
          after: newF.value,
          beforeQuote: prevF.rawQuote || '',
          afterQuote: newF.rawQuote || '',
          location: newF.location || prevF.location || 'General'
        });
        reasons.push(`${newF.type} "${newF.key}" changed from ${prevF.value} to ${newF.value}`);
      }
    }
  }

  // 2. Detect Added facts
  for (const [key, newF] of newMap.entries()) {
    if (!prevMap.has(key)) {
      changes.push({
        type: newF.type,
        key: newF.key,
        before: null,
        after: newF.value,
        beforeQuote: '',
        afterQuote: newF.rawQuote || '',
        location: newF.location || 'General'
      });
      reasons.push(`${newF.type} "${newF.key}" was added (value: ${newF.value})`);
    }
  }

  // 3. Evaluate classification
  if (changes.length > 0) {
    return {
      classification: 'meaningful',
      reasons,
      changes,
      similarity: calculateTextSimilarity(prevSnapshot.mainText, newSnapshot.mainText)
    };
  }

  // Facts are identical. Now check mainText similarity.
  const similarity = calculateTextSimilarity(prevSnapshot.mainText, newSnapshot.mainText);

  if (similarity < 0.85) {
    return {
      classification: 'text_changed',
      reasons: [
        `Facts identical, but eligibility/content text was substantially rewritten (text similarity: ${(similarity * 100).toFixed(1)}% < 85%)`
      ],
      changes: [],
      similarity
    };
  }

  // Raw HTML hash check
  const rawHashA = prevSnapshot.rawHtmlHash;
  const rawHashB = newSnapshot.rawHtmlHash;

  if (rawHashA && rawHashB && rawHashA !== rawHashB) {
    return {
      classification: 'cosmetic',
      reasons: ['ignored: only cosmetic elements (banner/visitor counter/last-updated stamp) differed'],
      changes: [],
      similarity
    };
  }

  return {
    classification: 'unchanged',
    reasons: ['content and facts identical'],
    changes: [],
    similarity
  };
}

module.exports = {
  classifySnapshotChange
};
