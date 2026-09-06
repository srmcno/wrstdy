#!/usr/bin/env node
/**
 * End-to-end smoke test in a real browser.
 *
 * `npm test` covers the calculations, which is where the money is — but three
 * classes of defect only show up once the app is actually rendered, and each
 * one has bitten this project:
 *
 *   1. The standalone app failing to mount, or throwing on a step.
 *   2. The code component leaking its styles into the page hosting it, or
 *      touching localStorage (which the component framework forbids).
 *   3. The Power Apps bridge echoing its own output back into itself, or
 *      emitting a "save" when a user merely opened a study — which would
 *      patch SharePoint and add a payload version on every view.
 *
 * Playwright is not a dependency of this project (it is ~200 MB and CI does
 * not need it for the unit tests). Install it when you want to run this:
 *
 *     npm i -D playwright && npx playwright install chromium
 *     npm run build && npm run build:pcf
 *     npm run test:browser
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist');
const PCF_BUNDLE = path.join(root, 'pcf/WaterRateStudyTool/app/wrs-app.js');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('playwright is not installed — skipping browser smoke test.');
  console.log('  npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

for (const [label, p] of [['dist/', DIST], ['the PCF app bundle', PCF_BUNDLE]]) {
  if (!fs.existsSync(p)) {
    console.error(`✗ ${label} is missing — run "npm run build && npm run build:pcf" first.`);
    process.exit(1);
  }
}

const failures = [];
const check = (label, actual, expected) => {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(label);
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

// A stand-in for a Power Apps screen: unrelated chrome around a sized
// container. If the component's CSS still leaked, this is what would break.
const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font-family: "Segoe UI", sans-serif; background: #faf9f8 }
  .probe { border: 3px dashed #d13438; padding: 8px }
  #ctl { width: 1200px; height: 760px }
</style></head><body>
  <div class="probe" id="probe">Host card</div><div id="ctl"></div>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/host') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HOST_PAGE); return; }
  if (url === '/wrs-app.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); fs.createReadStream(PCF_BUNDLE).pipe(res); return; }
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(4173, r));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});

const STEPS = ['System Info', 'Cust. Classes', 'Budget', 'Financial Metrics', '5-Year Projection', 'Scenarios', 'AI Analysis', 'Final Report'];

// ── Standalone application ──────────────────────────────────────────────────
console.log('\nStandalone build');
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.wrs-app', { timeout: 15000 });
  check('mounts into the scoped .wrs-app wrapper', true, true);

  await page.getByRole('button', { name: /Load Sample Study/i }).click();
  await page.waitForSelector('.tabs', { timeout: 10000 });

  for (const step of STEPS) {
    await page.getByRole('tab', { name: new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.waitForTimeout(180);
    const heading = await page.locator('.ws-sc h2').first().textContent().catch(() => null);
    check(`step renders: ${step}`, Boolean(heading), true);
  }

  await page.getByRole('tab', { name: /Financial Metrics/ }).click();
  await page.waitForTimeout(250);
  const scorecard = await page.locator('.dt tbody tr').first().textContent();
  // The sample is tuned so current rates fail and proposed rates pass — if
  // that inverts, the sample study has drifted.
  check('sample shows current below target, proposed healthy',
    /Below Target/.test(scorecard) && /Healthy/.test(scorecard), true);

  await page.getByRole('tab', { name: /5-Year Projection/ }).click();
  await page.waitForTimeout(400);
  const projectionText = await page.locator('.ws-sc').innerText();
  check('no "$-1,234" malformed negatives', /\$-[\d,]/.test(projectionText), false);

  const inflation = page.locator('.ws-sc input[type=number]').first();
  await inflation.fill('');
  await page.waitForTimeout(200);
  check('a cleared forecast field stays cleared', await inflation.inputValue(), '');
  await inflation.fill('3');

  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(300);
  check('narrow layout below 820px', await page.locator('.wrs-app.narrow').count(), 1);
  await page.setViewportSize({ width: 460, height: 900 });
  await page.waitForTimeout(300);
  check('single-column layout below 520px', await page.locator('.wrs-app.xnarrow').count(), 1);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.wrs-app');
  check('study survives a reload', await page.locator('.sb-nm').count(), n => n > 0);

  check('no console errors', errors.filter(e => !/favicon|DevTools/i.test(e)).length, 0);
  await page.close();
}

// ── Power Apps code component ───────────────────────────────────────────────
console.log('\nPower Apps code component');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4173/host', { waitUntil: 'domcontentloaded' });

  const study = {
    id: 'study-abc',
    name: 'Antlers PWA — Rate Study 2026',
    systemInfo: { systemName: 'Antlers Public Works Authority', pwsId: 'OK3000101', county: 'Pushmataha', studyYear: '2026' },
  };

  const mounted = await page.evaluate(async ({ study }) => {
    const mod = await import('/wrs-app.js');
    window.__saves = 0;
    window.__files = [];
    window.__app = mod.mountWaterRateStudy(document.getElementById('ctl'), {
      studiesJson: JSON.stringify(study),
      multiStudy: false,
      onStudiesChanged: (s) => { window.__saves++; window.__lastOut = JSON.stringify(s); },
      onFileReady: (f) => window.__files.push(f),
    });
    await new Promise(r => setTimeout(r, 900));
    return {
      exports: Object.keys(mod).sort().join(','),
      mounted: !!document.querySelector('#ctl .wrs-app'),
      header: !!document.querySelector('#ctl .hdr'),
      sidebar: !!document.querySelector('#ctl .sb'),
      title: document.querySelector('#ctl .ws-t')?.textContent ?? null,
      probeBorder: getComputedStyle(document.getElementById('probe')).borderStyle,
      probeFont: getComputedStyle(document.getElementById('probe')).fontFamily,
      bodyOverflow: getComputedStyle(document.body).overflow,
      styleTags: document.querySelectorAll('#wrs-pcf-styles').length,
      storageKeys: Object.keys(localStorage).length,
    };
  }, { study });

  check('exports the mount API', mounted.exports, 'default,mountWaterRateStudy,parseStudiesJson');
  check('mounts into the host container', mounted.mounted, true);
  check('single-study mode hides the app chrome', !mounted.header && !mounted.sidebar, true);
  check('loads the study from StudiesJson', mounted.title, study.name);
  check('does not restyle the host page', mounted.probeBorder, 'dashed');
  check('does not override the host font', /Segoe UI/.test(mounted.probeFont), true);
  check('does not lock host page scrolling', mounted.bodyOverflow, 'visible');
  check('injects its stylesheet exactly once', mounted.styleTags, 1);
  check('uses no web storage', mounted.storageKeys, 0);

  await page.locator('#ctl input').first().fill('Antlers PWA — Rate Study 2026 (edited)');
  await page.waitForTimeout(900);
  check('an edit emits a save', await page.evaluate(() => window.__saves), n => n >= 1);

  await page.getByRole('tab', { name: /Cust\. Classes/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Export CSV/ }).click();
  await page.waitForTimeout(600);
  const files = await page.evaluate(() => window.__files.map(f => ({ name: f.filename, mime: f.mimeType, size: f.sizeBytes, b64: f.base64.length > 0 })));
  check('an export is handed back as base64, not downloaded',
    files.length === 1 && files[0].b64 && /\.csv$/.test(files[0].name), true);

  const reopenSaves = await page.evaluate(async () => {
    const payload = window.__lastOut;
    window.__app.destroy();
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('ctl').innerHTML = '';
    const mod = await import('/wrs-app.js');
    let saves = 0;
    window.__app = mod.mountWaterRateStudy(document.getElementById('ctl'), {
      studiesJson: payload,
      onStudiesChanged: () => { saves++; },
    });
    await new Promise(r => setTimeout(r, 1200));
    return saves;
  });
  check('re-opening an unchanged study emits nothing', reopenSaves, 0);

  const pushResults = await page.evaluate(() => {
    const other = JSON.stringify([{ id: 'other', name: 'Broken Bow RWD — 2026', systemInfo: { systemName: 'Broken Bow RWD' } }]);
    return {
      applied: window.__app.setStudiesJson(other),
      echoed: window.__app.setStudiesJson(other),
    };
  });
  await page.waitForTimeout(500);
  check('a new payload from the host is applied', pushResults.applied, true);
  check('the same payload again is a no-op', pushResults.echoed, false);
  check('the pushed study is showing', await page.locator('#ctl .ws-t').textContent(), 'Broken Bow RWD — 2026');

  await page.getByRole('tab', { name: /Final Report/ }).click();
  await page.waitForTimeout(400);
  check('no Print button (host page printing is meaningless)', await page.getByRole('button', { name: /Print/ }).count(), 0);
  check('no local-backup prompt (the host persists)', await page.getByRole('button', { name: /Not backed up/ }).count(), 0);

  await page.evaluate(() => window.__app.destroy());
  await page.waitForTimeout(300);
  check('destroy() unmounts cleanly', await page.evaluate(() => document.querySelectorAll('#ctl .wrs-app').length), 0);
  check('no console errors', errors.filter(e => !/favicon|DevTools/i.test(e)).length, 0);
  await page.close();
}

await browser.close();
server.close();

console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('✓ all browser checks passed');
