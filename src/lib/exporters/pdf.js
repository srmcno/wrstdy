// PDF export. Uses jsPDF + jspdf-autotable to lay out a polished, deterministic
// board-ready report. Input: report model from data.js + chart PNGs.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from '../calc.js';
import { SEAL } from '../seal.js';
import { renderFundChart, renderRevExpChart, renderExpenseBreakdown } from './charts.js';
import { parseMarkdown } from './markdown.js';

// jsPDF only ships built-in PostScript fonts (helvetica/times/courier).
// Embedding Gill Sans Nova would require a license we don't have, so the
// PDF uses Helvetica — the closest royalty-free equivalent shipped with
// every PDF reader. The on-screen app and the .docx export both still use
// Gill Sans Nova / Gill Sans MT.
const FONT = 'helvetica';

const TEAL = [30, 61, 59];
const LIME = [118, 185, 0];
const RED = [220, 38, 38];
const MID = [71, 85, 105];
const DIM = [148, 163, 184];
const BORDER = [226, 232, 240];

async function loadSealAsDataUrl() {
  const res = await fetch(SEAL);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

function drawHeader(doc, report, sealDataUrl) {
  // Teal banner
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, 210, 26, 'F');
  // Lime accent
  doc.setFillColor(...LIME);
  doc.rect(0, 26, 210, 0.6, 'F');
  // Seal
  if (sealDataUrl) {
    try { doc.addImage(sealDataUrl, 'JPEG', 10, 5, 16, 16); } catch { /* ignore */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(13);
  doc.text('CHOCTAW NATION', 30, 12);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...LIME);
  doc.text('Office of Water Resource Management', 30, 17);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text('Water Rate Study Tool', 30, 21);
  // Right side
  doc.setFontSize(7);
  doc.setTextColor(220, 220, 220);
  doc.text('FAITH ✦ FAMILY ✦ CULTURE', 200, 14, { align: 'right' });
  doc.text(new Date(report.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 200, 19, { align: 'right' });
}

function drawFooter(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...DIM);
    doc.setDrawColor(...BORDER);
    doc.line(15, 285, 195, 285);
    doc.text('Choctaw Nation of Oklahoma — Office of Water Resource Management | Water Rate Study Tool', 15, 290);
    doc.text(`Page ${i} of ${total}`, 195, 290, { align: 'right' });
  }
}

function H1(doc, text, y) {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...TEAL);
  doc.text(text, 15, y);
  doc.setDrawColor(...LIME);
  doc.setLineWidth(0.6);
  doc.line(15, y + 1.5, 25, y + 1.5);
  doc.setLineWidth(0.2);
  return y + 8;
}

function H2(doc, text, y) {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEAL);
  doc.text(text.toUpperCase(), 15, y);
  doc.setDrawColor(...BORDER);
  doc.line(15, y + 1, 195, y + 1);
  return y + 6;
}

function P(doc, text, y, opts = {}) {
  doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size || 10);
  doc.setTextColor(...(opts.color || [15, 23, 42]));
  const maxWidth = opts.maxWidth || 180;
  const split = doc.splitTextToSize(text, maxWidth);
  doc.text(split, opts.x || 15, y);
  return y + split.length * (opts.lineHeight || 5);
}

function ensureSpace(doc, y, needed = 30) {
  if (y + needed > 280) {
    doc.addPage();
    return 35; // below header
  }
  return y;
}

// Render parsed markdown blocks. Headings get teal styling and an underline,
// paragraphs are mixed-run text supporting **bold** and *italic*, lists use a
// bullet glyph. Spans pages automatically and re-draws the page header.
function renderMarkdownPDF(doc, report, sealDataUrl, blocks, startY) {
  let y = startY;
  const ensure = (need) => {
    if (y + need > 280) {
      doc.addPage();
      drawHeader(doc, report, sealDataUrl);
      y = 35;
    }
  };

  for (const blk of blocks) {
    if (blk.type === 'heading') {
      const sizes = { 1: 14, 2: 12, 3: 10.5 };
      const padTop = { 1: 6, 2: 5, 3: 4 };
      const padBot = { 1: 4, 2: 3, 3: 2 };
      ensure(sizes[blk.level] + 6);
      y += padTop[blk.level];
      doc.setFont(FONT, 'bold');
      doc.setFontSize(sizes[blk.level]);
      doc.setTextColor(...TEAL);
      const text = blk.runs.map(r => r.text).join('');
      doc.text(text, 15, y);
      y += sizes[blk.level] * 0.4;
      if (blk.level === 1) {
        doc.setDrawColor(...LIME);
        doc.setLineWidth(0.6);
        doc.line(15, y - 1, 30, y - 1);
        doc.setLineWidth(0.2);
      } else if (blk.level === 2) {
        doc.setDrawColor(...BORDER);
        doc.line(15, y - 1, 195, y - 1);
      }
      y += padBot[blk.level];
      continue;
    }
    if (blk.type === 'paragraph') {
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      y = drawRichText(doc, blk.runs, 15, y, 180, 5);
      y += 3;
      continue;
    }
    if (blk.type === 'list') {
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      for (const item of blk.items) {
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...TEAL);
        ensure(6);
        doc.text('•', 15, y);
        doc.setFont(FONT, 'normal');
        doc.setTextColor(15, 23, 42);
        y = drawRichText(doc, item, 19, y, 176, 5);
        y += 1;
      }
      y += 3;
    }
  }
  return y;

  // Render an array of {text, bold, italic} runs as wrapped, justified text.
  function drawRichText(doc, runs, x, yStart, width, lineH) {
    let cy = yStart;
    let cx = x;
    let firstLine = true;
    for (const run of runs) {
      doc.setFont(FONT, run.bold ? 'bold' : (run.italic ? 'italic' : 'normal'));
      // Split this run respecting the remaining width on the current line.
      const words = run.text.split(/(\s+)/); // keep whitespace
      for (const w of words) {
        if (w === '') continue;
        const wWidth = doc.getTextWidth(w);
        // Need to wrap?
        if (cx + wWidth > x + width && cx !== x) {
          cy += lineH;
          ensure(lineH);
          cx = x;
          firstLine = false;
          if (/^\s+$/.test(w)) continue; // skip leading whitespace on new line
        }
        doc.text(w, cx, cy);
        cx += wWidth;
      }
    }
    return cy;
  }
}

export async function exportPDF(report, filename) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const sealDataUrl = await loadSealAsDataUrl().catch(() => null);

  // ---- Cover page ----
  drawHeader(doc, report, sealDataUrl);
  let y = 50;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...TEAL);
  doc.text('Water Rate Study', 15, y); y += 11;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...MID);
  doc.text('Final Report — Board of Directors / Council Briefing', 15, y); y += 14;

  // System info card
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.8);
  doc.line(15, y, 18, y);
  doc.setLineWidth(0.2);
  y = P(doc, 'PREPARED FOR', y + 5, { size: 8, color: DIM });
  y = P(doc, report.system.name || '[System Name]', y + 1, { size: 14, bold: true, color: TEAL });
  if (report.system.pwsId || report.system.county) {
    y = P(doc, [report.system.pwsId, report.system.county && `${report.system.county} County`, report.system.year].filter(Boolean).join(' • '), y + 1, { size: 10, color: MID });
  }
  if (report.system.contact) {
    y = P(doc, `Contact: ${report.system.contact}${report.system.contactEmail ? ' — ' + report.system.contactEmail : ''}`, y + 1, { size: 9, color: MID });
  }

  y += 10;
  // Headline metric box
  doc.setFillColor(240, 249, 224);
  doc.setDrawColor(134, 239, 172);
  doc.roundedRect(15, y, 180, 36, 2, 2, 'FD');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text('AT A GLANCE', 21, y + 7);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID);
  const cells = [
    ['Cost / 1,000 gal (Cur → Prop)', `${fmt.c(report.curCP1K)} → ${fmt.c(report.propCP1K)}`],
    ['Operating Ratio (Cur → Prop)', `${report.curOR.toFixed(2)} → ${report.propOR.toFixed(2)}`],
    ['5,000 gal Bill (Cur → Prop)', `${fmt.c(report.cost5kCur)} → ${fmt.c(report.cost5kProp)}`],
    ['Affordability Index (Prop)', report.mhi ? fmt.p(report.propAI) : 'MHI not entered'],
  ];
  cells.forEach((c, i) => {
    const cx = 21 + (i % 2) * 90;
    const cy = y + 14 + Math.floor(i / 2) * 10;
    doc.setFontSize(7);
    doc.setTextColor(...DIM);
    doc.text(c[0].toUpperCase(), cx, cy);
    doc.setFontSize(11);
    doc.setTextColor(...TEAL);
    doc.text(c[1], cx, cy + 5);
  });

  // ---- Page 2: Executive Summary / Factors ----
  doc.addPage();
  drawHeader(doc, report, sealDataUrl);
  y = 35;
  y = H1(doc, 'Executive Summary', y);
  y = P(doc,
    "The Choctaw Nation's Water Resource Management Office prepared this rate analysis to ensure the water system remains financially sustainable, operationally sound, and compliant with applicable standards. This report evaluates revenue strictly generated from rates — not grants, loans, or one-time revenues — to assess long-term financial health based on operational income alone.",
    y, { color: MID });
  y += 4;

  y = H2(doc, 'Factors Considered in the Rate Analysis', y);
  const factors = [
    ['Cost to Produce and Deliver Water', 'Real cost of providing water/wastewater services: administration, operations, and maintenance.'],
    ['Current and Future Needs', 'Ongoing and upcoming infrastructure, equipment, and maintenance requirements.'],
    ['Operating Ratio', "A measure of the system's financial health, comparing revenues to expenses."],
    ['Affordability Index', 'A benchmark to determine whether rates remain affordable for the average household in the service area.'],
    ['Debt to Income Ratio', "A measure of the system's ability to manage debt obligations responsibly."],
  ];
  factors.forEach(([t, d]) => {
    y = ensureSpace(doc, y, 14);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEAL);
    doc.text(t, 15, y);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MID);
    const split = doc.splitTextToSize(d, 175);
    doc.text(split, 15, y + 4);
    y += 4 + split.length * 4 + 3;
  });

  // ---- System Scorecard ----
  y = ensureSpace(doc, y + 4, 60);
  y = H2(doc, 'Financial Health Scorecard', y);
  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Current', 'Proposed', 'Benchmark', 'Status']],
    body: report.scorecard.map(r => [
      r.metric, r.cur, r.prop, r.benchmark,
      r.propOk === null ? 'N/A' : (r.propOk ? '✓ Healthy' : '✗ Below'),
    ]),
    styles: { font: FONT, fontSize: 9, cellPadding: 2, textColor: [15, 23, 42] },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const r = report.scorecard[data.row.index];
        if (r.propOk === true) data.cell.styles.textColor = [22, 101, 52];
        else if (r.propOk === false) data.cell.styles.textColor = [153, 27, 27];
      }
    },
    margin: { left: 15, right: 15 },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ---- Cost & 5-year ----
  doc.addPage();
  drawHeader(doc, report, sealDataUrl);
  y = 35;
  y = H1(doc, 'Cost to Produce & 5-Year Outlook', y);
  y = P(doc,
    'Providing safe, reliable drinking water and/or wastewater services requires consistent investment in operations, infrastructure, and personnel. The cost to produce a thousand gallons of water captures the full operational burden today, while the five-year outlook projects what those costs become under realistic inflation scenarios.',
    y, { color: MID });
  y += 4;

  // Cost cards
  doc.setDrawColor(...BORDER);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, y, 87, 22, 2, 2, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(...DIM);
  doc.text('CURRENT COST PER 1,000 GAL', 21, y + 6);
  doc.setFontSize(18);
  doc.setTextColor(...TEAL);
  doc.text(fmt.c(report.curCP1K), 21, y + 16);

  doc.setFillColor(240, 249, 224);
  doc.setDrawColor(134, 239, 172);
  doc.roundedRect(108, y, 87, 22, 2, 2, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(...DIM);
  doc.text('PROPOSED COST PER 1,000 GAL', 114, y + 6);
  doc.setFontSize(18);
  doc.setTextColor(90, 148, 0);
  doc.text(fmt.c(report.propCP1K), 114, y + 16);
  y += 30;

  // 5-year outlook table
  y = H2(doc, 'Five-Year Outlook', y);
  autoTable(doc, {
    startY: y,
    head: [['Scenario', ...report.fiveYearOutlook.map(r => r.yr)]],
    body: [
      ['Annual Revenue (Proposed)', ...report.fiveYearOutlook.map(r => fmt.c(r.revenue))],
      ['Annual Expenses (3% inflation)', ...report.fiveYearOutlook.map(r => fmt.c(r.exp3))],
      ['Annual Expenses (5% inflation)', ...report.fiveYearOutlook.map(r => fmt.c(r.exp5))],
      ['Fund Balance (Proposed)', ...report.fiveYearOutlook.map(r => fmt.c(r.fundBalance))],
    ],
    styles: { font: FONT, fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  y = doc.lastAutoTable.finalY + 4;
  y = P(doc,
    'The 3% scenario is a conservative adjustment aligning with typical inflation. The 5% scenario accounts for rising costs in utilities, materials, and labor, and is recommended for planning purposes.',
    y, { size: 8, color: DIM });

  // ---- Charts page ----
  const fundChart = await renderFundChart(report.proj);
  const revExpChart = await renderRevExpChart(report.proj);
  const breakdownChart = report.expCats.length > 0 ? await renderExpenseBreakdown(report.expCats) : null;

  doc.addPage();
  drawHeader(doc, report, sealDataUrl);
  y = 35;
  y = H1(doc, 'Projection Charts', y);
  y = H2(doc, 'Fund Balance Over Five Years', y);
  doc.addImage(fundChart.dataUrl, 'PNG', 15, y, 180, 80);
  y += 86;
  y = H2(doc, 'Revenue vs. Expenses', y);
  doc.addImage(revExpChart.dataUrl, 'PNG', 15, y, 180, 70);
  y += 76;
  if (breakdownChart) {
    y = ensureSpace(doc, y, 90);
    y = H2(doc, 'Expense Breakdown by Category', y);
    doc.addImage(breakdownChart.dataUrl, 'PNG', 15, y, 180, 70);
  }

  // ---- Operating Ratio + Affordability + DTI ----
  doc.addPage();
  drawHeader(doc, report, sealDataUrl);
  y = 35;
  y = H1(doc, 'Detailed Financial Metrics', y);

  y = H2(doc, 'Operating Ratio', y);
  y = P(doc, 'The Operating Ratio compares total operational revenues to operational expenses. A ratio of 1.0 = break even; 1.25+ = healthy margin for reinvestment and reserves; below 1.0 = the system should raise rates or reduce costs to remain solvent.', y, { color: MID });
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [['', 'Current', 'Proposed', 'Status']],
    body: [
      ['Operating Ratio', report.curOR.toFixed(2), report.propOR.toFixed(2), report.propOR >= 1.25 ? '✓ Healthy' : report.propOR >= 1 ? '⚠ Break-even' : '✗ Below'],
    ],
    styles: { font: FONT, fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  y = doc.lastAutoTable.finalY + 6;

  y = H2(doc, 'Affordability Index', y);
  y = P(doc, 'The Affordability Index measures household water cost as a share of monthly income (Cost of 5,000 gal ÷ Monthly MHI). USDA Rural Development considers utilities grant-eligible if the index exceeds 1.50%; below 2.00% is considered affordable by EPA standards.', y, { color: MID });
  y += 2;
  if (report.mhi > 0) {
    autoTable(doc, {
      startY: y,
      head: [['', 'Current', 'Proposed', 'Note']],
      body: [
        ['5,000 gal Bill', fmt.c(report.cost5kCur), fmt.c(report.cost5kProp), `Monthly MHI: ${fmt.c(report.mhi)}`],
        ['Affordability Index', fmt.p(report.curAI), fmt.p(report.propAI), report.propAI < 0.015 ? 'USDA RD eligible' : report.propAI < 0.02 ? 'Affordable' : 'Affordability concern'],
      ],
      styles: { font: FONT, fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 15, right: 15 },
    });
    y = doc.lastAutoTable.finalY + 6;
  } else {
    y = P(doc, 'Median Monthly Household Income not entered — Affordability Index unavailable.', y, { color: RED });
    y += 2;
  }

  y = H2(doc, 'Debt to Income Ratio', y);
  y = P(doc, "The Debt-to-Income Ratio shows the percentage of income used for debt payments. A ratio under 45% is generally considered manageable.", y, { color: MID });
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [['', 'Current', 'Proposed', 'Status']],
    body: [['DTI', fmt.p(report.curDTI), fmt.p(report.propDTI), report.propDTI < 0.45 ? '✓ Manageable' : '✗ High']],
    styles: { font: FONT, fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  y = doc.lastAutoTable.finalY + 6;

  y = ensureSpace(doc, y, 30);
  y = H2(doc, 'Depreciation & Capital Improvements', y);
  autoTable(doc, {
    startY: y,
    head: [['Item', 'Current', 'Proposed']],
    body: [
      ['Monthly depreciation set-aside', fmt.c(report.curDepr), fmt.c(report.propDepr)],
      ['Monthly capital improvement set-aside', fmt.c(report.curLR), fmt.c(report.propLR)],
    ],
    styles: { font: FONT, fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });

  // ---- Customer Class breakdown ----
  doc.addPage();
  drawHeader(doc, report, sealDataUrl);
  y = 35;
  y = H1(doc, 'Customer Class Revenue Breakdown', y);
  y = P(doc, 'Monthly revenue by customer class under current and proposed rates.', y, { color: MID });
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [['Class', 'Customers', 'Current Mo.', 'Proposed Mo.', '$ Δ', '% Δ']],
    body: report.classRows.map(r => [
      r.name, r.customers.toLocaleString(),
      fmt.c(r.cur), fmt.c(r.prop),
      (r.delta >= 0 ? '+' : '') + fmt.c(r.delta),
      r.pct.toFixed(1) + '%',
    ]),
    foot: [[
      'Total', '',
      fmt.c(report.revCur.monthly), fmt.c(report.revProp.monthly),
      (report.revProp.monthly - report.revCur.monthly >= 0 ? '+' : '') + fmt.c(report.revProp.monthly - report.revCur.monthly),
      report.revCur.monthly > 0 ? ((report.revProp.monthly - report.revCur.monthly) / report.revCur.monthly * 100).toFixed(1) + '%' : '—',
    ]],
    styles: { font: FONT, fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255] },
    footStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  y = doc.lastAutoTable.finalY + 8;

  if (report.expCats.length > 0) {
    y = H2(doc, 'Monthly Expense Breakdown', y);
    autoTable(doc, {
      startY: y,
      head: [['Category', 'Current', 'Proposed', '$ Δ']],
      body: report.expCats.map(c => [c.label, fmt.c(c.cur), fmt.c(c.prop), (c.delta >= 0 ? '+' : '') + fmt.c(c.delta)]),
      foot: [['Total', fmt.c(report.curBT.total), fmt.c(report.propBT.total),
        (report.propBT.total - report.curBT.total >= 0 ? '+' : '') + fmt.c(report.propBT.total - report.curBT.total)]],
      styles: { font: FONT, fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255] },
      footStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: 15, right: 15 },
    });
  }

  // ---- AI Analysis ----
  if (report.aiAnalysis) {
    doc.addPage();
    drawHeader(doc, report, sealDataUrl);
    y = 35;
    y = H1(doc, 'Analyst Narrative', y);
    y = P(doc, 'AI-generated analysis based on the data captured in this study.', y, { size: 9, color: DIM });
    y += 4;
    y = renderMarkdownPDF(doc, report, sealDataUrl, parseMarkdown(report.aiAnalysis), y);
  }

  // ---- Final recommendations + notes ----
  doc.addPage();
  drawHeader(doc, report, sealDataUrl);
  y = 35;
  y = H1(doc, 'Final Recommendations', y);
  y = P(doc,
    'The Choctaw Nation recommends that each system conduct a rate analysis and adjust rates as needed to ensure financial sustainability, proper infrastructure funding, and continued service to tribal members.',
    y);
  y += 4;
  y = P(doc,
    'Note: This analysis serves as guidance and reference only. The Choctaw Nation is not responsible for any decisions made based on this analysis. Each system\'s board or council retains final authority over rate setting.',
    y, { size: 9, color: MID });

  if (report.reportNotes) {
    y += 6;
    y = H2(doc, 'Report Notes & Additional Observations', y);
    y = P(doc, report.reportNotes, y);
  }

  drawFooter(doc);
  doc.save(filename);
}
