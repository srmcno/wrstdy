// Shared Anthropic API client + key plumbing. Used by Step 7 (chat),
// Step 2 (rate suggestions), Step 3 (budget review), Step 5 (forecast),
// and the inline "explain this metric" tooltips.
//
// Production deployments should set VITE_AI_PROXY_URL so browser requests go
// to a server-side proxy that owns the Anthropic API key. Browser-direct
// Anthropic access remains available only as an explicit local/internal mode
// when no proxy URL is configured.

export const KEY_STORAGE = 'wrs-anthropic-key';
export const BUILD_KEY = import.meta.env.VITE_ANTHROPIC_KEY || '';
export const AI_PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL || '').trim();
export const DIRECT_ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const USE_AI_PROXY = !!AI_PROXY_URL;
export const MODEL_HEAVY = 'claude-opus-4-7';   // long-form analysis
export const MODEL_LIGHT = 'claude-haiku-4-5-20251001'; // quick suggestions

export const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function getApiKey() {
  // Never use or require a browser-visible key when a proxy is configured.
  if (USE_AI_PROXY) return '';
  return safeGet(KEY_STORAGE) || BUILD_KEY || '';
}
export function hasApiKey() {
  // Historical name kept for callers that only need to know whether AI can run.
  return USE_AI_PROXY || !!getApiKey();
}

function messagesPayload({ system, messages, model, maxTokens }) {
  return { model, max_tokens: maxTokens, system, messages };
}

function assistantText(data) {
  if (typeof data?.text === 'string') return data.text;
  if (typeof data?.content === 'string') return data.content;
  return data?.content?.map(b => b.text || '').join('') || '';
}

async function postMessages(payload) {
  const headers = { 'Content-Type': 'application/json' };

  if (!USE_AI_PROXY) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('No Anthropic API key configured. Open Step 7 → Settings to add one.');
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const resp = await fetch(USE_AI_PROXY ? AI_PROXY_URL : DIRECT_ANTHROPIC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${t.slice(0, 240)}`);
  }
  const data = await resp.json();
  return assistantText(data);
}

/**
 * Send a single user message and return the assistant text.
 * Throws on HTTP error with a useful message.
 */
export async function ask({ system, user, model = MODEL_LIGHT, maxTokens = 1200 }) {
  return postMessages(messagesPayload({
    model,
    maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  }));
}

/**
 * Multi-turn variant for the Step 7 chat.
 */
export async function chat({ system, history, model = MODEL_HEAVY, maxTokens = 4096 }) {
  return postMessages(messagesPayload({ model, maxTokens, system, messages: history }));
}
