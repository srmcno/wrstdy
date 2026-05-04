// Tiny markdown → block-list parser used by both PDF and DOCX exporters.
// Handles the subset of Markdown the AI actually produces:
//   # H1   ## H2   ### H3
//   - bullet (or * bullet)
//   blank line = paragraph break
//   **bold**   *italic*  inline runs
// No nested lists, no tables, no links.

export function parseMarkdown(input) {
  const text = (input || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const blocks = [];
  let para = [];
  let bullets = null;

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: 'paragraph', runs: parseInline(para.join(' ')) });
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets && bullets.length > 0) {
      blocks.push({ type: 'list', items: bullets.map(b => parseInline(b)) });
    }
    bullets = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushPara();
      flushBullets();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushBullets();
      blocks.push({ type: 'heading', level: Math.min(h[1].length, 3), runs: parseInline(h[2]) });
      continue;
    }
    const b = /^[-*]\s+(.*)$/.exec(line);
    if (b) {
      flushPara();
      bullets = bullets || [];
      bullets.push(b[1]);
      continue;
    }
    flushBullets();
    para.push(line);
  }
  flushPara();
  flushBullets();
  return blocks;
}

// Parses **bold** and *italic* into a list of {text, bold, italic} runs.
function parseInline(s) {
  const runs = [];
  let i = 0;
  let buf = '';
  let bold = false;
  let italic = false;

  const flush = () => {
    if (buf) { runs.push({ text: buf, bold, italic }); buf = ''; }
  };

  while (i < s.length) {
    if (s[i] === '*' && s[i + 1] === '*') {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (s[i] === '*') {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buf += s[i++];
  }
  flush();
  return runs.length ? runs : [{ text: s, bold: false, italic: false }];
}
