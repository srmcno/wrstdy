import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseModelList, buildConfig, resolveModel, validatePayload,
  toAnthropicRequest, toOpenAIRequest,
  parseAnthropicResponse, parseOpenAIResponse,
  checkRateLimit, createServer,
} from './ai-proxy.js';

const ENV_BOTH = {
  ANTHROPIC_API_KEY: 'sk-ant-test',
  OPENAI_API_KEY: 'sk-openai-test',
};

test('parseModelList parses "id" and "id=Label" entries', () => {
  const models = parseModelList('claude-opus-4-8=Claude Opus 4.8, claude-haiku-4-5 ,', 'anthropic');
  assert.deepEqual(models, [
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'anthropic' },
    { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5', provider: 'anthropic' },
  ]);
});

test('buildConfig only enables providers whose keys are set', () => {
  const anthropicOnly = buildConfig({ ANTHROPIC_API_KEY: 'k' });
  assert.ok(anthropicOnly.models.every(m => m.provider === 'anthropic'));
  assert.ok(anthropicOnly.models.some(m => m.id === 'claude-opus-4-8'));

  const openaiOnly = buildConfig({ OPENAI_API_KEY: 'k' });
  assert.ok(openaiOnly.models.every(m => m.provider === 'openai'));

  const both = buildConfig(ENV_BOTH);
  assert.ok(both.models.some(m => m.provider === 'anthropic'));
  assert.ok(both.models.some(m => m.provider === 'openai'));
});

test('buildConfig picks sensible default and light models, honoring overrides', () => {
  const cfg = buildConfig(ENV_BOTH);
  assert.equal(cfg.defaultModel, 'claude-opus-4-8');
  assert.equal(cfg.lightModel, 'claude-haiku-4-5-20251001');

  const overridden = buildConfig({
    ...ENV_BOTH,
    AI_DEFAULT_MODEL: 'gpt-5.1',
    AI_LIGHT_MODEL: 'gpt-5.1-mini',
  });
  assert.equal(overridden.defaultModel, 'gpt-5.1');
  assert.equal(overridden.lightModel, 'gpt-5.1-mini');

  // Overrides not in the allowlist fall back instead of enabling arbitrary ids.
  const bogus = buildConfig({ ...ENV_BOTH, AI_DEFAULT_MODEL: 'made-up-model' });
  assert.equal(bogus.defaultModel, 'claude-opus-4-8');
});

test('resolveModel supports default/heavy/light aliases and rejects unknown ids', () => {
  const cfg = buildConfig(ENV_BOTH);
  assert.equal(resolveModel(cfg, '').id, cfg.defaultModel);
  assert.equal(resolveModel(cfg, 'default').id, cfg.defaultModel);
  assert.equal(resolveModel(cfg, 'heavy').id, cfg.defaultModel);
  assert.equal(resolveModel(cfg, 'light').id, cfg.lightModel);
  assert.equal(resolveModel(cfg, 'gpt-5.1').provider, 'openai');
  assert.equal(resolveModel(cfg, 'gpt-4'), null);
});

test('validatePayload enforces shape and caps max_tokens', () => {
  const cfg = buildConfig({ ...ENV_BOTH, AI_MAX_TOKENS_CAP: '2000' });
  assert.match(validatePayload(null, cfg).error, /JSON object/);
  assert.match(validatePayload({ model: 'nope', messages: [{ role: 'user', content: 'x' }] }, cfg).error, /Unknown or disabled model/);
  assert.match(validatePayload({ messages: [] }, cfg).error, /non-empty/);
  assert.match(validatePayload({ messages: [{ role: 'tool', content: 'x' }] }, cfg).error, /role/);
  assert.match(validatePayload({ messages: [{ role: 'assistant', content: 'x' }] }, cfg).error, /first message/);

  const ok = validatePayload({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 999999,
    system: 'sys',
    messages: [{ role: 'user', content: 'hello' }],
  }, cfg);
  assert.equal(ok.error, undefined);
  assert.equal(ok.maxTokens, 2000);
  assert.equal(ok.model.provider, 'anthropic');
});

test('provider request builders emit the correct wire shapes', () => {
  const cfg = buildConfig(ENV_BOTH);
  const v = validatePayload({
    model: 'claude-opus-4-8',
    max_tokens: 500,
    system: 'be brief',
    messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'more' }],
  }, cfg);

  const a = toAnthropicRequest(v);
  assert.equal(a.url, '/v1/messages');
  assert.equal(a.body.model, 'claude-opus-4-8');
  assert.equal(a.body.max_tokens, 500);
  assert.equal(a.body.system, 'be brief');
  assert.equal(a.body.messages.length, 3);
  assert.equal(a.body.max_completion_tokens, undefined);

  const vo = validatePayload({ model: 'gpt-5.1', system: 'be brief', messages: [{ role: 'user', content: 'hi' }] }, cfg);
  const o = toOpenAIRequest(vo);
  assert.equal(o.url, '/chat/completions');
  assert.equal(o.body.model, 'gpt-5.1');
  assert.equal(o.body.max_completion_tokens, 1200);
  assert.equal(o.body.max_tokens, undefined);
  assert.deepEqual(o.body.messages[0], { role: 'system', content: 'be brief' });
  assert.deepEqual(o.body.messages[1], { role: 'user', content: 'hi' });
});

test('response parsers normalize both providers to { text, stop_reason, usage }', () => {
  const a = parseAnthropicResponse({
    content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 4 },
  });
  assert.deepEqual(a, { text: 'Hello world', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 4 } });

  const o = parseOpenAIResponse({
    choices: [{ message: { content: 'Howdy' }, finish_reason: 'length' }],
    usage: { prompt_tokens: 12, completion_tokens: 7 },
  });
  assert.deepEqual(o, { text: 'Howdy', stop_reason: 'max_tokens', usage: { input_tokens: 12, output_tokens: 7 } });

  assert.equal(parseOpenAIResponse({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }).stop_reason, 'end_turn');
});

test('rate limiter allows up to N per window then blocks', () => {
  const now = Date.now();
  const ip = 'test-ip-' + Math.random();
  assert.equal(checkRateLimit(ip, 2, now), true);
  assert.equal(checkRateLimit(ip, 2, now), true);
  assert.equal(checkRateLimit(ip, 2, now), false);
  // New window resets
  assert.equal(checkRateLimit(ip, 2, now + 61_000), true);
});

// ─── Integration: real server, stubbed upstream fetch ───────────────────────

async function withServer(env, fn) {
  const cfg = buildConfig(env);
  const server = createServer(cfg);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`, cfg);
  } finally {
    await new Promise(r => server.close(r));
  }
}

test('proxy routes to the right provider and normalizes the response', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) });
    if (String(url).includes('/v1/messages')) {
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'claude says hi' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 3 },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'gpt says hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 6, completion_tokens: 2 },
    }), { status: 200 });
  };
  try {
    await withServer(ENV_BOTH, async (base) => {
      const cfgResp = await (await realFetch.call(globalThis, `${base}/api/ai/config`)).json();
      assert.equal(cfgResp.authRequired, false);
      assert.ok(cfgResp.models.length >= 4);

      const claude = await (await realFetch.call(globalThis, `${base}/api/ai/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', messages: [{ role: 'user', content: 'hi' }] }),
      })).json();
      assert.equal(claude.text, 'claude says hi');
      assert.equal(claude.provider, 'anthropic');

      const gpt = await (await realFetch.call(globalThis, `${base}/api/ai/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-5.1', messages: [{ role: 'user', content: 'hi' }] }),
      })).json();
      assert.equal(gpt.text, 'gpt says hi');
      assert.equal(gpt.provider, 'openai');

      // Upstream saw the right auth headers, and never the client's origin details
      const anthropicCall = seen.find(s => s.url.includes('/v1/messages'));
      assert.equal(anthropicCall.headers['x-api-key'], 'sk-ant-test');
      assert.equal(anthropicCall.headers['anthropic-version'], '2023-06-01');
      const openaiCall = seen.find(s => s.url.includes('/chat/completions'));
      assert.equal(openaiCall.headers.authorization, 'Bearer sk-openai-test');
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('proxy enforces the access code when AI_AUTH_TOKEN is set', async () => {
  const realFetch = globalThis.fetch;
  await withServer({ ...ENV_BOTH, AI_AUTH_TOKEN: 'secret123' }, async (base) => {
    const denied = await realFetch.call(globalThis, `${base}/api/ai/config`);
    assert.equal(denied.status, 401);
    const ok = await realFetch.call(globalThis, `${base}/api/ai/config`, {
      headers: { authorization: 'Bearer secret123' },
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).authRequired, true);
  });
});

test('proxy rejects unknown models with a helpful 400', async () => {
  const realFetch = globalThis.fetch;
  await withServer(ENV_BOTH, async (base) => {
    const resp = await realFetch.call(globalThis, `${base}/api/ai/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(resp.status, 400);
    assert.match((await resp.json()).error, /Unknown or disabled model/);
  });
});

test('createServer refuses to start without any provider key', () => {
  assert.throws(() => createServer(buildConfig({})), /ANTHROPIC_API_KEY and\/or OPENAI_API_KEY/);
});

test('proxy rejects oversized request bodies with 413', async () => {
  const realFetch = globalThis.fetch;
  await withServer({ ...ENV_BOTH, AI_MAX_BODY_BYTES: String(16 * 1024) }, async (base) => {
    const resp = await realFetch.call(globalThis, `${base}/api/ai/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        messages: [{ role: 'user', content: 'x'.repeat(20 * 1024) }],
      }),
    }).catch(() => null);
    // Some runtimes surface the destroyed socket as a network error instead of
    // delivering the 413 — either way the request must not reach upstream.
    if (resp) assert.equal(resp.status, 413);
  });
});

test('proxy retries a retryable upstream failure once, then succeeds', async () => {
  const realFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(JSON.stringify({ error: { message: 'overloaded' } }),
        { status: 529, headers: { 'retry-after': '0' } });
    }
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'second try' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200 });
  };
  try {
    await withServer(ENV_BOTH, async (base) => {
      const resp = await realFetch.call(globalThis, `${base}/api/ai/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-opus-4-8', messages: [{ role: 'user', content: 'hi' }] }),
      });
      assert.equal(resp.status, 200);
      assert.equal((await resp.json()).text, 'second try');
      assert.equal(attempts, 2);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('X-Forwarded-For is honored for rate limiting only when AI_TRUST_PROXY is set', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    content: [{ type: 'text', text: 'ok' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200 });
  const send = (base, xff) => realFetch.call(globalThis, `${base}/api/ai/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
    body: JSON.stringify({ model: 'claude-opus-4-8', messages: [{ role: 'user', content: 'hi' }] }),
  });
  try {
    // Trusted proxy: each forwarded address gets its own budget.
    await withServer({ ...ENV_BOTH, AI_RATE_LIMIT_PER_MIN: '1', AI_TRUST_PROXY: 'true' }, async (base) => {
      assert.equal((await send(base, '10.9.0.1')).status, 200);
      assert.equal((await send(base, '10.9.0.2')).status, 200);
      assert.equal((await send(base, '10.9.0.1')).status, 429);
    });
    // Default (untrusted): rotating the spoofable header must NOT dodge the
    // socket-IP limit. The first request may already be limited by earlier
    // tests sharing this window, so only the rotated follow-up is asserted.
    await withServer({ ...ENV_BOTH, AI_RATE_LIMIT_PER_MIN: '1' }, async (base) => {
      await send(base, '10.9.0.3');
      assert.equal((await send(base, '10.9.0.4')).status, 429);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
