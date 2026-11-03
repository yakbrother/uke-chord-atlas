// ═══════════════════════════════════════════════════════════
// CHORD-SHEET PDF EXPORT (zero-dependency)
//
// Writes a small PDF 1.4 file by hand: the four standard fonts
// (Helvetica, Helvetica-Bold, Courier, Courier-Bold) need no embedding,
// chord diagrams are vector paths, and the lyric sheet is set in Courier
// so chord names line up over the words exactly as on screen.
// Pure functions only (no DOM), so it can be unit tested under Node.
// ═══════════════════════════════════════════════════════════

const PDF_PAGE = { width: 612, height: 792, margin: 50 }; // US Letter, points
const PDF_ACCENT = [0.141, 0.337, 0.643];               // #2456a4, the app's blue
const PDF_SHEET_SIZE = 11;                               // Courier point size
const PDF_COURIER_ADVANCE = 0.6;                         // Courier: every glyph is 600/1000 em

// Characters outside WinAnsi that commonly appear in lyrics and chord names
const PDF_CHAR_MAP = {
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '…': '...', ' ': ' ', '♯': '#', '♭': 'b',
  'Δ': 'maj', 'ø': 'ø',
};

/** Make text safe for a WinAnsi PDF string literal: Latin-1 only, escaped. */
function pdfText(s) {
  let out = '';
  for (const ch of String(s)) {
    let c = PDF_CHAR_MAP[ch] !== undefined ? PDF_CHAR_MAP[ch] : ch;
    for (const d of c) {
      const code = d.codePointAt(0);
      if (d === '\\' || d === '(' || d === ')') out += '\\' + d;
      else if (code < 32) out += ' ';
      else if (code > 255) out += '?';
      else out += d;
    }
  }
  return out;
}

// Rough Helvetica advance widths (per 1000 em) for centring short labels.
function pdfHelveticaWidth(s, size, bold) {
  let w = 0;
  for (const ch of String(s)) {
    if (/[A-Z]/.test(ch)) w += ch === 'M' || ch === 'W' ? 833 : (ch === 'I' ? 278 : 700);
    else if (/[mw]/.test(ch)) w += 833;
    else if (/[ijlft]/.test(ch)) w += 278;
    else if (/[a-z]/.test(ch)) w += 556;
    else if (/[0-9#]/.test(ch)) w += 556;
    else if (ch === ' ' || ch === '/' || ch === '(' || ch === ')') w += 278;
    else w += 556;
  }
  return (w * (bold ? 1.05 : 1) * size) / 1000;
}

const fmt = (n) => (Math.round(n * 100) / 100).toString();

class PdfCanvas {
  constructor() { this.ops = []; }
  text(x, y, str, font, size, rgb) {
    this.ops.push(`${rgb ? rgb.map(fmt).join(' ') : '0 0 0'} rg BT /${font} ${fmt(size)} Tf ${fmt(x)} ${fmt(y)} Td (${pdfText(str)}) Tj ET`);
  }
  line(x1, y1, x2, y2, width, gray) {
    this.ops.push(`${fmt(gray || 0)} G ${fmt(width)} w ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`);
  }
  rect(x, y, w, h, gray) {
    this.ops.push(`${fmt(gray || 0)} g ${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re f`);
  }
  circle(cx, cy, r, mode, rgb, width) {
    const k = 0.5523 * r;
    const color = rgb ? rgb.map(fmt).join(' ') : '0 0 0';
    this.ops.push(
      `${color} rg ${color} RG ${fmt(width || 1)} w ${fmt(cx + r)} ${fmt(cy)} m ` +
      `${fmt(cx + r)} ${fmt(cy + k)} ${fmt(cx + k)} ${fmt(cy + r)} ${fmt(cx)} ${fmt(cy + r)} c ` +
      `${fmt(cx - k)} ${fmt(cy + r)} ${fmt(cx - r)} ${fmt(cy + k)} ${fmt(cx - r)} ${fmt(cy)} c ` +
      `${fmt(cx - r)} ${fmt(cy - k)} ${fmt(cx - k)} ${fmt(cy - r)} ${fmt(cx)} ${fmt(cy - r)} c ` +
      `${fmt(cx + k)} ${fmt(cy - r)} ${fmt(cx + r)} ${fmt(cy - k)} ${fmt(cx + r)} ${fmt(cy)} c ${mode === 'fill' ? 'f' : 'S'}`);
  }
  toString() { return this.ops.join('\n'); }
}

const DIAGRAM = { w: 54, fretH: 12, frets: 5, cellW: 76, cellH: 118 };

/** Draw one chord diagram with its top-left corner at (x, top). */
function drawDiagram(cv, x, top, d) {
  const strings = d.frets.length;
  const gap = DIAGRAM.w / (strings - 1);
  const gridTop = top - 32;
  const gridH = DIAGRAM.fretH * DIAGRAM.frets;
  cv.text(x + DIAGRAM.w / 2 - pdfHelveticaWidth(d.name, 12, true) / 2, top - 10, d.name, 'F2', 12);

  const pressed = d.frets.filter(f => typeof f === 'number' && f > 0);
  const minFret = pressed.length ? Math.min(...pressed) : 0;
  const startFret = minFret > 1 ? minFret : 1;
  if (startFret === 1) cv.rect(x - 1, gridTop, DIAGRAM.w + 2, 3, 0);
  else cv.text(x - 8 - pdfHelveticaWidth(String(startFret), 8), gridTop - DIAGRAM.fretH * 0.7, String(startFret), 'F1', 8, [0.36, 0.37, 0.42]);
  for (let f = 0; f <= DIAGRAM.frets; f++) {
    if (f === 0 && startFret === 1) continue;
    cv.line(x, gridTop - f * DIAGRAM.fretH, x + DIAGRAM.w, gridTop - f * DIAGRAM.fretH, 0.6, 0.55);
  }
  for (let s = 0; s < strings; s++) cv.line(x + s * gap, gridTop, x + s * gap, gridTop - gridH, 0.8 + s * 0.1, 0.3);

  d.frets.forEach((f, s) => {
    const cx = x + s * gap;
    if (f === null || f === undefined) {
      cv.text(cx - 2.5, gridTop + 4, 'x', 'F1', 8);
    } else if (f === 0) {
      cv.circle(cx, gridTop + 7, 3, 'stroke', [0.85, 0.65, 0.13], 1.1);
    } else {
      const cy = gridTop - (f - startFret + 0.5) * DIAGRAM.fretH;
      cv.circle(cx, cy, 4.6, 'fill', [0.07, 0.07, 0.09]);
      const label = d.notes && d.notes[s] ? d.notes[s] : '';
      if (label) cv.text(cx - pdfHelveticaWidth(label, 5.5, true) / 2, cy - 2, label, 'F2', 5.5, [1, 1, 1]);
    }
  });
  (d.stringNames || []).forEach((n, s) => {
    cv.text(x + s * gap - pdfHelveticaWidth(n, 7) / 2, gridTop - gridH - 10, n, 'F1', 7, [0.36, 0.37, 0.42]);
  });
}

/** Split a chord/lyric row so neither line exceeds maxChars, breaking lyrics at spaces. */
function wrapSheetRow(chordLine, text, maxChars) {
  const out = [];
  let c = chordLine || '', t = text || '';
  while (c.length > maxChars || t.length > maxChars) {
    let cut = maxChars;
    const space = t.lastIndexOf(' ', maxChars);
    if (space > maxChars * 0.5) cut = space + 1;
    // Don't cut through a chord name
    while (cut > 1 && c[cut - 1] && c[cut - 1] !== ' ' && c[cut] && c[cut] !== ' ') cut--;
    out.push({ chordLine: c.slice(0, cut).trimEnd(), text: t.slice(0, cut).trimEnd() });
    c = c.slice(cut); t = t.slice(cut);
  }
  out.push({ chordLine: c.trimEnd(), text: t });
  return out;
}

/**
 * Build the PDF.
 * @param {object} song
 *   title, artist, details (string[]: key/capo/tuning lines),
 *   diagrams: [{ name, frets, notes, stringNames }],
 *   rows: [{ chordLine, text }] (chords-over-lyrics; text may be ''),
 *   footer (string)
 * @returns {Uint8Array}
 */
function buildChordSheetPdf(song) {
  const { width, height, margin } = PDF_PAGE;
  const pages = [];
  let cv = null, y = 0;
  const contentW = width - margin * 2;
  const newPage = () => { cv = new PdfCanvas(); pages.push(cv); y = height - margin; };
  const ensure = (h) => { if (y - h < margin + 14) newPage(); };
  newPage();

  // Header
  cv.text(margin, y - 20, song.title || 'Untitled song', 'F2', 20);
  y -= 30;
  if (song.artist) { cv.text(margin, y - 12, song.artist, 'F1', 12, [0.36, 0.37, 0.42]); y -= 18; }
  if (song.details && song.details.length) {
    cv.text(margin, y - 10, song.details.join('   ·   '), 'F1', 9.5, [0.36, 0.37, 0.42]);
    y -= 16;
  }
  cv.line(margin, y - 4, width - margin, y - 4, 0.8, 0.75);
  y -= 16;

  // Chord diagrams
  const diagrams = song.diagrams || [];
  if (diagrams.length) {
    const perRow = Math.max(1, Math.floor((contentW + (DIAGRAM.cellW - DIAGRAM.w)) / DIAGRAM.cellW));
    for (let i = 0; i < diagrams.length; i += perRow) {
      ensure(DIAGRAM.cellH);
      diagrams.slice(i, i + perRow).forEach((d, j) => drawDiagram(cv, margin + 8 + j * DIAGRAM.cellW, y, d));
      y -= DIAGRAM.cellH;
    }
    y -= 4;
  }

  // Sheet
  const lineH = PDF_SHEET_SIZE * 1.25;
  const maxChars = Math.floor(contentW / (PDF_SHEET_SIZE * PDF_COURIER_ADVANCE));
  for (const row of song.rows || []) {
    const parts = wrapSheetRow(row.chordLine, row.text, maxChars);
    for (const p of parts) {
      if (!p.chordLine && !p.text) { ensure(lineH * 0.7); y -= lineH * 0.7; continue; }
      const h = (p.chordLine ? lineH : 0) + (p.text ? lineH : 0) + 3;
      ensure(h);
      if (p.chordLine) { cv.text(margin, y - PDF_SHEET_SIZE, p.chordLine, 'F4', PDF_SHEET_SIZE, PDF_ACCENT); y -= lineH; }
      if (p.text) { cv.text(margin, y - PDF_SHEET_SIZE, p.text, 'F3', PDF_SHEET_SIZE); y -= lineH; }
      y -= 3;
    }
  }

  // Footers
  pages.forEach((p, i) => {
    const label = `${song.footer ? song.footer + '   ' : ''}Page ${i + 1} of ${pages.length}`;
    p.text(margin, margin - 24, label, 'F1', 8, [0.55, 0.55, 0.58]);
  });

  // Assemble objects. 1 catalog, 2 pages, 3-6 fonts, then (page, content) pairs.
  const objs = [];
  const pageIds = pages.map((_, i) => 7 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  ['Helvetica', 'Helvetica-Bold', 'Courier', 'Courier-Bold'].forEach((f, i) => {
    objs[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`;
  });
  const fonts = '/Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>';
  pages.forEach((p, i) => {
    const pid = pageIds[i], cid = pid + 1;
    const stream = p.toString();
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << ${fonts} >> /Contents ${cid} 0 R >>`;
    objs[cid] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const info = objs.length;
  objs[info] = `<< /Title (${pdfText(song.title || 'Chord sheet')}) /Producer (Uke Chord Atlas Song Lab) >>`;

  // Every character is a single byte (pdfText guarantees <= 0xFF), so string
  // length equals byte offset.
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildChordSheetPdf, wrapSheetRow, pdfText };
}
