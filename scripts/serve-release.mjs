import {createServer} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {extname, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const types = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

export async function serveRelease(directory, port = 0) {
  const root = await realpath(directory);
  const prefix = '/landreview/';
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {Allow:'GET, HEAD'}).end();
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (!pathname.startsWith(prefix) || pathname.includes('\\') || pathname.includes('\0')) {
      res.writeHead(404).end();
      return;
    }
    const requested = pathname.slice(prefix.length) || 'index.html';
    try {
      const file = await realpath(resolve(root, requested));
      const inside = relative(root, file);
      if (!inside || inside === '..' || inside.startsWith('..' + sep) || resolve(root, inside) !== file) {
        res.writeHead(404).end();
        return;
      }
      const mime = types[extname(file)];
      if (!mime) { res.writeHead(404).end(); return; }
      const bytes = await readFile(file);
      res.writeHead(200, {'Content-Type':mime, 'Content-Length':bytes.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
      res.end(req.method === 'GET' ? bytes : undefined);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      accept();
    });
  });
  return {url:new URL(prefix, 'http://127.0.0.1:' + server.address().port), server};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.argv[2] ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Specify a valid port, or omit it for 8080.');
  const {url} = await serveRelease(fileURLToPath(new URL('./site/',import.meta.url)), port);
  console.log('India Land Search local demo: ' + new URL('?demo=1', url));
}
