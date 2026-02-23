'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const port = Number.parseInt(process.env.PORT, 10) || 3000;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon']
]);

function getContentType(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function tryFile(filePath, res) {
  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    if (stat.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      fs.stat(indexPath, (indexErr, indexStat) => {
        if (indexErr || !indexStat.isFile()) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }

        res.writeHead(200, { 'Content-Type': getContentType(indexPath) });
        fs.createReadStream(indexPath).pipe(res);
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const safePath = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  tryFile(filePath, res);
});

server.listen(port, () => {
  console.log(`Static server running at http://127.0.0.1:${port}/`);
});
