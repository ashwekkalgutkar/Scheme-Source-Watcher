/**
 * Scheme Source Watcher - Fetcher
 *
 * Implements:
 * - UA "SchemeWatcher/1.0 (contact: <email from env>)"
 * - Timeout handling
 * - Conditional GET (ETag / If-Modified-Since)
 * - Manual redirect handling recording every hop (301/308 = permanent, 302/303/307 = temporary)
 * - Retry with backoff for 5xx/timeouts (max 3 retries)
 * - Cached robots.txt parsing and enforcement (never evade blocking)
 * - 429 Retry-After header parsing
 * - Outcomes: ok | not_modified | moved | dead (404/410) | blocked (403/429/robots-disallow) | error
 */

const robotsCache = new Map(); // origin -> { rules, fetchedAt }
const ROBOTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getUserAgent() {
  const contact = process.env.WATCHER_CONTACT_EMAIL || 'admin@schemewatcher.local';
  return `SchemeWatcher/1.0 (contact: ${contact})`;
}

function clearRobotsCache() {
  robotsCache.clear();
}

/**
 * Parse a robots.txt body for SchemeWatcher and '*' agents
 */
function parseRobotsTxt(content) {
  const lines = content.split(/\r?\n/);
  const rules = {
    schemeWatcher: { disallow: [], allow: [] },
    wildcard: { disallow: [], allow: [] }
  };

  let currentAgents = [];

  for (let rawLine of lines) {
    const commentIdx = rawLine.indexOf('#');
    if (commentIdx !== -1) {
      rawLine = rawLine.substring(0, commentIdx);
    }
    const line = rawLine.trim();
    if (!line) {
      currentAgents = [];
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (field === 'user-agent') {
      const ua = value.toLowerCase();
      if (ua === 'schemewatcher' || ua === 'schemewatcher/1.0') {
        currentAgents.push('schemeWatcher');
      } else if (ua === '*') {
        currentAgents.push('wildcard');
      } else {
        currentAgents.push('other');
      }
    } else if (field === 'disallow') {
      if (value) {
        for (const agent of currentAgents) {
          if (agent === 'schemeWatcher') rules.schemeWatcher.disallow.push(value);
          else if (agent === 'wildcard') rules.wildcard.disallow.push(value);
        }
      }
    } else if (field === 'allow') {
      if (value) {
        for (const agent of currentAgents) {
          if (agent === 'schemeWatcher') rules.schemeWatcher.allow.push(value);
          else if (agent === 'wildcard') rules.wildcard.allow.push(value);
        }
      }
    }
  }

  return rules;
}

function isPathDisallowed(pathname, ruleSet) {
  // If specific SchemeWatcher rules exist, use those; otherwise use wildcard
  const active = (ruleSet.schemeWatcher.disallow.length > 0 || ruleSet.schemeWatcher.allow.length > 0)
    ? ruleSet.schemeWatcher
    : ruleSet.wildcard;

  // Check allow first (longer matching prefix takes precedence in robots.txt standard)
  for (const allowPath of active.allow) {
    if (pathname.startsWith(allowPath)) {
      return false;
    }
  }

  for (const disallowPath of active.disallow) {
    if (disallowPath === '/' || pathname.startsWith(disallowPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a URL is allowed by robots.txt
 */
async function checkRobotsAllowed(targetUrl, timeoutMs = 5000) {
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (err) {
    return { allowed: true };
  }

  const origin = parsedUrl.origin;
  const now = Date.now();

  let cached = robotsCache.get(origin);
  if (!cached || (now - cached.fetchedAt > ROBOTS_CACHE_TTL_MS)) {
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(robotsUrl, {
        headers: { 'User-Agent': getUserAgent() },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        const rules = parseRobotsTxt(text);
        cached = { rules, fetchedAt: now };
        robotsCache.set(origin, cached);
      } else {
        // If 404 or other status, assume allowed
        cached = { rules: { schemeWatcher: { disallow: [], allow: [] }, wildcard: { disallow: [], allow: [] } }, fetchedAt: now };
        robotsCache.set(origin, cached);
      }
    } catch (err) {
      // Network error or timeout fetching robots.txt: fail open (allowed)
      cached = { rules: { schemeWatcher: { disallow: [], allow: [] }, wildcard: { disallow: [], allow: [] } }, fetchedAt: now };
      robotsCache.set(origin, cached);
    }
  }

  const disallowed = isPathDisallowed(parsedUrl.pathname, cached.rules);
  return { allowed: !disallowed };
}

/**
 * Parse Retry-After header into seconds
 */
function parseRetryAfter(headerVal) {
  if (!headerVal) return null;
  const val = headerVal.trim();
  const seconds = parseInt(val, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }
  const date = Date.parse(val);
  if (!isNaN(date)) {
    const diff = Math.ceil((date - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return null;
}

/**
 * Sleep helper for backoff
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a URL with all requirements
 *
 * @param {string} url - Target URL to fetch
 * @param {object} options
 * @param {string} [options.etag] - Previous ETag for conditional GET
 * @param {string} [options.lastModified] - Previous Last-Modified for conditional GET
 * @param {number} [options.timeoutMs=10000] - Request timeout in ms
 * @param {number} [options.maxRetries=3] - Max retries for 5xx/timeouts
 * @param {number} [options.initialBackoffMs=150] - Base backoff in ms
 * @param {number} [options.maxRedirects=10] - Max redirect hops
 * @param {boolean} [options.skipRobots=false] - Skip robots.txt check (e.g. for unit tests)
 * @returns {Promise<object>} Outcome object
 */
async function fetchSource(url, options = {}) {
  const {
    etag = null,
    lastModified = null,
    timeoutMs = 10000,
    maxRetries = 3,
    initialBackoffMs = 150,
    maxRedirects = 10,
    skipRobots = false
  } = options;

  const userAgent = getUserAgent();

  // 1. Check robots.txt
  if (!skipRobots) {
    const { allowed } = await checkRobotsAllowed(url, timeoutMs);
    if (!allowed) {
      return {
        outcome: 'blocked',
        statusCode: 403,
        reason: 'robots-disallow',
        finalUrl: url,
        redirectChain: [],
        isPermanentMove: false,
        rawHtml: null,
        etag: null,
        lastModified: null,
        retryAfterSeconds: null
      };
    }
  }

  let currentUrl = url;
  const redirectChain = [];
  let isPermanentMove = false;
  let redirectCount = 0;

  // Redirect handling loop
  while (redirectCount <= maxRedirects) {
    let attempt = 0;
    let res = null;
    let fetchError = null;

    // Retry loop for 5xx and timeouts
    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const headers = {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      };

      // Send conditional GET headers on the first hop only
      if (redirectCount === 0) {
        if (etag) headers['If-None-Match'] = etag;
        if (lastModified) headers['If-Modified-Since'] = lastModified;
      }

      try {
        res = await fetch(currentUrl, {
          method: 'GET',
          headers,
          redirect: 'manual',
          signal: controller.signal
        });
        clearTimeout(timer);

        // Check if 5xx error
        if (res.status >= 500 && res.status < 600) {
          if (attempt < maxRetries) {
            attempt++;
            const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
            await sleep(backoff);
            continue;
          }
          // Retries exhausted for 5xx
          return {
            outcome: 'error',
            statusCode: res.status,
            reason: `HTTP ${res.status} after ${attempt} retries`,
            finalUrl: currentUrl,
            redirectChain,
            isPermanentMove,
            rawHtml: null,
            etag: null,
            lastModified: null,
            retryAfterSeconds: null
          };
        }

        // Response received (non-5xx)
        fetchError = null;
        break;
      } catch (err) {
        clearTimeout(timer);
        fetchError = err;
        if (attempt < maxRetries) {
          attempt++;
          const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
          await sleep(backoff);
          continue;
        }
        // Retries exhausted for timeout or network error
        return {
          outcome: 'error',
          statusCode: null,
          reason: err.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : (err.message || 'Network fetch error'),
          finalUrl: currentUrl,
          redirectChain,
          isPermanentMove,
          rawHtml: null,
          etag: null,
          lastModified: null,
          retryAfterSeconds: null
        };
      }
    }

    // 2. Handle HTTP status codes

    // 304 Not Modified
    if (res.status === 304) {
      return {
        outcome: 'not_modified',
        statusCode: 304,
        finalUrl: currentUrl,
        redirectChain,
        isPermanentMove,
        rawHtml: null,
        etag: res.headers.get('etag') || etag,
        lastModified: res.headers.get('last-modified') || lastModified,
        retryAfterSeconds: null
      };
    }

    // 404 or 410 Dead
    if (res.status === 404 || res.status === 410) {
      return {
        outcome: 'dead',
        statusCode: res.status,
        reason: res.status === 404 ? '404 Not Found' : '410 Gone',
        finalUrl: currentUrl,
        redirectChain,
        isPermanentMove,
        rawHtml: null,
        etag: null,
        lastModified: null,
        retryAfterSeconds: null
      };
    }

    // 403 Forbidden
    if (res.status === 403) {
      return {
        outcome: 'blocked',
        statusCode: 403,
        reason: '403 Forbidden',
        finalUrl: currentUrl,
        redirectChain,
        isPermanentMove,
        rawHtml: null,
        etag: null,
        lastModified: null,
        retryAfterSeconds: null
      };
    }

    // 429 Too Many Requests
    if (res.status === 429) {
      const retryAfterSeconds = parseRetryAfter(res.headers.get('retry-after'));
      return {
        outcome: 'blocked',
        statusCode: 429,
        reason: '429 Too Many Requests',
        finalUrl: currentUrl,
        redirectChain,
        isPermanentMove,
        rawHtml: null,
        etag: null,
        lastModified: null,
        retryAfterSeconds
      };
    }

    // Redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        return {
          outcome: 'error',
          statusCode: res.status,
          reason: `Redirect status ${res.status} missing Location header`,
          finalUrl: currentUrl,
          redirectChain,
          isPermanentMove,
          rawHtml: null,
          etag: null,
          lastModified: null,
          retryAfterSeconds: null
        };
      }

      const nextUrl = new URL(location, currentUrl).href;
      redirectChain.push({
        fromUrl: currentUrl,
        toUrl: nextUrl,
        statusCode: res.status
      });

      if (res.status === 301 || res.status === 308) {
        isPermanentMove = true;
      }

      currentUrl = nextUrl;
      redirectCount++;
      continue;
    }

    // 200 OK (or other 2xx)
    if (res.status >= 200 && res.status < 300) {
      const rawHtml = await res.text();
      return {
        outcome: isPermanentMove ? 'moved' : 'ok',
        statusCode: res.status,
        finalUrl: currentUrl,
        redirectChain,
        isPermanentMove,
        rawHtml,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        retryAfterSeconds: null
      };
    }

    // Any other 4xx status
    return {
      outcome: 'error',
      statusCode: res.status,
      reason: `HTTP ${res.status}`,
      finalUrl: currentUrl,
      redirectChain,
      isPermanentMove,
      rawHtml: null,
      etag: null,
      lastModified: null,
      retryAfterSeconds: null
    };
  }

  // Max redirects exceeded
  return {
    outcome: 'error',
    statusCode: null,
    reason: `Exceeded max redirects (${maxRedirects})`,
    finalUrl: currentUrl,
    redirectChain,
    isPermanentMove,
    rawHtml: null,
    etag: null,
    lastModified: null,
    retryAfterSeconds: null
  };
}

module.exports = {
  fetchSource,
  parseRobotsTxt,
  isPathDisallowed,
  clearRobotsCache,
  getUserAgent,
  parseRetryAfter
};
