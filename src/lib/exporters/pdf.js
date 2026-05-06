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

// Page geometry (A4, mm)
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 15;
const MARGIN_R = 15;
const HEADER_H = 28;       // teal banner + lime accent
const FOOTER_H = 14;       // line + footer text + bottom padding
const CONTENT_TOP = HEADER_H + 7;       // 35 — first usable Y on body pages
const CONTENT_BOTTOM = PAGE_H - FOOTER_H; // 283 — last usable Y before footer
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R; // 180

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
  // Reset graphics state — autoTable / previous draws can leave font, color,
  // and line width in unexpected states which would otherwise leak into the
  // banner and shift baselines by 1–2 mm.
  doc.setFont(FONT, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  // Teal banner + lime accent under it
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, PAGE_W, HEADER_H - 2, 'F');
  doc.setFillColor(...LIME);
  doc.rect(0, HEADER_H - 2, PAGE_W, 0.6, 'F');

  // Seal — fixed left slot, never overlaps text
  if (sealDataUrl) {
    try { doc.addImage(sealDataUrl, 'JPEG', 10, 4, 18, 18); } catch { /* ignore */ }
  }

  // Title block — fixed text at fixed columns
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(13);
  doc.text('CHOCTAW NATION', 32, 11);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...LIME);
  doc.text('Office of Water Resource Management', 32, 16.5);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text('Water Rate Study Tool', 32, 21);

  // Right-side metadata — measure widths so we never overflow the right margin.
  // Tagline + date are right-aligned to PAGE_W - 10 so they have a 10 mm
  // safe gap from the page edge.
  // jsPDF's built-in helvetica is WinAnsi-encoded and renders most non-Latin
  // glyphs (✦, ❖, →, ✓) as missing-glyph boxes or extra-wide spaces, which
  // is what was causing the FAITH/FAMILY/CULTURE line to "space out and cut
  // off" on Page 1. The safe separators in WinAnsi are bullet (•) and en/em
  // dashes — we use bullet here for visual consistency with the on-screen UI.
  const rightX = PAGE_W - 10;
  doc.setFontSize(7);
  doc.setTextColor(220, 220, 220);
  doc.text('FAITH • FAMILY • CULTURE', rightX, 12, { align: 'right' });
  const dateStr = new Date(report.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.text(dateStr, rightX, 18, { align: 'right' });
}

function drawFooters(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...DIM);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    const lineY = PAGE_H - 12;
    doc.line(MARGIN_L, lineY, PAGE_W - MARGIN_R, lineY);
    doc.text(
      'Choctaw Nation of Oklahoma — Office of Water Resource Management | Water Rate Study Tool',
      MARGIN_L, PAGE_H - 7,
    );
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN_R, PAGE_H - 7, { align: 'right' });
  }
}

function H1(doc, text, y) {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...TEAL);
  doc.text(text, MARGIN_L, y);
  doc.setDrawColor(...LIME);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_L, y + 1.5, MARGIN_L + 10, y + 1.5);
  doc.setLineWidth(0.2);
  return y + 8;
}

function H2(doc, text, y) {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEAL);
  doc.text(text.toUpperCase(), MARGIN_L, y);
  doc.setDrawColor(...BORDER);
  doc.line(MARGIN_L, y + 1, PAGE_W - MARGIN_R, y + 1);
  return y + 6;
}

function P(doc, text, y, opts = {}) {
  doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size || 10);
  doc.setTextColor(...(opts.color || [15, 23, 42]));
  const maxWidth = opts.maxWidth || CONTENT_W;
  const split = doc.splitTextToSize(text, maxWidth);
  doc.text(split, opts.x || MARGIN_L, y);
  return y + split.length * (opts.lineHeight || 5);
}

// Add a new page if drawing `needed` mm at y would cross the bottom margin.
// Returns the (possibly new) y. Always pass through the return value:
//     y = ensureSpace(doc, y, ...);
function ensureSpace(doc, report, sealDataUrl, y, needed = 30) {
  if (y + needed > CONTENT_BOTTOM) {
    doc.addPage();
    drawHeader(doc, report, sealDataUrl);
    return CONTENT_TOP;
  }
  return y;
}

// Common autoTable options shared by every table — enforces top/bottom
// margins so autoTable's own page-break logic respects the header/footer,
// and re-paints the header on every page autoTable adds.
function tableBase(report, sealDataUrl, extra = {}) {
  return {
    margin: { top: CONTENT_TOP, bottom: PAGE_H - CONTENT_BOTTOM, left: MARGIN_L, right: MARGIN_R },
    styles: { font: FONT, fontSize: 9, cellPadding: 2.5, overflow: 'linebreak', textColor: [15, 23, 42] },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold' },
    didDrawPage: (data) => {
      // autoTable triggers this on every page it touches, including the page
      // it was started on. Re-painting the header is idempotent and ensures
      // any page autoTable added has the banner.
      drawHeader(doc(data), report, sealDataUrl);
    },
    ...extra,
  };
}
// Helper so `didDrawPage` callbacks can reach the live doc
function doc(data) { return data.doc; }

// Render parsed markdown blocks. Headings get teal styling and an underline;
// paragraphs are mixed-run text supporting **bold** and *italic*; lists use a
// bullet glyph. Spans pages automatically and re-draws the page header.
//
// State is held in a mutable object so the inner `ensure` and `drawRichText`
// helpers reassign `state.y` and that update propagates back to the outer
// loop. (The previous version kept `y` in a local variable that the inner
// helpers couldn't update — body text drew at the old Y on a fresh page,
// painting over the just-redrawn header.)
function renderMarkdownPDF(doc, report, sealDataUrl, blocks, startY) {
  const state = { y: startY };

  const ensure = (need) => {
    if (state.y + need > CONTENT_BOTTOM) {
      doc.addPage();
      drawHeader(doc, report, sealDataUrl);
      state.y = CONTENT_TOP;
    }
  };

  const drawRichText = (runs, x, width, lineH) => {
    let cx = x;
    for (const run of runs) {
      doc.setFont(FONT, run.bold ? 'bold' : (run.italic ? 'italic' : 'normal'));
      const words = run.text.split(/(\s+)/);
      for (const w of words) {
        if (w === '') continue;
        const wWidth = doc.getTextWidth(w);
        if (cx + wWidth > x + width && cx !== x) {
          state.y += lineH;
          ensure(lineH);
          cx = x;
          if (/^\s+$/.test(w)) continue;
        }
        doc.text(w, cx, state.y);
        cx += wWidth;
      }
    }
  };

  for (const blk of blocks) {
    if (blk.type === 'heading') {
      const sizes = { 1: 14, 2: 12, 3: 10.5 };
      const padTop = { 1: 6, 2: 5, 3: 4 };
      const padBot = { 1: 4, 2: 3, 3: 2 };
      ensure(sizes[blk.level] + padTop[blk.level] + padBot[blk.level]);
      state.y += padTop[blk.level];
      doc.setFont(FONT, 'bold');
      doc.setFontSize(sizes[blk.level]);
      doc.setTextColor(...TEAL);
      const text = blk.runs.map(r => r.text).join('');
      doc.text(text, MARGIN_L, state.y);
      state.y += sizes[blk.level] * 0.4;
      if (blk.level === 1) {
        doc.setDrawColor(...LIME);
        doc.setLineWidth(0.6);
        doc.line(MARGIN_L, state.y - 1, MARGIN_L + 15, state.y - 1);
        doc.setLineWidth(0.2);
      } else if (blk.level === 2) {
        doc.setDrawColor(...BORDER);
        doc.line(MARGIN_L, state.y - 1, PAGE_W - MARGIN_R, state.y - 1);
      }
      state.y += padBot[blk.level];
      continue;
    }
    if (blk.type === 'paragraph') {
      ensure(8);
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      drawRichText(blk.runs, MARGIN_L, CONTENT_W, 5);
      state.y += 5 + 3;
      continue;
    }
    if (blk.type === 'list') {
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      for (const item of blk.items) {
        ensure(6);
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...TEAL);
        doc.text('•', MARGIN_L, state.y);
        doc.setFont(FONT, 'normal');
        doc.setTextColor(15, 23, 42);
        drawRichText(item, MARGIN_L + 4, CONTENT_W - 4, 5);
        state.y += 5 + 1;
      }
      state.y += 3;
    }
  }
  return state.y;
}

export async function exportPDF(report, filename) {
  const pdfDoc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const sealDataUrl = await loadSealAsDataUrl().catch(() => null);

  // Render charts first so we can fail fast on chart errors — but each one
  // is wrapped so a single chart failure doesn't kill the whole export.
  let fundChart = null, revExpChart = null, breakdownChart = null;
  try { fundChart = await renderFundChart(report.proj); }
  catch (e) { console.error('PDF: fund chart render failed', e); }
  try { revExpChart = await renderRevExpChart(report.proj); }
  catch (e) { console.error('PDF: rev/exp chart render failed', e); }
  if (report.expCats.length > 0) {
    try { breakdownChart = await renderExpenseBreakdown(report.expCats); }
    catch (e) { console.error('PDF: expense breakdown chart render failed', e); }
  }

  // ---- Cover page ----
  drawHeader(pdfDoc, report, sealDataUrl);
  let y = 50;
  pdfDoc.setFont(FONT, 'bold');
  pdfDoc.setFontSize(22);
  pdfDoc.setTextColor(...TEAL);
  pdfDoc.text('Water Rate Study', MARGIN_L, y); y += 11;
  pdfDoc.setFont(FONT, 'normal');
  pdfDoc.setFontSize(13);
  pdfDoc.setTextColor(...MID);
  pdfDoc.text('Final Report — Board of Directors / Council Briefing', MARGIN_L, y); y += 14;

  // System info card
  pdfDoc.setDrawColor(...TEAL);
  pdfDoc.setLineWidth(0.8);
  pdfDoc.line(MARGIN_L, y, MARGIN_L + 3, y);
  pdfDoc.setLineWidth(0.2);
  y = P(pdfDoc, 'PREPARED FOR', y + 5, { size: 8, color: DIM });
  y = P(pdfDoc, report.system.name || '[System Name]', y + 1, { size: 14, bold: true, color: TEAL });
  if (report.system.pwsId || report.system.county) {
    y = P(pdfDoc, [report.system.pwsId, report.system.county && `${report.system.county} County`, report.system.year].filter(Boolean).join(' • '), y + 1, { size: 10, color: MID });
  }
  if (report.system.contact) {
    y = P(pdfDoc, `Contact: ${report.system.contact}${report.system.contactEmail ? ' — ' + report.system.contactEmail : ''}`, y + 1, { size: 9, color: MID });
  }

  y += 10;
  // Headline metric box
  pdfDoc.setFillColor(240, 249, 224);
  pdfDoc.setDrawColor(134, 239, 172);
  pdfDoc.roundedRect(MARGIN_L, y, CONTENT_W, 36, 2, 2, 'FD');
  pdfDoc.setFont(FONT, 'bold');
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(...TEAL);
  pdfDoc.text('AT A GLANCE', MARGIN_L + 6, y + 7);
  pdfDoc.setFont(FONT, 'normal');
  pdfDoc.setFontSize(8);
  pdfDoc.setTextColor(...MID);
  // Use the en-dash (–, U+2013, valid in WinAnsi) instead of → arrows here —
  // the right-arrow glyph is missing from helvetica's encoding and renders as
  // a wide blank space, which broke the "Cur → Prop" layout on the cover.
  const cells = [
    ['Cost / 1,000 gal (Cur to Prop)', `${fmt.c(report.curCP1K)} – ${fmt.c(report.propCP1K)}`],
    ['Operating Ratio (Cur to Prop)', `${report.curOR.toFixed(2)} – ${report.propOR.toFixed(2)}`],
    ['5,000 gal Bill (Cur to Prop)', `${fmt.c(report.cost5kCur)} – ${fmt.c(report.cost5kProp)}`],
    ['Affordability Index (Prop)', report.mhi ? fmt.p(report.propAI) : 'MHI not entered'],
  ];
  cells.forEach((c, i) => {
    const cx = MARGIN_L + 6 + (i % 2) * 90;
    const cy = y + 14 + Math.floor(i / 2) * 10;
    pdfDoc.setFontSize(7);
    pdfDoc.setTextColor(...DIM);
    pdfDoc.text(c[0].toUpperCase(), cx, cy);
    pdfDoc.setFontSize(11);
    pdfDoc.setTextColor(...TEAL);
    pdfDoc.text(c[1], cx, cy + 5);
  });

  // ---- Page 2: Executive Summary / Factors ----
  pdfDoc.addPage();
  drawHeader(pdfDoc, report, sealDataUrl);
  y = CONTENT_TOP;
  y = H1(pdfDoc, 'Executive Summary', y);
  y = P(pdfDoc,
    "The Choctaw Nation's Water Resource Management Office prepared this rate analysis to ensure the water system remains financially sustainable, operationally sound, and compliant with applicable standards. This report evaluates revenue strictly generated from rates — not grants, loans, or one-time revenues — to assess long-term financial health based on operational income alone.",
    y, { color: MID });
  y += 4;

  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 20);
  y = H2(pdfDoc, 'Factors Considered in the Rate Analysis', y);
  const factors = [
    ['Cost to Produce and Deliver Water', 'Real cost of providing water/wastewater services: administration, operations, and maintenance.'],
    ['Current and Future Needs', 'Ongoing and upcoming infrastructure, equipment, and maintenance requirements.'],
    ['Operating Ratio', "A measure of the system's financial health, comparing revenues to expenses."],
    ['Affordability Index', 'A benchmark to determine whether rates remain affordable for the average household in the service area.'],
    ['Debt to Income Ratio', "A measure of the system's ability to manage debt obligations responsibly."],
  ];
  factors.forEach(([t, d]) => {
    y = ensureSpace(pdfDoc, report, sealDataUrl, y, 16);
    pdfDoc.setFont(FONT, 'bold');
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(...TEAL);
    pdfDoc.text(t, MARGIN_L, y);
    pdfDoc.setFont(FONT, 'normal');
    pdfDoc.setFontSize(9);
    pdfDoc.setTextColor(...MID);
    const split = pdfDoc.splitTextToSize(d, CONTENT_W - 5);
    pdfDoc.text(split, MARGIN_L, y + 4);
    y += 4 + split.length * 4 + 3;
  });

  // ---- System Scorecard ----
  y = ensureSpace(pdfDoc, report, sealDataUrl, y + 4, 60);
  y = H2(pdfDoc, 'Financial Health Scorecard', y);
  autoTable(pdfDoc, tableBase(report, sealDataUrl, {
    startY: y,
    head: [['Metric', 'Current', 'Proposed', 'Benchmark', 'Status']],
    body: report.scorecard.map(r => [
      r.metric, r.cur, r.prop, r.benchmark,
      r.propOk === null ? 'N/A' : (r.propOk ? 'Healthy' : 'Below target'),
    ]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const r = report.scorecard[data.row.index];
        if (r.propOk === true) data.cell.styles.textColor = [22, 101, 52];
        else if (r.propOk === false) data.cell.styles.textColor = [153, 27, 27];
      }
    },
  }));
  y = pdfDoc.lastAutoTable.finalY + 8;

  // ---- Cost & 5-year ----
  pdfDoc.addPage();
  drawHeader(pdfDoc, report, sealDataUrl);
  y = CONTENT_TOP;
  y = H1(pdfDoc, 'Cost to Produce & 5-Year Outlook', y);
  y = P(pdfDoc,
    'Providing safe, reliable drinking water and/or wastewater services requires consistent investment in operations, infrastructure, and personnel. The cost to produce a thousand gallons of water captures the full operational burden today, while the five-year outlook projects what those costs become under realistic inflation scenarios.',
    y, { color: MID });
  y += 4;

  // Cost cards
  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 30);
  pdfDoc.setDrawColor(...BORDER);
  pdfDoc.setFillColor(248, 250, 252);
  pdfDoc.roundedRect(MARGIN_L, y, 87, 22, 2, 2, 'FD');
  pdfDoc.setFontSize(7);
  pdfDoc.setTextColor(...DIM);
  pdfDoc.text('CURRENT COST PER 1,000 GAL', MARGIN_L + 6, y + 6);
  pdfDoc.setFontSize(18);
  pdfDoc.setTextColor(...TEAL);
  pdfDoc.text(fmt.c(report.curCP1K), MARGIN_L + 6, y + 16);

  pdfDoc.setFillColor(240, 249, 224);
  pdfDoc.setDrawColor(134, 239, 172);
  pdfDoc.roundedRect(MARGIN_L + 93, y, 87, 22, 2, 2, 'FD');
  pdfDoc.setFontSize(7);
  pdfDoc.setTextColor(...DIM);
  pdfDoc.text('PROPOSED COST PER 1,000 GAL', MARGIN_L + 99, y + 6);
  pdfDoc.setFontSize(18);
  pdfDoc.setTextColor(90, 148, 0);
  pdfDoc.text(fmt.c(report.propCP1K), MARGIN_L + 99, y + 16);
  y += 30;

  // 5-year outlook table
  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 50);
  y = H2(pdfDoc, 'Five-Year Outlook', y);
  autoTable(pdfDoc, tableBase(report, sealDataUrl, {
    startY: y,
    head: [['Scenario', ...report.fiveYearOutlook.map(r => r.yr)]],
    body: [
      ['Annual Revenue (Proposed)', ...report.fiveYearOutlook.map(r => fmt.c(r.revenue))],
      ['Annual Expenses (3% inflation)', ...report.fiveYearOutlook.map(r => fmt.c(r.exp3))],
      ['Annual Expenses (5% inflation)', ...report.fiveYearOutlook.map(r => fmt.c(r.exp5))],
      ['Fund Balance (Proposed)', ...report.fiveYearOutlook.map(r => fmt.c(r.fundBalance))],
    ],
    styles: { font: FONT, fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  }));
  y = pdfDoc.lastAutoTable.finalY + 5;
  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 12);
  y = P(pdfDoc,
    'The 3% scenario is a conservative adjustment aligning with typical inflation. The 5% scenario accounts for rising costs in utilities, materials, and labor, and is recommended for planning purposes.',
    y, { size: 8, color: DIM });

  // ---- Charts page ----
  if (fundChart || revExpChart || breakdownChart) {
    pdfDoc.addPage();
    drawHeader(pdfDoc, report, sealDataUrl);
    y = CONTENT_TOP;
    y = H1(pdfDoc, 'Projection Charts', y);

    if (fundChart) {
      y = ensureSpace(pdfDoc, report, sealDataUrl, y, 95);
      y = H2(pdfDoc, 'Fund Balance Over Five Years', y);
      pdfDoc.addImage(fundChart.dataUrl, 'PNG', MARGIN_L, y, CONTENT_W, 80);
      y += 86;
    }
    if (revExpChart) {
      y = ensureSpace(pdfDoc, report, sealDataUrl, y, 85);
      y = H2(pdfDoc, 'Revenue vs. Expenses', y);
      pdfDoc.addImage(revExpChart.dataUrl, 'PNG', MARGIN_L, y, CONTENT_W, 70);
      y += 76;
    }
    if (breakdownChart) {
      y = ensureSpace(pdfDoc, report, sealDataUrl, y, 85);
      y = H2(pdfDoc, 'Expense Breakdown by Category', y);
      pdfDoc.addImage(breakdownChart.dataUrl, 'PNG', MARGIN_L, y, CONTENT_W, 70);
      y += 76;
    }
  }

  // ---- Operating Ratio + Affordability + DTI ----
  pdfDoc.addPage();
  drawHeader(pdfDoc, report, sealDataUrl);
  y = CONTENT_TOP;
  y = H1(pdfDoc, 'Detailed Financial Metrics', y);

  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 40);
  y = H2(pdfDoc, 'Operating Ratio', y);
  y = P(pdfDoc, 'The Operating Ratio compares total operational revenues to operational expenses. A ratio of 1.0 = break even; 1.25+ = healthy margin for reinvestment and reserves; below 1.0 = the system should raise rates or reduce costs to remain solvent.', y, { color: MID });
  y += 2;
  autoTable(pdfDoc, tableBase(report, sealDataUrl, {
    startY: y,
    head: [['', 'Current', 'Proposed', 'Status']],
    body: [
      ['Operating Ratio', report.curOR.toFixed(2), report.propOR.toFixed(2), report.propOR >= 1.25 ? 'Healthy' : report.propOR >= 1 ? 'Break-even' : 'Below target'],
    ],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  }));
  y = pdfDoc.lastAutoTable.finalY + 8;

  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 50);
  y = H2(pdfDoc, 'Affordability Index', y);
  y = P(pdfDoc, 'The Affordability Index measures household water cost as a share of monthly income (Cost of 5,000 gal ÷ Monthly MHI). USDA Rural Development considers utilities grant-eligible if the index exceeds 1.50%; below 2.00% is considered affordable by EPA standards.', y, { color: MID });
  y += 2;
  if (report.mhi > 0) {
    autoTable(pdfDoc, tableBase(report, sealDataUrl, {
      startY: y,
      head: [['', 'Current', 'Proposed', 'Note']],
      body: [
        ['5,000 gal Bill', fmt.c(report.cost5kCur), fmt.c(report.cost5kProp), `Monthly MHI: ${fmt.c(report.mhi)}`],
        ['Affordability Index', fmt.p(report.curAI), fmt.p(report.propAI), report.propAI < 0.015 ? 'USDA RD eligible' : report.propAI < 0.02 ? 'Affordable' : 'Affordability concern'],
      ],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    }));
    y = pdfDoc.lastAutoTable.finalY + 8;
  } else {
    y = P(pdfDoc, 'Median Monthly Household Income not entered — Affordability Index unavailable.', y, { color: RED });
    y += 4;
  }

  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 40);
  y = H2(pdfDoc, 'Debt to Income Ratio', y);
  y = P(pdfDoc, "The Debt-to-Income Ratio shows the percentage of income used for debt payments. A ratio under 45% is generally considered manageable.", y, { color: MID });
  y += 2;
  autoTable(pdfDoc, tableBase(report, sealDataUrl, {
    startY: y,
    head: [['', 'Current', 'Proposed', 'Status']],
    body: [['DTI', fmt.p(report.curDTI), fmt.p(report.propDTI), report.propDTI < 0.45 ? 'Manageable' : 'High']],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  }));
  y = pdfDoc.lastAutoTable.finalY + 8;

  y = ensureSpace(pdfDoc, report, sealDataUrl, y, 40);
  y = H2(pdfDoc, 'Depreciation & Capital Improvements', y);
  autoTable(pdfDoc, tableBase(report, sealDataUrl, {
    startY: y,
    head: [['Item', 'Current', 'Proposed']],
    body: [
      ['Monthly depreciation set-aside', fmt.c(report.curDepr), fmt.c(report.propDepr)],
      ['Monthly capital improvement set-aside', fmt.c(report.curLR), fmt.c(report.propLR)],
    ],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  }));
  y = pdfDoc.lastAutoTable.finalY + 8;

  // ---- Customer Class breakdown ----
  pdfDoc.addPage();
  drawHeader(pdfDoc, report, sealDataUrl);
  y = CONTENT_TOP;
  y = H1(pdfDoc, 'Customer Class Revenue Breakdown', y);
  y = P(pdfDoc, 'Monthly revenue by customer class under current and proposed rates.', y, { color: MID });
  y += 2;
  autoTable(pdfDoc, tableBase(report, sealDataUrl, {
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
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  }));
  y = pdfDoc.lastAutoTable.finalY + 10;

  if (report.scenario?.rows?.length) {
    y = ensureSpace(pdfDoc, report, sealDataUrl, y, 60);
    y = H2(pdfDoc, `Active Scenario: ${report.scenario.label || 'Custom'}`, y);
    y = P(
      pdfDoc,
      `Scenario monthly revenue is ${fmt.c(report.scenario.monthlyRevenue)}, which is ${(report.scenario.vsProposed >= 0 ? '+' : '') + fmt.c(report.scenario.vsProposed)} versus proposed rates. Net monthly surplus / (deficit) after proposed expenses is ${(report.scenario.netMonthly >= 0 ? '+' : '') + fmt.c(report.scenario.netMonthly)}.`,
      y,
      { color: MID, size: 9 },
    );
    y += 2;
    autoTable(pdfDoc, tableBase(report, sealDataUrl, {
      startY: y,
      head: [['Class', 'Proposed (Base)', 'Rate Basis', 'Multiplier', 'Scenario Mo.', 'vs. Proposed']],
      body: report.scenario.rows.map(r => [
        r.name,
        fmt.c(r.base),
        r.rateBasis === 'current' ? 'Current rates' : 'Proposed rates',
        `${r.multiplier.toFixed(2)}x`,
        fmt.c(r.monthly),
        (r.delta >= 0 ? '+' : '') + fmt.c(r.delta),
      ]),
      foot: [[
        'Total',
        fmt.c(report.revProp.monthly),
        '',
        '',
        fmt.c(report.scenario.monthlyRevenue),
        (report.scenario.vsProposed >= 0 ? '+' : '') + fmt.c(report.scenario.vsProposed),
      ]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    }));
    y = pdfDoc.lastAutoTable.finalY + 10;
  }

  if (report.expCats.length > 0) {
    y = ensureSpace(pdfDoc, report, sealDataUrl, y, 50);
    y = H2(pdfDoc, 'Monthly Expense Breakdown', y);
    autoTable(pdfDoc, tableBase(report, sealDataUrl, {
      startY: y,
      head: [['Category', 'Current', 'Proposed', '$ Δ']],
      body: report.expCats.map(c => [c.label, fmt.c(c.cur), fmt.c(c.prop), (c.delta >= 0 ? '+' : '') + fmt.c(c.delta)]),
      foot: [['Total', fmt.c(report.curBT.total), fmt.c(report.propBT.total),
        (report.propBT.total - report.curBT.total >= 0 ? '+' : '') + fmt.c(report.propBT.total - report.curBT.total)]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    }));
    y = pdfDoc.lastAutoTable.finalY + 8;
  }

  // ---- AI Analysis ----
  if (report.aiAnalysis) {
    pdfDoc.addPage();
    drawHeader(pdfDoc, report, sealDataUrl);
    y = CONTENT_TOP;
    y = H1(pdfDoc, 'Analyst Narrative', y);
    y = P(pdfDoc, 'AI-generated analysis based on the data captured in this study.', y, { size: 9, color: DIM });
    y += 4;
    y = renderMarkdownPDF(pdfDoc, report, sealDataUrl, parseMarkdown(report.aiAnalysis), y);
  }

  // ---- Final recommendations + notes ----
  pdfDoc.addPage();
  drawHeader(pdfDoc, report, sealDataUrl);
  y = CONTENT_TOP;
  y = H1(pdfDoc, 'Final Recommendations', y);
  y = P(pdfDoc,
    'The Choctaw Nation recommends that each system conduct a rate analysis and adjust rates as needed to ensure financial sustainability, proper infrastructure funding, and continued service to tribal members.',
    y);
  y += 4;
  y = P(pdfDoc,
    "Note: This analysis serves as guidance and reference only. The Choctaw Nation is not responsible for any decisions made based on this analysis. Each system's board or council retains final authority over rate setting.",
    y, { size: 9, color: MID });

  if (report.reportNotes) {
    y += 6;
    y = ensureSpace(pdfDoc, report, sealDataUrl, y, 30);
    y = H2(pdfDoc, 'Report Notes & Additional Observations', y);
    y = P(pdfDoc, report.reportNotes, y);
  }

  drawFooters(pdfDoc);
  pdfDoc.save(filename);
}
