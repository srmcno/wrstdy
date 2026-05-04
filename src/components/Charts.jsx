import { useEffect, useRef } from 'react';
import {
  Chart, LineController, BarController, LineElement, BarElement,
  PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler
} from 'chart.js';

Chart.register(LineController, BarController, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const FONT = "'Gill Sans MT','Trebuchet MS',sans-serif";

export function FundChart({ proj }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: proj.yrs,
        datasets: [
          { label: 'Fund Bal (Current Rates)', data: proj.curFBArr, borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,.06)', tension: .3, fill: true, pointRadius: 4 },
          { label: 'Fund Bal (Proposed Rates)', data: proj.propFBArr, borderColor: '#1E3D3B', backgroundColor: 'rgba(30,61,59,.06)', tension: .3, fill: true, pointRadius: 4 },
          { label: 'Target', data: proj.targetArr, borderColor: '#76B900', borderDash: [6, 3], pointRadius: 0, borderWidth: 1.5, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { family: FONT, size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => '$' + v.toLocaleString(), font: { family: FONT, size: 10 } }, grid: { color: '#f1f5f9' } },
          x: { ticks: { font: { family: FONT, size: 10 } }, grid: { color: '#f1f5f9' } }
        }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [proj]);
  return <div style={{ height: 220 }}><canvas ref={ref} /></div>;
}

export function RevExpChart({ proj }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: proj.yrs,
        datasets: [
          { label: 'Revenue (Proposed)', data: proj.propRevArr, backgroundColor: '#76B900', borderRadius: 4, borderWidth: 0 },
          { label: 'Revenue (Current)', data: proj.curRevArr, backgroundColor: '#94a3b8', borderRadius: 4, borderWidth: 0 },
          { label: 'Expenses', data: proj.expArr, backgroundColor: '#1E3D3B', borderRadius: 4, borderWidth: 0, type: 'line', borderColor: '#1E3D3B', tension: .3, pointRadius: 4, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { family: FONT, size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => '$' + v.toLocaleString(), font: { family: FONT, size: 10 } }, grid: { color: '#f1f5f9' } },
          x: { ticks: { font: { family: FONT, size: 10 } }, grid: { color: '#f1f5f9' } }
        }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [proj]);
  return <div style={{ height: 200 }}><canvas ref={ref} /></div>;
}
