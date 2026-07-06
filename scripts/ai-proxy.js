#!/usr/bin/env node
// Multi-provider AI proxy for the Water Rate Study Tool.
//
// A single dependency-free Node server (Node 18+) that keeps provider API
// keys on the server and lets the browser app talk to Anthropic (Claude) and
// OpenAI models through one endpoint. Modeled on scripts/geocode-proxy.js.
//
//   ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... node scripts/ai-proxy.js
//
// Routes:
//   GET  /healthz          → { ok: true }
//   GET  /api/ai/config    → enabled models, default/light model, auth requirement
//   POST /api/ai/messages  → provider-neutral chat: { model?, max_tokens?, system?, messages }
//                            → { text, model, provider, stop_reason, usage }
//   (optional) static file serving of the built app when AI_STATIC_DIR is set
//
// Environment:
//   ANTHROPIC_API_KEY        enable Anthropic models
//   OPENAI_API_KEY           enable OpenAI models
//   ANTHROPIC_MODELS         csv allowlist, "id" or "id=Label" (default below)
//   OPENAI_MODELS            csv allowlist, "id" or "id=Label" (default below)
//   AI_DEFAULT_MODEL         model used when the client doesn't pick one
//   AI_LIGHT_MODEL           cheaper model used for quick suggestions
//   AI_PROXY_PORT / PORT     listen port (default 8788)
//   AI_CORS_ORIGIN           Access-Control-Allow-Origin (default *)
//   AI_AUTH_TOKEN            if set, clients must send Authorization: Bearer <token>
//   AI_MAX_TOKENS_CAP        server-side max_tokens ceiling (default 8192)
//   AI_RATE_LIMIT_PER_MIN    per-IP request limit (default 30)
//   AI_MAX_BODY_BYTES        request body cap (default 1 MiB)
//   AI_UPSTREAM_TIMEOUT_MS   upstream request timeout (default 120000)
//   ANTHROPIC_BASE_URL       default https://api.anthropic.com
//   OPENAI_BASE_URL          default https://api.openai.com/v1 (Azure/compatible OK)
//   AI_STATIC_DIR            serve this directory (e.g. ./dist) so one container
//                            hosts both the app and the AI endpoint

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_ANTHROPIC_MODELS =
  'claude-opus-4-8=Claude Opus 4.8 (most capable),claude-sonnet-5=Claude Sonnet 5 (balanced),claude-haiku-4-5=Claude Haiku 4.5 (fast)';
const DEFAULT_OPENAI_MODELS =
  'gpt-5.1=GPT-5.1,gpt-5.1-mini=GPT-5.1 mini (fast)';

export function parseModelList(csv, provider) {
  return String(csv || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const eq = entry.indexOf('=');
      const id = (eq === -1 ? entry : entry.slice(0, eq)).trim();
      const label = (eq === -1 ? entry : entry.slice(eq + 1)).trim() || id;
      return { id, label, provider };
    })
    .filter(m => m.id);
}

export function buildConfig(env = process.env) {
  const anthropicKey = (env.ANTHROPIC_API_KEY || '').trim();
  const openaiKey = (env.OPENAI_API_KEY || '').trim();
  const models = [
    ...(anthropicKey ? parseModelList(env.ANTHROPIC_MODELS || DEFAULT_ANTHROPIC_MODELS, 'anthropic') : []),
    ...(openaiKey ? parseModelList(env.OPENAI_MODELS || DEFAULT_OPENAI_MODELS, 'openai') : []),
  ];
  const byId = new Map(models.map(m => [m.id, m]));
  const pick = (wanted, fallback) => (wanted && byId.has(wanted) ? wanted : fallback);
  const defaultModel = pick((env.AI_DEFAULT_MODEL || '').trim(), models[0]?.id || '');
  // Prefer an explicitly configured light model, else a model whose label
  // says "fast", else the default.
  const lightGuess = models.find(m => /fast|mini|haiku/i.test(m.label + ' ' + m.id))?.id;
  const lightModel = pick((env.AI_LIGHT_MODEL || '').trim(), lightGuess || defaultModel);
  return {
    anthropicKey,
    openaiKey,
    anthropicBase: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
    openaiBase: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    models,
    byId,
    defaultModel,
    lightModel,
    port: Number(env.AI_PROXY_PORT || env.PORT || 8788),
    corsOrigin: env.AI_CORS_ORIGIN || '*',
    authToken: (env.AI_AUTH_TOKEN || '').trim(),
    maxTokensCap: Math.max(256, Number(env.AI_MAX_TOKENS_CAP) || 8192),
    rateLimitPerMin: Math.max(1, Number(env.AI_RATE_LIMIT_PER_MIN) || 30),
    maxBodyBytes: Math.max(16 * 1024, Number(env.AI_MAX_BODY_BYTES) || 1024 * 1024),
    upstreamTimeoutMs: Math.max(5000, Number(env.AI_UPSTREAM_TIMEOUT_MS) || 120000),
    staticDir: (env.AI_STATIC_DIR || '').trim(),
  };
}

// ─── Request validation & provider translation (pure, unit-tested) ──────────

export function resolveModel(cfg, requested) {
  const want = String(requested || '').trim();
  if (!want || want === 'default' || want === 'heavy') return cfg.byId.get(cfg.defaultModel) || null;
  if (want === 'light') return cfg.byId.get(cfg.lightModel) || null;
  return cfg.byId.get(want) || null;
}

export function validatePayload(body, cfg) {
  if (!body || typeof body !== 'object') return { error: 'Body must be a JSON object.' };
  const model = resolveModel(cfg, body.model);
  if (!model) return { error: `Unknown or disabled model "${body.model}". Ask the server admin to enable it, or GET /api/ai/config for the allowed list.` };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { error: 'messages must be a non-empty array of { role, content }.' };
  }
  const messages = [];
  for (const m of body.messages) {
    const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
    const content = typeof m?.content === 'string' ? m.content : null;
    if (!role || content == null) return { error: 'Each message needs role "user"|"assistant" and string content.' };
    messages.push({ role, content });
  }
  if (messages[0].role !== 'user') return { error: 'The first message must have role "user".' };
  const system = typeof body.system === 'string' ? body.system : '';
  const maxTokens = Math.min(cfg.maxTokensCap, Math.max(1, Math.floor(Number(body.max_tokens) || 1200)));
  return { model, messages, system, maxTokens };
}

export function toAnthropicRequest(v) {
  return {
    url: '/v1/messages',
    body: {
      model: v.model.id,
      max_tokens: v.maxTokens,
      ...(v.system ? { system: v.system } : {}),
      messages: v.messages,
    },
  };
}

export function toOpenAIRequest(v) {
  return {
    url: '/chat/completions',
    body: {
      model: v.model.id,
      // Newer OpenAI models reject max_tokens in favor of max_completion_tokens.
      max_completion_tokens: v.maxTokens,
      messages: [
        ...(v.system ? [{ role: 'system', content: v.system }] : []),
        ...v.messages,
      ],
    },
  };
}

export function parseAnthropicResponse(data) {
  const text = Array.isArray(data?.content)
    ? data.content.filter(b => b?.type === 'text' || typeof b?.text === 'string').map(b => b.text || '').join('')
    : '';
  return {
    text,
    stop_reason: data?.stop_reason || null,
    usage: {
      input_tokens: data?.usage?.input_tokens ?? null,
      output_tokens: data?.usage?.output_tokens ?? null,
    },
  };
}

export function parseOpenAIResponse(data) {
  const choice = data?.choices?.[0];
  const finish = choice?.finish_reason || null;
  return {
    text: typeof choice?.message?.content === 'string' ? choice.message.content : '',
    stop_reason: finish === 'length' ? 'max_tokens' : finish === 'stop' ? 'end_turn' : finish,
    usage: {
      input_tokens: data?.usage?.prompt_tokens ?? null,
      output_tokens: data?.usage?.completion_tokens ?? null,
    },
  };
}

// ─── Server plumbing ─────────────────────────────────────────────────────────

const RETRYABLE = new Set([429, 500, 502, 503, 529]);

async function callUpstream(cfg, v) {
  const provider = v.model.provider;
  const req = provider === 'anthropic' ? toAnthropicRequest(v) : toOpenAIRequest(v);
  const url = (provider === 'anthropic' ? cfg.anthropicBase : cfg.openaiBase) + req.url;
  const headers = provider === 'anthropic'
    ? { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' }
    : { 'content-type': 'application/json', 'authorization': `Bearer ${cfg.openaiKey}` };

  const attempt = async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), cfg.upstreamTimeoutMs);
    try {
      return await fetch(url, { method: 'POST', headers, body: JSON.stringify(req.body), signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let resp = await attempt();
  if (RETRYABLE.has(resp.status)) {
    const retryAfter = Number(resp.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) ? Math.min(10_000, retryAfter * 1000) : 2000;
    await new Promise(r => setTimeout(r, waitMs));
    resp = await attempt();
  }
  const raw = await resp.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* leave null */ }
  if (!resp.ok) {
    const upstreamMsg = data?.error?.message || raw.slice(0, 200);
    const err = new Error(upstreamMsg || `Upstream ${provider} error`);
    err.status = resp.status;
    err.provider = provider;
    throw err;
  }
  const parsed = provider === 'anthropic' ? parseAnthropicResponse(data) : parseOpenAIResponse(data);
  return { ...parsed, model: v.model.id, provider };
}

function corsHeaders(cfg) {
  return {
    'Access-Control-Allow-Origin': cfg.corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function writeJson(cfg, res, status, body) {
  res.writeHead(status, {
    ...corsHeaders(cfg),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Fixed-window per-IP rate limiter — small systems, small numbers.
const rateWindows = new Map();
export function checkRateLimit(ip, limitPerMin, now = Date.now()) {
  const windowStart = Math.floor(now / 60_000);
  const entry = rateWindows.get(ip);
  if (!entry || entry.windowStart !== windowStart) {
    rateWindows.set(ip, { windowStart, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limitPerMin;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

async function serveStatic(cfg, res, urlPath) {
  const root = path.resolve(cfg.staticDir);
  const rel = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
  let filePath = path.resolve(root, '.' + rel);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    writeJson(cfg, res, 404, { error: 'Not found' });
    return;
  }
  try {
    let st = await stat(filePath).catch(() => null);
    if (!st || st.isDirectory()) {
      // SPA fallback — unknown paths get index.html
      filePath = path.join(root, 'index.html');
      st = await stat(filePath);
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  } catch {
    writeJson(cfg, res, 404, { error: 'Not found' });
  }
}

export function createServer(cfg) {
  if (!cfg.anthropicKey && !cfg.openaiKey) {
    throw new Error('Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY before starting the AI proxy.');
  }
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const log = (status, extra = {}) => {
      // Never log prompt/response content — studies contain system finances.
      console.log(JSON.stringify({
        ts: new Date().toISOString(), ip, method: req.method, path: url.pathname,
        status, ms: Date.now() - started, ...extra,
      }));
    };

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders(cfg));
        res.end();
        return;
      }

      if (url.pathname === '/healthz') {
        writeJson(cfg, res, 200, { ok: true });
        return;
      }

      const isApi = url.pathname.startsWith('/api/ai/');
      if (isApi && cfg.authToken) {
        const auth = req.headers.authorization || '';
        if (auth !== `Bearer ${cfg.authToken}`) {
          writeJson(cfg, res, 401, { error: 'Missing or invalid access code. Enter the access code in Step 7 → Settings.' });
          log(401);
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/ai/config') {
        writeJson(cfg, res, 200, {
          models: cfg.models.map(({ id, label, provider }) => ({ id, label, provider })),
          defaultModel: cfg.defaultModel,
          lightModel: cfg.lightModel,
          authRequired: !!cfg.authToken,
          maxTokensCap: cfg.maxTokensCap,
        });
        log(200);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/ai/messages') {
        if (!checkRateLimit(ip, cfg.rateLimitPerMin)) {
          writeJson(cfg, res, 429, { error: 'Too many requests — try again in a minute.' });
          log(429);
          return;
        }
        let body;
        try {
          body = JSON.parse(await readBody(req, cfg.maxBodyBytes));
        } catch (e) {
          writeJson(cfg, res, e.status === 413 ? 413 : 400, { error: e.status === 413 ? 'Request too large.' : 'Body must be valid JSON.' });
          log(e.status === 413 ? 413 : 400);
          return;
        }
        const v = validatePayload(body, cfg);
        if (v.error) {
          writeJson(cfg, res, 400, { error: v.error });
          log(400);
          return;
        }
        try {
          const out = await callUpstream(cfg, v);
          writeJson(cfg, res, 200, out);
          log(200, { model: out.model, provider: out.provider, in: out.usage.input_tokens, out: out.usage.output_tokens, stop: out.stop_reason });
        } catch (e) {
          const status = e.name === 'AbortError' ? 504 : (e.status === 429 ? 429 : 502);
          const msg = e.name === 'AbortError'
            ? 'The AI provider took too long to respond. Try again.'
            : e.status === 401 || e.status === 403
              ? `The server's ${e.provider || ''} API key was rejected — contact the administrator.`
              : e.status === 429
                ? 'The AI provider is rate-limiting requests. Wait a minute and try again.'
                : `Upstream AI error: ${e.message || 'unknown error'}`;
          writeJson(cfg, res, status, { error: msg });
          log(status, { model: v.model.id, provider: v.model.provider, upstreamStatus: e.status });
        }
        return;
      }

      if (cfg.staticDir && req.method === 'GET' && !isApi) {
        await serveStatic(cfg, res, url.pathname);
        return;
      }

      writeJson(cfg, res, 404, { error: 'Not found' });
      log(404);
    } catch (error) {
      writeJson(cfg, res, 500, { error: 'Internal proxy error' });
      log(500, { err: error.message });
    }
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let cfg;
  try {
    cfg = buildConfig();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  let server;
  try {
    server = createServer(cfg);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  server.listen(cfg.port, () => {
    const providers = [cfg.anthropicKey && 'anthropic', cfg.openaiKey && 'openai'].filter(Boolean).join(', ');
    console.log(`AI proxy listening on http://localhost:${cfg.port}/api/ai/messages`);
    console.log(`Providers: ${providers} | models: ${cfg.models.map(m => m.id).join(', ')}`);
    console.log(`Default model: ${cfg.defaultModel} | light model: ${cfg.lightModel}`);
    if (cfg.staticDir) console.log(`Serving static app from ${path.resolve(cfg.staticDir)}`);
    if (!cfg.authToken) console.log('WARNING: AI_AUTH_TOKEN not set — anyone who can reach this port can spend your API credits. Set it for anything beyond localhost.');
  });
}
