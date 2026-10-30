/**
 * Scheme Source Watcher - Normalizer
 *
 * Implements:
 * - Cheerio HTML parsing
 * - Strip script/style/noscript/nav/header/footer/aside/marquee
 * - Strip elements whose class/id matches: /banner|notice-ticker|counter|visitor|breadcrumb|cookie|share/i
 * - Strip HTML comments
 * - Collapse whitespace
 * - Output mainText (clean text representation)
 * - Support lowercase normalization for comparison
 * - Tag extraction with nearest heading context for fact extraction
 */

const cheerio = require('cheerio');

// Regex for classes/ids to strip
const STRIP_SELECTOR_PATTERN = /banner|notice-ticker|counter|visitor|breadcrumb|cookie|share/i;

// Block elements where spacing should be inserted so text doesn't merge
const BLOCK_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'tr', 'td', 'th', 'li', 'section', 'article', 'table', 'blockquote', 'hr', 'br'];

/**
 * Clean and normalize HTML using cheerio
 *
 * @param {string} html - Raw HTML string
 * @returns {object} { mainText, mainTextLower, $, sections }
 */
function normalizeHtml(html) {
  if (!html || typeof html !== 'string') {
    return {
      mainText: '',
      mainTextLower: '',
      sections: [],
      $: cheerio.load('')
    };
  }

  const $ = cheerio.load(html, { decodeEntities: true });

  // 1. Remove HTML comments
  $('*').contents().each(function () {
    if (this.type === 'comment') {
      $(this).remove();
    }
  });

  // 2. Strip tags: script, style, noscript, nav, header, footer, aside, marquee
  $('script, style, noscript, nav, header, footer, aside, marquee').remove();

  // 3. Strip elements whose class or id matches the pattern
  $('*').each(function () {
    const el = $(this);
    const className = el.attr('class') || '';
    const idName = el.attr('id') || '';

    if (STRIP_SELECTOR_PATTERN.test(className) || STRIP_SELECTOR_PATTERN.test(idName)) {
      el.remove();
    }
  });

  // 4. Extract structured sections with nearest heading for fact extractor
  const sections = [];
  let currentHeading = 'General';

  // Walk all content elements in document order
  $('h1, h2, h3, h4, h5, h6, p, li, td, th').each(function () {
    const tagName = this.tagName.toLowerCase();
    const text = collapseWhitespace($(this).text());
    if (!text) return;

    if (tagName.startsWith('h')) {
      currentHeading = text;
    } else {
      sections.push({
        heading: currentHeading,
        text,
        tag: tagName
      });
    }
  });

  // 5. Add whitespace around block elements before reading body text
  BLOCK_TAGS.forEach(tag => {
    $(tag).each(function () {
      $(this).prepend(' ').append(' ');
    });
  });

  const rawText = $('body').length ? $('body').text() : $.text();
  const mainText = collapseWhitespace(rawText);
  const mainTextLower = mainText.toLowerCase();

  return {
    mainText,
    mainTextLower,
    sections,
    $
  };
}

/**
 * Collapse consecutive whitespace characters into a single space and trim
 */
function collapseWhitespace(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Calculate Jaccard similarity or Dice coefficient between two texts
 * Useful for classifier outcome: text_changed (similarity < 0.85)
 */
function calculateTextSimilarity(textA, textB) {
  if (!textA && !textB) return 1.0;
  if (!textA || !textB) return 0.0;

  const a = textA.toLowerCase().trim();
  const b = textB.toLowerCase().trim();
  if (a === b) return 1.0;

  // Word-level bigrams for accurate phrase similarity
  const getBigrams = str => {
    const words = str.split(/\s+/).filter(Boolean);
    if (words.length === 0) return new Set();
    if (words.length === 1) return new Set(words);
    const bigrams = new Set();
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.add(`${words[i]} ${words[i + 1]}`);
    }
    return bigrams;
  };

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  if (bigramsA.size === 0 && bigramsB.size === 0) return 1.0;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0.0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) {
      intersection++;
    }
  }

  // Dice coefficient: 2 * |A ∩ B| / (|A| + |B|)
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

module.exports = {
  normalizeHtml,
  collapseWhitespace,
  calculateTextSimilarity
};
