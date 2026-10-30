const http = require('http');
const fs = require('fs');
const path = require('path');

let PORT = parseInt(process.env.PORT || '3000', 10);
const CLIENT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/public/index.html';

  let filePath = path.join(CLIENT_DIR, reqPath);

  // If path doesn't exist, try public folder
  if (!fs.existsSync(filePath)) {
    filePath = path.join(CLIENT_DIR, 'public', reqPath);
  }

  // If still not found, fallback to index.html (SPA)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(CLIENT_DIR, 'public', 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading ' + reqPath);
      return;
    }

    if (ext === '.html') {
      content = content.toString('utf-8').replace(/%PUBLIC_URL%/g, '');
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

function listen(portToTry) {
  server.listen(portToTry, () => {
    console.log(`===============================================`);
    console.log(`Scheme Source Watcher Client running at:`);
    console.log(`http://localhost:${portToTry}`);
    console.log(`===============================================`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    PORT++;
    console.log(`Port in use, trying next available port: http://localhost:${PORT}`);
    listen(PORT);
  } else {
    console.error('Server error:', err);
  }
});

listen(PORT);
