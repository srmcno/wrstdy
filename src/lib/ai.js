// Shared AI client + key plumbing. Used by Step 7 (chat),
// Step 2 (rate suggestions), Step 3 (budget review), Step 1 (estimates),
// and the inline "explain this metric" tooltips.
//
// Two modes:
//   1. Proxy mode (recommended): VITE_AI_PROXY_URL points at scripts/ai-proxy.js
//      (or any compatible endpoint). Provider API keys stay on the server; the
//      proxy advertises its enabled models via GET <base>/config and the user
//      can pick one in Step 7 → Settings. Supports Anthropic and OpenAI models.
//   2. Direct-browser mode (local/internal only): calls Anthropic directly with
//      a per-device key. Anthropic only.

export const KEY_STORAGE = 'wrs-anthropic-key';
export const MODEL_STORAGE = 'wrs-ai-model';
export const ACCESS_STORAGE = 'wrs-ai-access-code';
export const BUILD_KEY = import.meta.env.VITE_ANTHROPIC_KEY || '';
export const AI_PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL || '').trim();
export const DIRECT_ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const USE_AI_PROXY = !!AI_PROXY_URL;

// Tier sentinels: callers ask for the "heavy" (long-form analysis) or "light"
// (quick suggestion) tier; the actual model comes from the user's Settings
// pick and, in proxy mode, the server's configuration.
export const MODEL_HEAVY = 'heavy';
export const MODEL_LIGHT = 'light';

// Anthropic models offered in direct-browser mode (no proxy to ask).
export const DIRECT_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)', provider: 'anthropic' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced)', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)', provider: 'anthropic' },
];
const DIRECT_DEFAULT = 'claude-opus-4-8';
const DIRECT_LIGHT = 'claude-haiku-4-5-20251001';

export const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
export const safeDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export function getApiKey() {
  // Never use or require a browser-visible key when a proxy is configured.
  if (USE_AI_PROXY) return '';
  return safeGet(KEY_STORAGE) || BUILD_KEY || '';
}
export function hasApiKey() {
  // Historical name kept for callers that only need to know whether AI can run.
  return USE_AI_PROXY || !!getApiKey();
}

export function getSelectedModel() { return safeGet(MODEL_STORAGE) || ''; }
export function setSelectedModel(id) { id ? safeSet(MODEL_STORAGE, id) : safeDel(MODEL_STORAGE); }
export function getAccessCode() { return safeGet(ACCESS_STORAGE) || ''; }
export function setAccessCode(v) { v ? safeSet(ACCESS_STORAGE, v) : safeDel(ACCESS_STORAGE); }

// ─── Proxy configuration (models the server has enabled) ────────────────────

const configUrl = () => AI_PROXY_URL.replace(/\/messages\/?$/, '') + '/config';
let cachedConfig = null;

export async function fetchAiConfig({ force = false } = {}) {
  if (!USE_AI_PROXY) return null;
  if (cachedConfig && !force) return cachedConfig;
  const headers = {};
  const code = getAccessCode();
  if (code) headers['Authorization'] = `Bearer ${code}`;
  const resp = await fetch(configUrl(), { headers });
  if (!resp.ok) {
    const err = new Error(resp.status === 401
      ? 'The AI server requires an access code. Enter it in Step 7 → Settings.'
      : `Could not load AI server settings (HTTP ${resp.status}).`);
    err.status = resp.status;
    throw err;
  }
  cachedConfig = await resp.json();
  return cachedConfig;
}
export function getCachedAiConfig() { return cachedConfig; }

// Resolve the tier sentinel (or explicit id) to what we actually send.
function resolveModel(model) {
  const selected = getSelectedModel();
  if (USE_AI_PROXY) {
    if (model === MODEL_LIGHT) return 'light';
    if (!model || model === MODEL_HEAVY) return selected || 'default';
    return model; // explicit id — the proxy validates against its allowlist
  }
  const valid = (id) => DIRECT_MODELS.some(m => m.id === id);
  if (model === MODEL_LIGHT) return DIRECT_LIGHT;
  if (!model || model === MODEL_HEAVY) return valid(selected) ? selected : DIRECT_DEFAULT;
  return valid(model) ? model : DIRECT_DEFAULT;
}

// ─── Request plumbing ────────────────────────────────────────────────────────

function messagesPayload({ system, messages, model, maxTokens }) {
  return { model: resolveModel(model), max_tokens: maxTokens, system, messages };
}

function extractText(data) {
  if (typeof data?.text === 'string') return data.text;
  if (typeof data?.content === 'string') return data.content;
  if (Array.isArray(data?.content)) return data.content.map(b => b?.text || '').join('');
  return null;
}

function friendlyHttpError(status, bodyText) {
  let detail = '';
  try { detail = JSON.parse(bodyText)?.error?.message || JSON.parse(bodyText)?.error || ''; } catch { detail = ''; }
  if (typeof detail !== 'string') detail = '';
  const suffix = detail ? ` (${detail.slice(0, 160)})` : '';
  if (status === 401 || status === 403) {
    return USE_AI_PROXY
      ? `Not authorized by the AI server — check the access code in Step 7 → Settings.${suffix}`
      : `The API key was rejected — check it in Step 7 → Settings.${suffix}`;
  }
  if (status === 429) return `The AI service is rate-limiting requests. Wait a minute and try again.${suffix}`;
  if (status === 529 || status === 503) return `The AI service is temporarily overloaded. Try again shortly.${suffix}`;
  if (status === 504) return `The AI request timed out on the server. Try again.${suffix}`;
  return `AI request failed (HTTP ${status})${suffix || ': ' + String(bodyText || '').slice(0, 200)}`;
}

const RETRYABLE = new Set([429, 500, 502, 503, 529]);

async function postMessages(payload, { timeoutMs = 150_000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (USE_AI_PROXY) {
    const code = getAccessCode();
    if (code) headers['Authorization'] = `Bearer ${code}`;
  } else {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('No AI API key configured. Open Step 7 → Settings to add one.');
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const attempt = async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fetch(USE_AI_PROXY ? AI_PROXY_URL : DIRECT_ANTHROPIC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('The AI request timed out. The service may be busy — try again.');
      }
      throw new Error('Could not reach the AI service — check your network connection.');
    } finally {
      clearTimeout(timer);
    }
  };

  let resp = await attempt();
  if (RETRYABLE.has(resp.status)) {
    await new Promise(r => setTimeout(r, 2000));
    resp = await attempt();
  }
  const bodyText = await resp.text();
  if (!resp.ok) throw new Error(friendlyHttpError(resp.status, bodyText));

  let data;
  try { data = JSON.parse(bodyText); } catch {
    throw new Error('The AI service returned an unreadable response. Try again.');
  }
  const text = extractText(data);
  if (!text || !text.trim()) {
    // Never silently save a blank analysis with a fresh timestamp.
    throw new Error('The AI service returned an empty response. Try again; if it persists, check the proxy configuration.');
  }
  return { text, stopReason: data?.stop_reason ?? null };
}

/**
 * Send a single user message and return the assistant text.
 * Throws on HTTP error / empty reply with a useful message.
 */
export async function ask({ system, user, model = MODEL_LIGHT, maxTokens = 1200 }) {
  const { text } = await postMessages(messagesPayload({
    model,
    maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  }), { timeoutMs: 90_000 });
  return text;
}

/**
 * Multi-turn variant for the Step 7 chat.
 * Returns { text, stopReason } — stopReason === 'max_tokens' means the reply
 * was cut off and the caller should surface a truncation note.
 */
export async function chat({ system, history, model = MODEL_HEAVY, maxTokens = 8000 }) {
  return postMessages(messagesPayload({ model, maxTokens, system, messages: history }), { timeoutMs: 180_000 });
}
