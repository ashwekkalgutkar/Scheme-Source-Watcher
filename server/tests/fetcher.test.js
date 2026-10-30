const http = require('http');
const {
  fetchSource,
  parseRobotsTxt,
  isPathDisallowed,
  clearRobotsCache,
  getUserAgent,
  parseRetryAfter
} = require('../src/fetcher');

describe('Fetcher', () => {
  let server;
  let serverPort;
  let baseUrl;
  let requestsLog = [];
  let customHandler = null;

  beforeAll(done => {
    server = http.createServer((req, res) => {
      requestsLog.push({
        url: req.url,
        method: req.method,
        headers: req.headers
      });

      if (customHandler) {
        return customHandler(req, res);
      }

      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end("User-agent: *\nDisallow: /admin\n\nUser-agent: SchemeWatcher\nDisallow: /secret-scheme\nAllow: /public");
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html', 'ETag': '"v1-hash"' });
      res.end('<html><body><h1>Scheme Page</h1></body></html>');
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
      done();
    });
  });

  afterAll(done => {
    server.close(done);
  });

  beforeEach(() => {
    requestsLog = [];
    customHandler = null;
    clearRobotsCache();
  });

  test('sends User-Agent matching "SchemeWatcher/1.0 (contact: <email>)"', async () => {
    process.env.WATCHER_CONTACT_EMAIL = 'test@example.gov.in';
    const res = await fetchSource(`${baseUrl}/scheme-a`, { skipRobots: true });
    expect(res.outcome).toBe('ok');
    expect(requestsLog[0].headers['user-agent']).toBe('SchemeWatcher/1.0 (contact: test@example.gov.in)');
  });

  test('supports conditional GET with ETag and returns not_modified on 304', async () => {
    customHandler = (req, res) => {
      if (req.headers['if-none-match'] === '"v1-hash"') {
        res.writeHead(304, { 'ETag': '"v1-hash"' });
        res.end();
        return;
      }
      res.writeHead(200, { 'ETag': '"v1-hash"' });
      res.end('OK');
    };

    const res = await fetchSource(`${baseUrl}/scheme-conditional`, {
      etag: '"v1-hash"',
      skipRobots: true
    });

    expect(res.outcome).toBe('not_modified');
    expect(res.statusCode).toBe(304);
  });

  test('handles 301/308 permanent redirect: marks isPermanentMove: true, outcome: moved, records hops', async () => {
    customHandler = (req, res) => {
      if (req.url === '/old-scheme') {
        res.writeHead(301, { 'Location': '/new-scheme' });
        res.end();
        return;
      }
      if (req.url === '/new-scheme') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>New Scheme Content</h1>');
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const res = await fetchSource(`${baseUrl}/old-scheme`, { skipRobots: true });
    expect(res.outcome).toBe('moved');
    expect(res.isPermanentMove).toBe(true);
    expect(res.finalUrl).toBe(`${baseUrl}/new-scheme`);
    expect(res.redirectChain).toHaveLength(1);
    expect(res.redirectChain[0]).toEqual({
      fromUrl: `${baseUrl}/old-scheme`,
      toUrl: `${baseUrl}/new-scheme`,
      statusCode: 301
    });
    expect(res.rawHtml).toContain('New Scheme Content');
  });

  test('handles 302 temporary redirect: outcome ok, isPermanentMove: false', async () => {
    customHandler = (req, res) => {
      if (req.url === '/temp-scheme') {
        res.writeHead(302, { 'Location': '/destination-scheme' });
        res.end();
        return;
      }
      if (req.url === '/destination-scheme') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Destination Content</h1>');
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const res = await fetchSource(`${baseUrl}/temp-scheme`, { skipRobots: true });
    expect(res.outcome).toBe('ok');
    expect(res.isPermanentMove).toBe(false);
    expect(res.finalUrl).toBe(`${baseUrl}/destination-scheme`);
    expect(res.redirectChain).toHaveLength(1);
    expect(res.redirectChain[0].statusCode).toBe(302);
  });

  test('classifies 404 and 410 as dead', async () => {
    customHandler = (req, res) => {
      if (req.url === '/dead-404') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      if (req.url === '/dead-410') {
        res.writeHead(410);
        res.end('Gone');
        return;
      }
      res.writeHead(200);
      res.end();
    };

    const res404 = await fetchSource(`${baseUrl}/dead-404`, { skipRobots: true });
    expect(res404.outcome).toBe('dead');
    expect(res404.statusCode).toBe(404);

    const res410 = await fetchSource(`${baseUrl}/dead-410`, { skipRobots: true });
    expect(res410.outcome).toBe('dead');
    expect(res410.statusCode).toBe(410);
  });

  test('classifies 403 and 429 as blocked and parses Retry-After header', async () => {
    customHandler = (req, res) => {
      if (req.url === '/blocked-403') {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (req.url === '/blocked-429') {
        res.writeHead(429, { 'Retry-After': '120' });
        res.end('Too Many Requests');
        return;
      }
      res.writeHead(200);
      res.end();
    };

    const res403 = await fetchSource(`${baseUrl}/blocked-403`, { skipRobots: true });
    expect(res403.outcome).toBe('blocked');
    expect(res403.statusCode).toBe(403);

    const res429 = await fetchSource(`${baseUrl}/blocked-429`, { skipRobots: true });
    expect(res429.outcome).toBe('blocked');
    expect(res429.statusCode).toBe(429);
    expect(res429.retryAfterSeconds).toBe(120);
  });

  test('respects robots.txt disallow for SchemeWatcher', async () => {
    // robots.txt disallows /secret-scheme for SchemeWatcher
    const res = await fetchSource(`${baseUrl}/secret-scheme`, { skipRobots: false });
    expect(res.outcome).toBe('blocked');
    expect(res.reason).toBe('robots-disallow');
  });

  test('retries on 5xx with backoff up to maxRetries', async () => {
    let callCount = 0;
    customHandler = (req, res) => {
      callCount++;
      if (callCount < 3) {
        res.writeHead(503);
        res.end('Temporary Service Unavailable');
        return;
      }
      res.writeHead(200);
      res.end('Success after recovery');
    };

    const res = await fetchSource(`${baseUrl}/flaky-service`, {
      skipRobots: true,
      maxRetries: 3,
      initialBackoffMs: 20
    });

    expect(res.outcome).toBe('ok');
    expect(res.rawHtml).toBe('Success after recovery');
    expect(callCount).toBe(3);
  });
});
