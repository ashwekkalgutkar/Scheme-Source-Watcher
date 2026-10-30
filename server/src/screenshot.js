/**
 * Scheme Source Watcher - Screenshot Utility
 *
 * Captures full-page screenshots using Playwright Chromium (1280x1600 viewport).
 * Saves to server/data/screenshots.
 * Gracefully logs a warning and returns null if Chromium is unavailable or fails.
 * NEVER crashes the check.
 */

const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../data/screenshots');

// Ensure directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let playwrightChromium = null;

function getChromium() {
  if (playwrightChromium === null) {
    try {
      const { chromium } = require('playwright');
      playwrightChromium = chromium;
    } catch (err) {
      console.warn('Playwright chromium not loadable:', err.message);
      playwrightChromium = false;
    }
  }
  return playwrightChromium;
}

/**
 * Capture full-page screenshot of a URL
 *
 * @param {string} url - Target URL to capture
 * @param {string} identifier - Unique prefix for filename (e.g. source slug or id)
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<string|null>} Relative path to screenshot or null
 */
async function captureScreenshot(url, identifier = 'scheme', timeoutMs = 15000) {
  const chromium = getChromium();
  if (!chromium) {
    console.warn('Chromium unavailable; skipping screenshot.');
    return null;
  }

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 1600 },
      userAgent: 'SchemeWatcher/1.0 (Screenshot Service)'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    // Brief settle time for animations/layout
    await page.waitForTimeout(400);

    const filename = `${identifier}_${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    await page.screenshot({
      path: filepath,
      fullPage: true
    });

    await browser.close();
    return `/screenshots/${filename}`;
  } catch (err) {
    console.warn(`Screenshot capture failed for ${url}: ${err.message}`);
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    return null;
  }
}

module.exports = {
  captureScreenshot,
  SCREENSHOTS_DIR
};
