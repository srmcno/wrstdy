// Editable Word .docx export. Uses the `docx` library to build a structured
// document with proper headings, tables, and embedded chart PNGs that staff
// can edit/refine before sending to a board.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  ImageRun, Header, Footer, PageNumber, LevelFormat,
} from 'docx';
import { fmt } from '../calc.js';
import { renderFundChart, renderRevExpChart, renderExpenseBreakdown } from './charts.js';
import { parseMarkdown } from './markdown.js';

// Gill Sans Nova ships with Microsoft Office; Word will render it natively
// for OWRM staff. On systems without it, Word falls back to a similar sans.
const DOC_FONT = 'Gill Sans Nova';

const TEAL = '1E3D3B';
const LIME = '76B900';
const DIM = '94A3B8';
const MID = '475569';
const SURFACE = 'F8FAFC';
const BORDER = 'E2E8F0';
const RED = 'DC2626';
const GREEN_DARK = '166534';

function noBorder() {
  const v = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: v, bottom: v, left: v, right: v };
}
function lightBorder() {
  const v = { style: BorderStyle.SINGLE, size: 4, color: BORDER };
  return { top: v, bottom: v, left: v, right: v };
}

function H(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, color: TEAL, font: DOC_FONT })],
    spacing: { before: 240, after: 120 },
  });
}
function P(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({
      text,
      bold: opts.bold,
      italics: opts.italic,
      color: opts.color || '0F172A',
      font: DOC_FONT,
      size: opts.size || 22, // half-points (22 = 11pt)
    })],
    spacing: { after: opts.after ?? 120, line: 320 },
    alignment: opts.align || AlignmentType.LEFT,
  });
}

function dataUrlToUint8(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function tHead(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: { type: ShadingType.CLEAR, fill: TEAL, color: 'auto' },
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18, font: DOC_FONT })],
    })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}
function tCell(text, opts = {}) {
  return new TableCell({
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: SURFACE, color: 'auto' } : undefined,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text, bold: opts.bold, color: opts.color || '0F172A', size: 18, font: DOC_FONT })],
    })],
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  });
}

function buildTable(headers, rows, footer) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => tHead(h.text, { align: h.align })),
  });
  const bodyRows = rows.map((r, idx) => new TableRow({
    children: r.map((c, i) => tCell(c.text || c, {
      align: c.align || (i > 0 && headers[i]?.align === AlignmentType.RIGHT ? AlignmentType.RIGHT : AlignmentType.LEFT),
      shade: idx % 2 === 1,
      bold: c.bold,
      color: c.color,
    })),
  }));
  const allRows = [headerRow, ...bodyRows];
  if (footer) {
    allRows.push(new TableRow({
      children: footer.map((c, i) => new TableCell({
        shading: { type: ShadingType.CLEAR, fill: TEAL, color: 'auto' },
        children: [new Paragraph({
          alignment: c.align || (i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT),
          children: [new TextRun({ text: c.text || c, bold: true, color: 'FFFFFF', size: 18, font: DOC_FONT })],
        })],
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
      })),
    }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: allRows,
  });
}

function chartParagraph(chart, widthPx = 600) {
  const ratio = chart.height / chart.width;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new ImageRun({
      data: dataUrlToUint8(chart.dataUrl),
      transformation: { width: widthPx, height: Math.round(widthPx * ratio) },
    })],
  });
}

export async function exportDocx(report, filename, sealUint8) {
  const fundChart = await renderFundChart(report.proj);
  const revExpChart = await renderRevExpChart(report.proj);
  const breakdownChart = report.expCats.length > 0 ? await renderExpenseBreakdown(report.expCats) : null;

  // Cover header (with seal if available)
  const headerKids = [];
  if (sealUint8) {
    headerKids.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new ImageRun({ data: sealUint8, transformation: { width: 60, height: 60 } })],
    }));
  }

  const docHeader = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: 'CHOCTAW NATION', bold: true, color: TEAL, size: 18, font: DOC_FONT }),
        new TextRun({ text: '   Office of Water Resource Management', color: MID, size: 16, font: DOC_FONT }),
      ],
    })],
  });
  const docFooter = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Water Rate Study  •  Page ', color: DIM, size: 16, font: DOC_FONT }),
        new TextRun({ children: [PageNumber.CURRENT], color: DIM, size: 16, font: DOC_FONT }),
        new TextRun({ text: ' of ', color: DIM, size: 16, font: DOC_FONT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], color: DIM, size: 16, font: DOC_FONT }),
      ],
    })],
  });

  const children = [];

  // Cover content
  if (sealUint8) {
    children.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [new ImageRun({ data: sealUint8, transformation: { width: 80, height: 80 } })],
    }));
  }
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text: 'CHOCTAW NATION', bold: true, color: TEAL, size: 32, font: DOC_FONT })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text: 'Office of Water Resource Management', color: LIME, size: 22, font: DOC_FONT })],
    spacing: { after: 480 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Water Rate Study', bold: true, color: TEAL, size: 56, font: DOC_FONT })],
    spacing: { after: 120 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Final Report — Board / Council Briefing', color: MID, size: 28, font: DOC_FONT })],
    spacing: { after: 480 },
  }));
  children.push(P('PREPARED FOR', { size: 18, color: DIM, after: 60 }));
  children.push(P(report.system.name || '[System Name]', { bold: true, color: TEAL, size: 28, after: 60 }));
  const subline = [report.system.pwsId, report.system.county && `${report.system.county} County`, report.system.year].filter(Boolean).join(' • ');
  if (subline) children.push(P(subline, { color: MID, size: 22, after: 60 }));
  if (report.system.contact) {
    children.push(P(`Contact: ${report.system.contact}${report.system.contactEmail ? ' — ' + report.system.contactEmail : ''}`, { color: MID, size: 20, after: 60 }));
  }
  children.push(P(`Generated ${new Date(report.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { color: DIM, size: 18, after: 480 }));

  // At a glance
  children.push(H('At a Glance', HeadingLevel.HEADING_2));
  children.push(buildTable(
    [{ text: 'Metric' }, { text: 'Current', align: AlignmentType.RIGHT }, { text: 'Proposed', align: AlignmentType.RIGHT }],
    [
      ['Cost per 1,000 gallons', { text: fmt.c(report.curCP1K), align: AlignmentType.RIGHT }, { text: fmt.c(report.propCP1K), align: AlignmentType.RIGHT }],
      ['Operating Ratio', { text: report.curOR.toFixed(2), align: AlignmentType.RIGHT }, { text: report.propOR.toFixed(2), align: AlignmentType.RIGHT }],
      ['Bill at 5,000 gal', { text: fmt.c(report.cost5kCur), align: AlignmentType.RIGHT }, { text: fmt.c(report.cost5kProp), align: AlignmentType.RIGHT }],
      ['Affordability Index', { text: report.mhi ? fmt.p(report.curAI) : 'N/A', align: AlignmentType.RIGHT }, { text: report.mhi ? fmt.p(report.propAI) : 'N/A', align: AlignmentType.RIGHT }],
    ],
  ));

  children.push(H('Executive Summary'));
  children.push(P("The Choctaw Nation's Water Resource Management Office prepared this rate analysis to ensure the water system remains financially sustainable, operationally sound, and compliant with applicable standards. This report evaluates revenue strictly generated from rates — not grants, loans, or one-time revenues — to assess long-term financial health based on operational income alone.", { color: MID }));

  children.push(H('Factors Considered', HeadingLevel.HEADING_2));
  for (const [t, d] of [
    ['Cost to Produce and Deliver Water', 'Real cost of providing water/wastewater services: administration, operations, and maintenance.'],
    ['Current and Future Needs', 'Ongoing and upcoming infrastructure, equipment, and maintenance requirements.'],
    ['Operating Ratio', "A measure of the system's financial health, comparing revenues to expenses."],
    ['Affordability Index', 'A benchmark to determine whether rates remain affordable for the average household.'],
    ['Debt to Income Ratio', "A measure of the system's ability to manage debt obligations responsibly."],
  ]) {
    children.push(P(t, { bold: true, color: TEAL, after: 60 }));
    children.push(P(d, { color: MID, after: 160 }));
  }

  children.push(H('Financial Health Scorecard', HeadingLevel.HEADING_2));
  children.push(buildTable(
    [
      { text: 'Metric' }, { text: 'Current', align: AlignmentType.RIGHT },
      { text: 'Proposed', align: AlignmentType.RIGHT }, { text: 'Benchmark' }, { text: 'Status' },
    ],
    report.scorecard.map(r => [
      r.metric,
      { text: r.cur, align: AlignmentType.RIGHT },
      { text: r.prop, align: AlignmentType.RIGHT },
      r.benchmark,
      { text: r.propOk === null ? 'N/A' : (r.propOk ? '✓ Healthy' : '✗ Below'),
        color: r.propOk === null ? MID : (r.propOk ? GREEN_DARK : RED), bold: true },
    ]),
  ));

  children.push(H('Cost to Produce & Five-Year Outlook'));
  children.push(P('Providing safe, reliable drinking water and/or wastewater services requires consistent investment in operations, infrastructure, and personnel. The five-year outlook projects what those costs become under realistic inflation scenarios.', { color: MID }));
  children.push(buildTable(
    [{ text: 'Scenario' }, ...report.fiveYearOutlook.map(r => ({ text: r.yr, align: AlignmentType.RIGHT }))],
    [
      ['Annual Revenue (Proposed)', ...report.fiveYearOutlook.map(r => ({ text: fmt.c(r.revenue), align: AlignmentType.RIGHT }))],
      ['Annual Expenses (3% inflation)', ...report.fiveYearOutlook.map(r => ({ text: fmt.c(r.exp3), align: AlignmentType.RIGHT }))],
      ['Annual Expenses (5% inflation)', ...report.fiveYearOutlook.map(r => ({ text: fmt.c(r.exp5), align: AlignmentType.RIGHT }))],
    ],
    [{ text: 'Fund Balance (Proposed)' }, ...report.fiveYearOutlook.map(r => ({ text: fmt.c(r.fundBalance) }))],
  ));

  children.push(H('Projection Charts', HeadingLevel.HEADING_2));
  children.push(P('Fund Balance Over Five Years', { bold: true, color: TEAL, after: 60 }));
  children.push(chartParagraph(fundChart));
  children.push(P('Revenue vs. Expenses', { bold: true, color: TEAL, after: 60 }));
  children.push(chartParagraph(revExpChart));
  if (breakdownChart) {
    children.push(P('Expense Breakdown by Category', { bold: true, color: TEAL, after: 60 }));
    children.push(chartParagraph(breakdownChart));
  }

  // Operating ratio details
  children.push(H('Detailed Financial Metrics'));
  children.push(P('Operating Ratio', { bold: true, color: TEAL, after: 60 }));
  children.push(P('The Operating Ratio compares total operational revenues to operational expenses. A ratio of 1.0 means break-even; 1.25 or higher indicates a healthy margin for reinvestment and reserves; below 1.0 means rates should rise or costs should be cut.', { color: MID }));

  if (report.mhi > 0) {
    children.push(P('Affordability Index', { bold: true, color: TEAL, after: 60 }));
    children.push(P('Cost of 5,000 gal ÷ Monthly MHI. USDA Rural Development considers utilities grant-eligible above 1.50%; below 2.00% is considered affordable by EPA standards.', { color: MID }));
    children.push(buildTable(
      [{ text: '' }, { text: 'Current', align: AlignmentType.RIGHT }, { text: 'Proposed', align: AlignmentType.RIGHT }],
      [
        ['5,000 gal Bill', { text: fmt.c(report.cost5kCur), align: AlignmentType.RIGHT }, { text: fmt.c(report.cost5kProp), align: AlignmentType.RIGHT }],
        ['Monthly MHI', { text: fmt.c(report.mhi), align: AlignmentType.RIGHT }, { text: fmt.c(report.mhi), align: AlignmentType.RIGHT }],
        ['Affordability Index', { text: fmt.p(report.curAI), align: AlignmentType.RIGHT }, { text: fmt.p(report.propAI), align: AlignmentType.RIGHT }],
      ],
    ));
  }

  // Customer classes
  children.push(H('Customer Class Revenue Breakdown'));
  children.push(buildTable(
    [
      { text: 'Class' }, { text: 'Customers', align: AlignmentType.RIGHT },
      { text: 'Current Mo.', align: AlignmentType.RIGHT }, { text: 'Proposed Mo.', align: AlignmentType.RIGHT },
      { text: '$ Δ', align: AlignmentType.RIGHT }, { text: '% Δ', align: AlignmentType.RIGHT },
    ],
    report.classRows.map(r => [
      r.name,
      { text: r.customers.toLocaleString(), align: AlignmentType.RIGHT },
      { text: fmt.c(r.cur), align: AlignmentType.RIGHT },
      { text: fmt.c(r.prop), align: AlignmentType.RIGHT },
      { text: (r.delta >= 0 ? '+' : '') + fmt.c(r.delta), align: AlignmentType.RIGHT, color: r.delta >= 0 ? GREEN_DARK : RED },
      { text: r.pct.toFixed(1) + '%', align: AlignmentType.RIGHT },
    ]),
    [
      'Total', '',
      fmt.c(report.revCur.monthly),
      fmt.c(report.revProp.monthly),
      (report.revProp.monthly - report.revCur.monthly >= 0 ? '+' : '') + fmt.c(report.revProp.monthly - report.revCur.monthly),
      report.revCur.monthly > 0 ? ((report.revProp.monthly - report.revCur.monthly) / report.revCur.monthly * 100).toFixed(1) + '%' : '—',
    ],
  ));

  if (report.scenario?.rows?.length) {
    children.push(H(`Active Scenario: ${report.scenario.label || 'Custom'}`, HeadingLevel.HEADING_2));
    children.push(P(`Scenario monthly revenue is ${fmt.c(report.scenario.monthlyRevenue)}, which is ${(report.scenario.vsProposed >= 0 ? '+' : '') + fmt.c(report.scenario.vsProposed)} versus proposed rates. Net monthly surplus / (deficit) after proposed expenses is ${(report.scenario.netMonthly >= 0 ? '+' : '') + fmt.c(report.scenario.netMonthly)}.`, { color: MID }));
    children.push(buildTable(
      [
        { text: 'Class' }, { text: 'Proposed (Base)', align: AlignmentType.RIGHT },
        { text: 'Rate Basis', align: AlignmentType.RIGHT }, { text: 'Multiplier', align: AlignmentType.RIGHT },
        { text: 'Scenario Mo.', align: AlignmentType.RIGHT }, { text: 'vs. Proposed', align: AlignmentType.RIGHT },
      ],
      report.scenario.rows.map(r => [
        r.name,
        { text: fmt.c(r.base), align: AlignmentType.RIGHT },
        { text: r.rateBasis === 'current' ? 'Current rates' : 'Proposed rates', align: AlignmentType.RIGHT },
        { text: `${r.multiplier.toFixed(2)}x`, align: AlignmentType.RIGHT },
        { text: fmt.c(r.monthly), align: AlignmentType.RIGHT },
        { text: (r.delta >= 0 ? '+' : '') + fmt.c(r.delta), align: AlignmentType.RIGHT, color: r.delta >= 0 ? GREEN_DARK : RED },
      ]),
      [
        'Total',
        fmt.c(report.revProp.monthly),
        '',
        '',
        fmt.c(report.scenario.monthlyRevenue),
        (report.scenario.vsProposed >= 0 ? '+' : '') + fmt.c(report.scenario.vsProposed),
      ],
    ));
  }

  if (report.expCats.length > 0) {
    children.push(P('Monthly Expense Breakdown', { bold: true, color: TEAL, after: 60 }));
    children.push(buildTable(
      [
        { text: 'Category' }, { text: 'Current', align: AlignmentType.RIGHT },
        { text: 'Proposed', align: AlignmentType.RIGHT }, { text: '$ Δ', align: AlignmentType.RIGHT },
      ],
      report.expCats.map(c => [
        c.label,
        { text: fmt.c(c.cur), align: AlignmentType.RIGHT },
        { text: fmt.c(c.prop), align: AlignmentType.RIGHT },
        { text: (c.delta >= 0 ? '+' : '') + fmt.c(c.delta), align: AlignmentType.RIGHT, color: c.delta >= 0 ? RED : GREEN_DARK },
      ]),
      ['Total', fmt.c(report.curBT.total), fmt.c(report.propBT.total),
       (report.propBT.total - report.curBT.total >= 0 ? '+' : '') + fmt.c(report.propBT.total - report.curBT.total)],
    ));
  }

  if (report.aiAnalysis) {
    children.push(H('Analyst Narrative'));
    children.push(P('AI-generated analysis based on the data captured in this study. Edit before sending to the board.', { color: DIM, italic: true, size: 18 }));
    for (const blk of parseMarkdown(report.aiAnalysis)) {
      if (blk.type === 'heading') {
        const sizeMap = { 1: 30, 2: 26, 3: 22 };
        children.push(new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [new TextRun({
            text: blk.runs.map(r => r.text).join(''),
            bold: true,
            color: TEAL,
            font: DOC_FONT,
            size: sizeMap[blk.level] || 22,
          })],
        }));
      } else if (blk.type === 'paragraph') {
        children.push(new Paragraph({
          spacing: { after: 140, line: 320 },
          children: blk.runs.map(r => new TextRun({
            text: r.text, bold: r.bold, italics: r.italic,
            font: DOC_FONT, size: 22, color: '0F172A',
          })),
        }));
      } else if (blk.type === 'list') {
        for (const item of blk.items) {
          children.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: item.map(r => new TextRun({
              text: r.text, bold: r.bold, italics: r.italic,
              font: DOC_FONT, size: 22, color: '0F172A',
            })),
          }));
        }
      }
    }
  }

  children.push(H('Final Recommendations'));
  children.push(P('The Choctaw Nation recommends that each system conduct a rate analysis and adjust rates as needed to ensure financial sustainability, proper infrastructure funding, and continued service to tribal members.'));
  children.push(P("Note: This analysis serves as guidance and reference only. The Choctaw Nation is not responsible for any decisions made based on this analysis. Each system's board or council retains final authority over rate setting.", { color: MID, italic: true, size: 20 }));

  if (report.reportNotes) {
    children.push(H('Report Notes & Additional Observations', HeadingLevel.HEADING_2));
    for (const para of report.reportNotes.split(/\n{2,}/)) {
      if (para.trim()) children.push(P(para.trim()));
    }
  }

  const doc = new Document({
    creator: 'Choctaw Nation OWRM',
    title: report.studyName || 'Water Rate Study',
    styles: {
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: DOC_FONT, size: 32, bold: true, color: TEAL } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: DOC_FONT, size: 26, bold: true, color: TEAL } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      headers: { default: docHeader },
      footers: { default: docFooter },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
