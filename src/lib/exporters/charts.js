// Render Chart.js charts off-screen and return them as PNG data URLs.
// Used by both the PDF and DOCX exporters so the same charts appear in either
// format. Charts are deterministic given the same data.

import {
  Chart, LineController, BarController, LineElement, BarElement,
  PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler
} from 'chart.js';

Chart.register(LineController, BarController, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const FONT = "'Gill Sans MT','Trebuchet MS',sans-serif";

async function renderChart(config, { width = 900, height = 480 } = {}) {
  const canvas = document.createElement('canvas');
  // Lock canvas to logical pixels regardless of devicePixelRatio. Without
  // this, on HiDPI displays Chart.js + toBase64Image emit a 2–3× scaled PNG,
  // which bloats PDF/DOCX files and can shift layout if downstream code
  // expects a known size.
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.position = 'fixed';
  canvas.style.left = '-9999px';
  canvas.style.top = '0';
  document.body.appendChild(canvas);

  let chart = null;
  try {
    chart = new Chart(canvas, {
      ...config,
      options: {
        ...(config.options || {}),
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
        devicePixelRatio: 1,
      },
    });
    // Wait for layout, but cap at 500ms in case the browser stalls.
    await Promise.race([
      new Promise(r => requestAnimationFrame(() => r())),
      new Promise(r => setTimeout(r, 500)),
    ]);
    const png = chart.toBase64Image('image/png', 1);
    return { dataUrl: png, width, height };
  } finally {
    if (chart) {
      try { chart.destroy(); } catch { /* ignore */ }
    }
    canvas.remove();
  }
}

export async function renderFundChart(proj) {
  return renderChart({
    type: 'line',
    data: {
      labels: proj.yrs,
      datasets: [
        { label: 'Fund Bal (Current Rates)', data: proj.curFBArr, borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,.1)', tension: .3, fill: true, pointRadius: 5 },
        { label: 'Fund Bal (Proposed Rates)', data: proj.propFBArr, borderColor: '#1E3D3B', backgroundColor: 'rgba(30,61,59,.1)', tension: .3, fill: true, pointRadius: 5 },
        { label: 'Target', data: proj.targetArr, borderColor: '#76B900', borderDash: [6, 3], pointRadius: 0, borderWidth: 2, fill: false },
      ],
    },
    options: {
      plugins: { legend: { position: 'top', labels: { font: { family: FONT, size: 14 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => '$' + v.toLocaleString(), font: { family: FONT, size: 12 } }, grid: { color: '#e2e8f0' } },
        x: { ticks: { font: { family: FONT, size: 12 } }, grid: { color: '#e2e8f0' } },
      },
    },
  });
}

export async function renderRevExpChart(proj) {
  return renderChart({
    type: 'bar',
    data: {
      labels: proj.yrs,
      datasets: [
        { label: 'Revenue (Proposed)', data: proj.propRevArr, backgroundColor: '#76B900', borderRadius: 4, borderWidth: 0 },
        { label: 'Revenue (Current)', data: proj.curRevArr, backgroundColor: '#94a3b8', borderRadius: 4, borderWidth: 0 },
        { label: 'Expenses (Proposed Budget)', data: proj.propExpArr || proj.expArr, backgroundColor: '#1E3D3B', borderRadius: 4, borderWidth: 0, type: 'line', borderColor: '#1E3D3B', tension: .3, pointRadius: 5, fill: false },
        { label: 'Expenses (Current Budget)', data: proj.curExpArr || proj.expArr, backgroundColor: '#64748b', borderRadius: 4, borderWidth: 0, type: 'line', borderColor: '#64748b', borderDash: [6, 3], tension: .3, pointRadius: 4, fill: false },
      ],
    },
    options: {
      plugins: { legend: { position: 'top', labels: { font: { family: FONT, size: 14 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => '$' + v.toLocaleString(), font: { family: FONT, size: 12 } }, grid: { color: '#e2e8f0' } },
        x: { ticks: { font: { family: FONT, size: 12 } }, grid: { color: '#e2e8f0' } },
      },
    },
  });
}

export async function renderExpenseBreakdown(catTotals) {
  const labels = catTotals.map(c => c.label);
  return renderChart({
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Current', data: catTotals.map(c => c.cur), backgroundColor: '#94a3b8', borderRadius: 4 },
        { label: 'Proposed', data: catTotals.map(c => c.prop), backgroundColor: '#1E3D3B', borderRadius: 4 },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { position: 'top', labels: { font: { family: FONT, size: 14 } } } },
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v) => '$' + v.toLocaleString(), font: { family: FONT, size: 12 } }, grid: { color: '#e2e8f0' } },
        y: { ticks: { font: { family: FONT, size: 12 } }, grid: { display: false } },
      },
    },
  }, { width: 900, height: 420 });
}
