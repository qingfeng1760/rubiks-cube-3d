/* 开发/测试用静态服务器：node tests/serve.js [端口]（默认 8933，带 no-store） */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const port = Number(process.argv[2]) || 8933;
const mime = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(__dirname, '..', p);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(f).slice(1)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(d);
  });
}).listen(port, () => console.log('serving on ' + port));
