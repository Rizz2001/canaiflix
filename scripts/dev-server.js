const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const WEB_ROOT = path.join(__dirname, '..', 'web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.m3u': 'text/plain; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl'
};

const server = http.createServer((req, res) => {
  // Normalize URL and remove query strings
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let safePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(WEB_ROOT, safePath);

  // Security check: ensure path is within WEB_ROOT
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${safePath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🚀 CanaimaFlix Dev Server activo en:`);
  console.log(`   - Local:    http://localhost:${PORT}`);
  console.log(`   - Tablet:   http://localhost:${PORT} (vía adb reverse)`);
  console.log(`=================================================`);
});
