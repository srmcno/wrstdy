import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPowerAppsHost, parseStudiesJson, bytesToBase64,
  MAX_FILE_BYTES, MAX_TEXT_PROPERTY_CHARS,
} from './pcfHost.js';

// ─── StudiesJson parsing ────────────────────────────────────────────────────
// App makers bind whatever their data source hands them. All four shapes below
// occur in practice, and a parse failure must degrade to "no studies" rather
// than taking the control down on someone's screen.

test('parseStudiesJson accepts an array of studies', () => {
  assert.deepEqual(parseStudiesJson('[{"id":"a"},{"id":"b"}]'), [{ id: 'a' }, { id: 'b' }]);
});

test('parseStudiesJson accepts a bare study object', () => {
  assert.deepEqual(parseStudiesJson('{"id":"a","name":"Study"}'), [{ id: 'a', name: 'Study' }]);
});

test('parseStudiesJson unwraps an export envelope', () => {
  assert.deepEqual(parseStudiesJson('{"version":"2.2.0","study":{"id":"a"}}'), [{ id: 'a' }]);
  assert.deepEqual(parseStudiesJson('{"version":"2.2.0","studies":[{"id":"a"}]}'), [{ id: 'a' }]);
});

test('parseStudiesJson returns an empty library for anything unusable', () => {
  assert.deepEqual(parseStudiesJson(''), []);
  assert.deepEqual(parseStudiesJson('   '), []);
  assert.deepEqual(parseStudiesJson(null), []);
  assert.deepEqual(parseStudiesJson(undefined), []);
  assert.deepEqual(parseStudiesJson('not json'), []);
  assert.deepEqual(parseStudiesJson('[]'), []);
  assert.deepEqual(parseStudiesJson('"a string"'), []);
  assert.deepEqual(parseStudiesJson('42'), []);
});

test('parseStudiesJson drops non-object entries rather than passing nulls through', () => {
  assert.deepEqual(parseStudiesJson('[{"id":"a"},null,"x",5]'), [{ id: 'a' }]);
});

// ─── base64 ─────────────────────────────────────────────────────────────────

test('bytesToBase64 round-trips binary content', () => {
  const bytes = new Uint8Array([0, 1, 2, 254, 255, 65, 66, 67]);
  const b64 = bytesToBase64(bytes);
  assert.deepEqual(new Uint8Array(Buffer.from(b64, 'base64')), bytes);
});

test('bytesToBase64 handles a payload larger than the call-argument limit', () => {
  // String.fromCharCode.apply throws past roughly 100k arguments, which a
  // report PDF comfortably exceeds — hence the chunked implementation.
  const bytes = new Uint8Array(300_000).map((_, i) => i % 256);
  const b64 = bytesToBase64(bytes);
  assert.equal(Buffer.from(b64, 'base64').length, 300_000);
});

// ─── deliverFile ────────────────────────────────────────────────────────────

const collectHost = (overrides = {}) => {
  const files = [];
  const saved = [];
  const host = createPowerAppsHost({
    readStudies: () => [],
    writeStudies: (s) => saved.push(s),
    emitFile: (f) => files.push(f),
    ...overrides,
  });
  return { host, files, saved };
};

test('deliverFile hands bytes to the host as base64 with its metadata', async () => {
  const { host, files } = collectHost();
  const result = await host.deliverFile({
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    bytes: new Uint8Array([1, 2, 3]),
    kind: 'report-pdf',
    studyId: 'study-1',
  });
  assert.equal(result.ok, true);
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, 'report.pdf');
  assert.equal(files[0].mimeType, 'application/pdf');
  assert.equal(files[0].sizeBytes, 3);
  assert.equal(files[0].kind, 'report-pdf');
  assert.equal(files[0].studyId, 'study-1');
  assert.deepEqual(new Uint8Array(Buffer.from(files[0].base64, 'base64')), new Uint8Array([1, 2, 3]));
});

test('deliverFile encodes text payloads as UTF-8', async () => {
  const { host, files } = collectHost();
  await host.deliverFile({ filename: 'rates.csv', mimeType: 'text/csv', text: 'name,rate\nAntlers,4.25\n' });
  assert.equal(Buffer.from(files[0].base64, 'base64').toString('utf8'), 'name,rate\nAntlers,4.25\n');
});

test('deliverFile refuses a file too large for a text output property', async () => {
  // Silently truncating would hand the user a corrupt PDF; the ceiling is the
  // 1,048,576-character limit on a PCF `Multiple` property, and base64 inflates
  // bytes by 4/3.
  const { host, files } = collectHost();
  const result = await host.deliverFile({
    filename: 'huge.pdf',
    mimeType: 'application/pdf',
    bytes: new Uint8Array(MAX_FILE_BYTES + 1),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /too large/i);
  assert.equal(files.length, 0, 'nothing should be emitted when it cannot fit');
});

test('the file ceiling leaves room inside the text property limit', () => {
  const base64Chars = Math.ceil(MAX_FILE_BYTES / 3) * 4;
  assert.ok(base64Chars < MAX_TEXT_PROPERTY_CHARS, 'encoded size must fit the property');
});

// ─── Capabilities and framework constraints ─────────────────────────────────

test('the Power Apps host reports no local persistence, downloads, or printing', () => {
  // Each of these is a framework rule, not a preference:
  //   * web storage is disallowed for data
  //   * a sandboxed component cannot reliably start a download
  //   * printing would target the host page, not the report
  const { host } = collectHost();
  assert.equal(host.capabilities.localPersistence, false);
  assert.equal(host.capabilities.fileDownload, false);
  assert.equal(host.capabilities.filePicker, false);
  assert.equal(host.capabilities.print, false);
  assert.equal(host.capabilities.directAi, false);
});

test('multiStudy follows the Mode the app selected', () => {
  assert.equal(collectHost({ multiStudy: true }).host.capabilities.multiStudy, true);
  assert.equal(collectHost().host.capabilities.multiStudy, false);
});

test('requestAi is only present when the app supplies a bridge', () => {
  assert.equal(typeof collectHost().host.requestAi, 'undefined');
  assert.equal(typeof collectHost({ requestAi: async () => 'ok' }).host.requestAi, 'function');
});

test('settings live in memory and never touch web storage', () => {
  const { host } = collectHost();
  assert.equal(host.getSetting('wrs-text-zoom'), null);
  host.setSetting('wrs-text-zoom', '1.25');
  assert.equal(host.getSetting('wrs-text-zoom'), '1.25');
  host.setSetting('wrs-text-zoom', null);
  assert.equal(host.getSetting('wrs-text-zoom'), null);
});

test('saveStudies forwards to the bridge so Power Apps owns persistence', () => {
  const { host, saved } = collectHost();
  host.saveStudies([{ id: 'a' }]);
  assert.deepEqual(saved, [[{ id: 'a' }]]);
});

test('subscribers receive host-pushed studies and can unsubscribe', () => {
  const { host } = collectHost();
  const seen = [];
  const off = host.subscribe(s => seen.push(s));
  host._push([{ id: 'a' }]);
  off();
  host._push([{ id: 'b' }]);
  assert.deepEqual(seen, [[{ id: 'a' }]]);
});

test('a throwing subscriber does not stop the others', () => {
  const { host } = collectHost();
  const seen = [];
  host.subscribe(() => { throw new Error('boom'); });
  host.subscribe(s => seen.push(s));
  assert.doesNotThrow(() => host._push([{ id: 'a' }]));
  assert.deepEqual(seen, [[{ id: 'a' }]]);
});
