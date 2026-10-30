/**
 * Fixture Server (port 4001)
 *
 * Drives the demo and integration test scenarios:
 * A. cosmetic only: banner, visitor counter, last-updated stamp, nav link (MUST NOT alert)
 * B. meaningful: benefit amount 6,000 -> 8,000
 * C. meaningful: deadline 31 March 2026 -> 30 June 2026; AND deadline wording changed but date identical (MUST NOT alert)
 * D. meaningful: annual family income below Rs 2.5 lakh -> Rs 3 lakh; age 60 -> 58
 * E. moved: old URL returns 301 to new URL, content unchanged
 * F. dead: 404 and 410 URLs
 * G. blocked: 403 for automated UA; 429 with Retry-After
 * H. ambiguous: eligibility paragraph substantially rewritten, facts unchanged -> text_changed bucket
 */

const express = require('express');
const cors = require('cors');
const {
  renderFarmerScheme,
  renderWidowPensionScheme,
  renderScholarshipScheme,
  renderHousingScheme
} = require('./templates');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.FIXTURES_PORT || 4001;

// State of each fixture slug
const slugVersions = {
  'farmer-income-support': 0, // max 3
  'widow-pension': 0,         // max 2
  'scholarship': 0,           // max 1
  'housing': 0,               // max 1 (version 1 redirects 301)
  'dead-404': 0,              // 0: 200, 1: 404
  'dead-410': 0,              // 0: 200, 1: 410
  'blocked-403': 0,           // 0: 200, 1: 403
  'blocked-429': 0            // 0: 200, 1: 429
};

const maxVersions = {
  'farmer-income-support': 3,
  'widow-pension': 2,
  'scholarship': 1,
  'housing': 1,
  'dead-404': 1,
  'dead-410': 1,
  'blocked-403': 1,
  'blocked-429': 1
};

// Advance a slug to its next version
app.post('/fixtures/advance/:slug', (req, res) => {
  const { slug } = req.params;
  if (!(slug in slugVersions)) {
    return res.status(404).json({ error: `Unknown fixture slug: ${slug}` });
  }

  const max = maxVersions[slug] || 1;
  if (slugVersions[slug] < max) {
    slugVersions[slug]++;
  }

  res.json({
    success: true,
    slug,
    version: slugVersions[slug],
    maxVersion: max
  });
});

// Reset all fixtures to version 0
app.post('/fixtures/reset', (req, res) => {
  for (const key of Object.keys(slugVersions)) {
    slugVersions[key] = 0;
  }
  res.json({ success: true, versions: { ...slugVersions } });
});

// Get current versions state
app.get('/fixtures/state', (req, res) => {
  res.json({ versions: { ...slugVersions }, maxVersions });
});

// Robots.txt endpoint
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Disallow: /admin
Disallow: /private

User-agent: SchemeWatcher
Disallow: /schemes/disallowed-by-robots
Allow: /schemes
`);
});

// Destination for moved housing scheme
app.get('/schemes/housing-new-portal', (req, res) => {
  res.type('html').send(renderHousingScheme(0));
});

// Scheme Page Renderer
app.get('/schemes/:slug', (req, res) => {
  const { slug } = req.params;
  const version = slugVersions[slug] || 0;

  // Scenario E: moved (301 to new URL)
  if (slug === 'housing' && version === 1) {
    return res.redirect(301, '/schemes/housing-new-portal');
  }

  // Scenario F: dead (404 and 410)
  if (slug === 'dead-404') {
    if (version === 1) {
      return res.status(404).send('<!DOCTYPE html><html><body><h1>404 Scheme Not Found</h1><p>The requested welfare scheme page has been permanently decommissioned.</p></body></html>');
    }
    return res.type('html').send(renderHousingScheme(0));
  }

  if (slug === 'dead-410') {
    if (version === 1) {
      return res.status(410).send('<!DOCTYPE html><html><body><h1>410 Gone</h1><p>This government scheme has expired and is no longer available.</p></body></html>');
    }
    return res.type('html').send(renderHousingScheme(0));
  }

  // Scenario G: blocked (403 and 429)
  if (slug === 'blocked-403') {
    if (version === 1) {
      return res.status(403).send('<!DOCTYPE html><html><body><h1>403 Forbidden</h1><p>Automated crawler requests are forbidden by departmental security policy.</p></body></html>');
    }
    return res.type('html').send(renderHousingScheme(0));
  }

  if (slug === 'blocked-429') {
    if (version === 1) {
      res.set('Retry-After', '60');
      return res.status(429).send('<!DOCTYPE html><html><body><h1>429 Too Many Requests</h1><p>Rate limit exceeded. Please retry after 60 seconds.</p></body></html>');
    }
    return res.type('html').send(renderHousingScheme(0));
  }

  // Four Main Schemes
  switch (slug) {
    case 'farmer-income-support':
      return res.type('html').send(renderFarmerScheme(version));
    case 'widow-pension':
      return res.type('html').send(renderWidowPensionScheme(version));
    case 'scholarship':
      return res.type('html').send(renderScholarshipScheme(version));
    case 'housing':
      return res.type('html').send(renderHousingScheme(version));
    default:
      return res.status(404).send(`<h1>Scheme not found: ${slug}</h1>`);
  }
});

let serverInstance = null;

function startFixtureServer(port = PORT) {
  return new Promise((resolve, reject) => {
    serverInstance = app.listen(port, () => {
      console.log(`Fixture Server running on http://localhost:${port}`);
      resolve(serverInstance);
    }).on('error', reject);
  });
}

function stopFixtureServer() {
  return new Promise(resolve => {
    if (serverInstance) {
      serverInstance.close(resolve);
      serverInstance = null;
    } else {
      resolve();
    }
  });
}

if (require.main === module) {
  startFixtureServer(PORT);
}

module.exports = {
  app,
  startFixtureServer,
  stopFixtureServer,
  slugVersions
};
