// Shared Anthropic API client + key plumbing. Used by Step 7 (chat),
// Step 2 (rate suggestions), Step 3 (budget review), Step 5 (forecast),
// and the inline "explain this metric" tooltips.

export const KEY_STORAGE = 'wrs-anthropic-key';
export const BUILD_KEY = import.meta.env.VITE_ANTHROPIC_KEY || '';
export const MODEL_HEAVY = 'claude-opus-4-7';   // long-form analysis
export const MODEL_LIGHT = 'claude-haiku-4-5-20251001'; // quick suggestions

export const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function getApiKey() {
  return safeGet(KEY_STORAGE) || BUILD_KEY || '';
}
export function hasApiKey() {
  return !!getApiKey();
}

/**
 * Send a single user message and return the assistant text.
 * Throws on HTTP error with a useful message.
 */
export async function ask({ system, user, model = MODEL_LIGHT, maxTokens = 1200 }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No Anthropic API key configured. Open Step 7 → Settings to add one.');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${t.slice(0, 240)}`);
  }
  const data = await resp.json();
  return data.content?.map(b => b.text || '').join('') || '';
}

/**
 * Multi-turn variant for the Step 7 chat.
 */
export async function chat({ system, history, model = MODEL_HEAVY, maxTokens = 4096 }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No Anthropic API key configured. Open Settings to add one.');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: history }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${t.slice(0, 240)}`);
  }
  const data = await resp.json();
  return data.content?.map(b => b.text || '').join('') || '';
}
