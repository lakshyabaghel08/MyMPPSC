#!/usr/bin/env node
/**
 * tools/serve.mjs — a tiny static server for local use.
 *
 * The app is plain static files, so this only needs to serve the repository
 * root with the right content types. Binds 0.0.0.0 so it also works through a
 * remote preview proxy, and never restricts Host or Origin.
 *
 *   node tools/serve.mjs            # http://0.0.0.0:8080
 *   PORT=9000 node tools/serve.mjs
 */

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
};

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = path.normalize(path.join(root, decoded));
  if (!target.startsWith(root)) return null;
  return target;
}

async function resolveFile(urlPath) {
  const target = safeJoin(urlPath);
  if (!target) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      const index = path.join(target, 'index.html');
      const indexInfo = await stat(index).catch(() => null);
      if (indexInfo?.isFile()) return index;
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Only GET and HEAD are supported.');
    return;
  }

  const requested = req.url === '/' ? '/index.html' : req.url;
  let file = await resolveFile(requested);

  if (!file && req.headers.accept?.includes('text/html')) {
    // Unknown path from a browser: fall back to the app shell (hash routing).
    file = path.join(root, 'index.html');
  }

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>404 — not found</h1><p><a href="/">Back to MyMPPSC</a></p>');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const headers = {
    'content-type': TYPES[ext] || 'application/octet-stream',
    // Local development server: never let a stale copy masquerade as the current one.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  // Byte ranges, for the audio. The timer's soundscapes are whole MP3s of up
  // to 24 MB, and a browser asks for a range before it will stream or seek in
  // one; answering 200 with the whole file makes the first tick of ambience
  // wait for a full download. GitHub Pages answers ranges, so this only makes
  // local development behave like production.
  const info = await stat(file);
  headers['accept-ranges'] = 'bytes';
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (match && (match[1] || match[2])) {
    const size = info.size;
    let start = match[1] ? Number(match[1]) : size - Number(match[2] || 0);
    let end = match[1] ? (match[2] ? Number(match[2]) : size - 1) : size - 1;
    start = Math.max(0, Math.min(start, size - 1));
    end = Math.max(start, Math.min(end, size - 1));
    res.writeHead(206, {
      ...headers,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': String(end - start + 1),
    });
    createReadStream(file, { start, end })
      .on('error', () => res.destroy())
      .pipe(res);
    return;
  }

  headers['content-length'] = String(info.size);
  res.writeHead(200, headers);
  createReadStream(file)
    .on('error', () => {
      res.destroy();
    })
    .pipe(res);
});

server.listen(port, host, () => {
  const shown = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`MyMPPSC is served from ${root}`);
  console.log(`Open http://${shown}:${port}/ (bound to ${host}:${port})`);
  console.log('Press Ctrl+C to stop.');
});
