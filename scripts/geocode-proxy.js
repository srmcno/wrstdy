#!/usr/bin/env node
import http from 'node:http';

const PORT = Number(process.env.PORT || process.env.GEOCODE_PROXY_PORT || 8787);
const CONTACT = process.env.GEOCODE_CONTACT;
const UPSTREAM = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1100;

if (!CONTACT) {
  console.error('Set GEOCODE_CONTACT to an email address or URL before starting the geocoding proxy.');
  process.exit(1);
}

let nextRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const now = Date.now();
  const delay = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_INTERVAL_MS;
  if (delay > 0) await sleep(delay);
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': process.env.GEOCODE_CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': process.env.GEOCODE_CORS_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/healthz') {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method !== 'GET' || url.pathname !== '/api/geocode') {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }

    const q = url.searchParams.get('q')?.trim();
    if (!q) {
      writeJson(res, 400, { error: 'Missing q parameter' });
      return;
    }

    const upstreamUrl = new URL(UPSTREAM);
    upstreamUrl.searchParams.set('q', q);
    upstreamUrl.searchParams.set('format', url.searchParams.get('format') || 'json');
    upstreamUrl.searchParams.set('limit', url.searchParams.get('limit') || '1');
    upstreamUrl.searchParams.set('addressdetails', url.searchParams.get('addressdetails') || '0');

    await waitForRateLimit();
    // Bound the whole upstream exchange (headers + body) — a hung Nominatim
    // would otherwise hold the client request for undici's ~5-minute default.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let upstream, body;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': `wrstdy-geocode-proxy/2.1.0 (${CONTACT})`,
        },
        signal: ac.signal,
      });
      body = await upstream.text();
    } finally {
      clearTimeout(timer);
    }
    res.writeHead(upstream.status, {
      'Access-Control-Allow-Origin': process.env.GEOCODE_CORS_ORIGIN || '*',
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': upstream.headers.get('cache-control') || 'no-store',
    });
    res.end(body);
  } catch (error) {
    writeJson(res, 502, { error: error.message || String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Geocoding proxy listening on http://localhost:${PORT}/api/geocode`);
});
