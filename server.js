const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3000;
const host = '0.0.0.0';
const publicDir = path.join(__dirname, 'public');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = path.normalize(urlPath).replace(/^([.][.][/\\])+/, '');
  let filePath = path.join(publicDir, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(publicDir)) filePath = path.join(publicDir, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(publicDir, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html);
      });
      return;
    }
    res.writeHead(200, {'Content-Type': types[path.extname(filePath)] || 'application/octet-stream'});
    res.end(data);
  });
});
server.listen(port, host, () => console.log(`Route calculation app listening on ${host}:${port}`));
