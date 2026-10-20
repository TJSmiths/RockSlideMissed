// Serves docs/ on http://localhost:8099 for testing before a push.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';

const ROOT = join(import.meta.dirname, 'docs');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.bin': 'application/octet-stream'};
const port = Number(process.env.PORT) || 8099;

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
  const file = join(ROOT, path || 'index.html');
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file.endsWith('\\') || file.endsWith('/') ? join(file, 'index.html') : file);
    res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream'}).end(body);
  } catch (e) {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`));
