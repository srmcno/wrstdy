import { useEffect, useRef } from 'react';
import {
  Chart, LineController, BarController, LineElement, BarElement,
  PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler
} from 'chart.js';

Chart.register(LineController, BarController, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const FONT = "'Gill Sans MT','Trebuchet MS',sans-serif";
const money = (v) => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');

const baseOptions = (title) => ({
  responsive: true,
  maintainAspectRatio: false,
  // Re-rendering a whole chart on every keystroke in the forecast fields is
  // the main cost on Step 5; without animation the in-place update is
  // imperceptible, and it also respects reduced-motion preferences.
  animation: false,
  plugins: {
    legend: { position: 'top', labels: { font: { family: FONT, size: 11 }, boxWidth: 12 } },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    // Fund balances go negative in a failing projection — pinning the axis at
    // zero hid exactly the years a board most needs to see.
    y: { ticks: { callback: money, font: { family: FONT, size: 10 } }, grid: { color: '#f1f5f9' } },
    x: { ticks: { font: { family: FONT, size: 10 } }, grid: { color: '#f1f5f9' } },
  },
  ...(title ? {} : {}),
});

/**
 * Builds the chart once, then mutates its data in place on later renders.
 *
 * Destroying and re-creating a Chart.js instance for every prop change made
 * each keystroke in Step 5's forecast fields tear down and rebuild two canvases
 * — visibly janky, and it leaked the old instance whenever the effect re-ran
 * before the cleanup had finished.
 */
function useChart(config) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current, configRef.current);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = config.data.labels;
    // Datasets are matched by position; the shape is fixed per chart, so only
    // the numbers change between renders.
    config.data.datasets.forEach((next, i) => {
      if (chart.data.datasets[i]) chart.data.datasets[i].data = next.data;
      else chart.data.datasets[i] = next;
    });
    chart.data.datasets.length = config.data.datasets.length;
    chart.update();
  });

  return canvasRef;
}

export function FundChart({ proj }) {
  const ref = useChart({
    type: 'line',
    data: {
      labels: proj.yrs,
      datasets: [
        { label: 'Fund Bal (Current Rates)', data: proj.curFBArr, borderColor: '#64748b', backgroundColor: 'rgba(100,116,139,.08)', tension: .3, fill: true, pointRadius: 4 },
        { label: 'Fund Bal (Proposed Rates)', data: proj.propFBArr, borderColor: '#1E3D3B', backgroundColor: 'rgba(30,61,59,.08)', tension: .3, fill: true, pointRadius: 4 },
        { label: 'Target', data: proj.targetArr, borderColor: '#4d7d00', borderDash: [6, 3], pointRadius: 0, borderWidth: 1.5, fill: false },
      ],
    },
    options: baseOptions(),
  });
  return (
    <div style={{ height: 220 }}>
      <canvas ref={ref} role="img" aria-label="Projected fund balance over five years under current and proposed rates, against the target reserve" />
    </div>
  );
}

export function RevExpChart({ proj }) {
  const ref = useChart({
    type: 'bar',
    data: {
      labels: proj.yrs,
      datasets: [
        { label: 'Revenue (Proposed)', data: proj.propRevArr, backgroundColor: '#76B900', borderRadius: 4, borderWidth: 0 },
        { label: 'Revenue (Current)', data: proj.curRevArr, backgroundColor: '#94a3b8', borderRadius: 4, borderWidth: 0 },
        { label: 'Expenses (Proposed Budget)', data: proj.propExpArr, type: 'line', borderColor: '#1E3D3B', backgroundColor: '#1E3D3B', tension: .3, pointRadius: 4, fill: false },
        { label: 'Expenses (Current Budget)', data: proj.curExpArr, type: 'line', borderColor: '#64748b', backgroundColor: '#64748b', borderDash: [5, 3], tension: .3, pointRadius: 3, fill: false },
      ],
    },
    options: baseOptions(),
  });
  return (
    <div style={{ height: 200 }}>
      <canvas ref={ref} role="img" aria-label="Projected annual revenue and expenses over five years under current and proposed rates" />
    </div>
  );
}
