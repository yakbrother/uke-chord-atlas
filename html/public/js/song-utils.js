// ═══════════════════════════════════════════════════════════
// SONG UTILITIES — chord names, transposition, lyrics (LRC),
// ChordPro import/export, and easiest-voicing selection.
// Depends on: music-theory.js (NOTE_NAMES, NOTE_NAMES_FLAT, FLAT_KEYS,
// CHORD_TYPES, getVoicings, BARI_OFFSET, isBaritone)
// Pure functions (no DOM) so they can be unit tested under Node.
// ═══════════════════════════════════════════════════════════

// Suffix spellings → CHORD_TYPES id. Checked longest-first.
const CHORD_SUFFIXES = {
  '': 'maj', 'maj': 'maj', 'M': 'maj',
  'm': 'min', 'min': 'min', '-': 'min',
  '7': '7', 'dom7': '7',
  'm7': 'm7', 'min7': 'm7', '-7': 'm7',
  'maj7': 'maj7', 'M7': 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', 'ma7': 'maj7',
  'sus4': 'sus4', 'sus': 'sus4',
  'sus2': 'sus2',
  '6': '6',
  'add9': 'add9', 'add2': 'add9',
  '9': '9',
  'm9': 'm9', 'min9': 'm9',
  'maj9': 'maj9', 'M9': 'maj9',
  'm(maj7)': 'mmaj7', 'mmaj7': 'mmaj7', 'mM7': 'mmaj7', 'm(M7)': 'mmaj7',
  '7sus4': '7sus4', '7sus': '7sus4',
  '6/9': '69', '69': '69',
  'add11': 'add11',
};

const DETECTED_TYPE_LABEL = { maj: '', min: 'm' };

function pitchClassOf(name) {
  let i = NOTE_NAMES.indexOf(name);
  if (i === -1) i = NOTE_NAMES_FLAT.indexOf(name);
  if (i === -1) {
    const extra = { 'Cb': 11, 'Fb': 4, 'E#': 5, 'B#': 0 };
    if (name in extra) return extra[name];
  }
  return i;
}

/**
 * Parse a chord symbol like "Am7", "F#", "Bb/D", "Csus4".
 * Returns { root, typeId|null, suffix, bass|null } or null if not a chord.
 * typeId is null for valid-looking chords we have no diagram for (e.g. dim).
 */
function parseChordName(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  // "6/9" is a quality, not a slash chord, so allow it explicitly before the bass part
  const m = s.match(/^([A-G](?:#|b)?)((?:m?6\/9)|[^/\s]*)(?:\/([A-G](?:#|b)?))?$/);
  if (!m) return null;
  const root = pitchClassOf(m[1]);
  if (root < 0) return null;
  const suffix = m[2];
  // Allow a known set of "valid but undiagrammed" qualities so lyrics words
  // like "Am" still parse while "Amazing" does not.
  const known = Object.prototype.hasOwnProperty.call(CHORD_SUFFIXES, suffix);
  const otherOk = /^(dim7?|°7?|o7?|aug|\+|m7b5|ø7?|m6\/9|7b9|7#9|7#5|7b5|11|13|m11|m6|maj13|5|7#11|add4|sus2sus4)$/.test(suffix);
  if (!known && !otherOk) return null;
  const bass = m[3] ? pitchClassOf(m[3]) : null;
  return { root, typeId: known ? CHORD_SUFFIXES[suffix] : null, suffix, bass };
}

/** Choose sharps or flats for a target key root (0–11, or null). */
function useFlatsFor(keyRoot, keyMode) {
  if (keyRoot == null) return false;
  // Minor keys spell like their relative major.
  const rel = keyMode === 'minor' ? (keyRoot + 3) % 12 : keyRoot;
  return FLAT_KEYS.has(rel);
}

function spellPc(pc, flats) {
  const n = ((pc % 12) + 12) % 12;
  return flats ? NOTE_NAMES_FLAT[n] : NOTE_NAMES[n];
}

/** Display a { root, typeId, suffix, bass } chord with chosen spelling. */
function formatChord(ch, flats) {
  if (!ch) return '';
  let s = spellPc(ch.root, flats);
  if (ch.suffix !== undefined) s += ch.suffix;
  else s += DETECTED_TYPE_LABEL[ch.typeId] ?? (CHORD_TYPES.find(t => t.id === ch.typeId)?.label || '');
  if (ch.bass != null) s += '/' + spellPc(ch.bass, flats);
  return s;
}

function transposeChord(ch, semis) {
  if (!ch) return ch;
  const t = (x) => (x == null ? x : (((x + semis) % 12) + 12) % 12);
  return Object.assign({}, ch, { root: t(ch.root), bass: t(ch.bass) });
}

/** Transpose a chord symbol string. Non-chords are returned unchanged. */
function transposeChordName(name, semis, flats) {
  const ch = parseChordName(name);
  if (!ch) return name;
  return formatChord(transposeChord(ch, semis), flats);
}

// ── Voicings ────────────────────────────────────────────────

/** Rough playability cost for a 4-string voicing. Lower is easier. */
function voicingDifficulty(frets) {
  const pressed = frets.filter(f => f > 0);
  if (pressed.length === 0) return 0;
  const lo = Math.min(...pressed), hi = Math.max(...pressed);
  const opens = frets.length - pressed.length;
  // Count distinct fingers needed: a shared lowest fret across ≥2 strings is a barre
  const atLo = pressed.filter(f => f === lo).length;
  const fingers = atLo >= 2 && pressed.length > 3 ? pressed.length - atLo + 1 : pressed.length;
  return lo * 1.2 + (hi - lo) * 1.5 + fingers * 0.8 - opens * 0.3 + (fingers > 4 ? 10 : 0);
}

/**
 * Pick the easiest voicings for a chord in the current tuning.
 * Returns up to `limit` voicings: { frets, notes } where `notes` are the
 * sounding pitch classes in the current tuning.
 */
function easiestVoicings(root, typeId, limit) {
  if (typeId == null) return [];
  const bari = typeof isBaritone === 'function' && isBaritone();
  const lookupRoot = bari ? (root + BARI_OFFSET) % 12 : root;
  const vs = getVoicings(lookupRoot).filter(v => v.type === typeId);
  return vs
    .map(v => ({
      frets: v.frets,
      notes: bari ? v.notes.map(n => (n - BARI_OFFSET + 12) % 12) : v.notes,
      cost: voicingDifficulty(v.frets),
    }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, limit || 3);
}

/**
 * For each transposition in [minSemis, maxSemis] (default -6..+5), sum the easiest-voicing cost of each
 * distinct chord. Returns the list sorted easiest first:
 * [{ semis, cost }]
 */
function rankTranspositions(chords, minSemis, maxSemis) {
  const lo = minSemis == null ? -6 : minSemis;
  const hi = maxSemis == null ? 5 : maxSemis;
  const distinct = new Map();
  for (const c of chords) {
    if (!c || c.root == null || c.typeId == null) continue;
    distinct.set(c.root + ':' + c.typeId, c);
  }
  const out = [];
  for (let semis = lo; semis <= hi; semis++) {
    let cost = 0;
    for (const c of distinct.values()) {
      const best = easiestVoicings((c.root + semis + 12) % 12, c.typeId, 1)[0];
      cost += best ? best.cost : 25;
    }
    out.push({ semis, cost: Math.round(cost * 10) / 10 });
  }
  return out.sort((a, b) => a.cost - b.cost || Math.abs(a.semis) - Math.abs(b.semis));
}

// ── Lyrics (LRC) ────────────────────────────────────────────

/**
 * Parse LRC text into [{ time, text }] sorted by time.
 * Lines without timestamps are returned with time = null (plain lyrics).
 */
function parseLrc(text) {
  const out = [];
  let offset = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (off) { offset = parseInt(off[1], 10) / 1000; continue; }
    if (/^\[(ar|ti|al|by|length|re|ve|au|#):/i.test(raw)) continue;
    const stamps = [];
    let rest = raw;
    let m;
    while ((m = rest.match(/^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/))) {
      const secs = parseFloat(m[2].replace(':', '.'));
      stamps.push(parseInt(m[1], 10) * 60 + secs);
      rest = rest.slice(m[0].length);
    }
    const lyric = rest.replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim(); // strip word-level tags
    if (stamps.length === 0) out.push({ time: null, text: raw.trim() });
    else for (const t of stamps) out.push({ time: Math.max(0, t - offset), text: lyric });
  }
  const timed = out.filter(l => l.time !== null);
  if (timed.length) return timed.sort((a, b) => a.time - b.time);
  // Plain lyrics: drop leading/trailing blank lines
  while (out.length && !out[0].text) out.shift();
  while (out.length && !out[out.length - 1].text) out.pop();
  return out;
}

/**
 * Attach chord changes to synced lyric lines.
 * segments: [{ start, end, label }] (already transposed/labelled)
 * Returns [{ time, end, text, chords: [{ pos, label, start }] }] where pos is
 * a character index into text (chords placed proportionally by time).
 * Chord changes before the first lyric line become an instrumental line.
 */
function alignChordsToLyrics(lines, segments, duration) {
  const timed = lines.filter(l => l.time != null);
  if (!timed.length) return [];
  const rows = [];
  const firstT = timed[0].time;
  const intro = segments.filter(s => s.start < firstT && s.label);
  if (intro.length) rows.push({ time: 0, end: firstT, text: '', chords: intro.map((s, i) => ({ pos: i * 6, label: s.label, start: s.start })) });

  timed.forEach((line, i) => {
    const end = i + 1 < timed.length ? timed[i + 1].time : (duration || line.time + 8);
    const span = Math.max(0.001, end - line.time);
    const len = Math.max(line.text.length, 1);
    const chords = [];
    // The chord already sounding when the line starts goes at position 0
    const sounding = segments.find(s => s.start <= line.time && s.end > line.time);
    if (sounding && sounding.label && !segments.some(s => s.start === line.time && s !== sounding)) {
      chords.push({ pos: 0, label: sounding.label, start: sounding.start, carried: sounding.start < line.time });
    }
    for (const s of segments) {
      if (!s.label || s.start < line.time || s.start >= end) continue;
      if (chords.length && chords[0].start === s.start) continue;
      let pos = Math.round(((s.start - line.time) / span) * len);
      // Snap to the start of the word under the position
      while (pos > 0 && pos < line.text.length && line.text[pos - 1] !== ' ') pos--;
      chords.push({ pos, label: s.label, start: s.start });
    }
    // Keep labels from overlapping: each chord needs label.length + 1 columns
    chords.sort((a, b) => a.pos - b.pos);
    for (let k = 1; k < chords.length; k++) {
      const min = chords[k - 1].pos + chords[k - 1].label.length + 1;
      if (chords[k].pos < min) chords[k].pos = min;
    }
    rows.push({ time: line.time, end, text: line.text, chords });
  });
  return rows;
}

/** Render a row's chords as a monospace line above the lyric. */
function chordLineFor(row) {
  let s = '';
  for (const c of row.chords) {
    if (s.length < c.pos) s += ' '.repeat(c.pos - s.length);
    s += c.label + ' ';
  }
  return s.trimEnd();
}

// ── ChordPro ────────────────────────────────────────────────

function toChordPro(meta, rows, segments, plainLines) {
  const out = [];
  if (meta.title) out.push(`{title: ${meta.title}}`);
  if (meta.artist) out.push(`{artist: ${meta.artist}}`);
  if (meta.key) out.push(`{key: ${meta.key}}`);
  if (meta.capo) out.push(`{capo: ${meta.capo}}`);
  if (meta.tuning) out.push(`{comment: Tuning ${meta.tuning}}`);
  out.push('');
  if (rows && rows.length) {
    for (const row of rows) {
      let text = row.text;
      // Insert from the end so earlier positions stay valid
      // Insert right-to-left; for chords sharing a position, insert the later
      // one first so [C][G] keeps its original order.
      const cs = row.chords.map((c, i) => ({ c, i })).sort((a, b) => b.c.pos - a.c.pos || b.i - a.i).map(x => x.c);
      for (const c of cs) {
        const p = Math.min(c.pos, text.length);
        const pad = c.pos > text.length ? ' '.repeat(c.pos - text.length) : '';
        text = text.slice(0, p) + pad + `[${c.label}]` + text.slice(p);
      }
      out.push(text);
    }
  } else {
    // No synced lyrics: emit the progression, four chords per line
    const labels = segments.filter(s => s.label).map(s => `[${s.label}]`);
    for (let i = 0; i < labels.length; i += 4) out.push(labels.slice(i, i + 4).join(' '));
    if (plainLines && plainLines.length) {
      out.push('', '{comment: Lyrics (not synced to the chords)}');
      out.push(...plainLines);
    }
  }
  return out.join('\n') + '\n';
}

/** Is every whitespace-separated token on this line a chord (or bar mark)? */
function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(t => !/^[|:\-x\d]+$/.test(t) && !/^\(.*\)$/.test(t));
  return toks.length > 0 && toks.every(t => parseChordName(t) !== null);
}

/**
 * Parse ChordPro ("[C]Hello [G]world") or chords-over-lyrics text into
 * [{ text, chords: [{ pos, name }] }] plus metadata.
 */
function parseChordSheet(text) {
  const meta = {};
  const lines = String(text || '').replace(/\t/g, '    ').split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dir = line.match(/^\s*\{\s*(\w+)\s*:?\s*(.*?)\s*\}\s*$/);
    if (dir) {
      const k = dir[1].toLowerCase();
      if (k === 't' || k === 'title') meta.title = dir[2];
      else if (k === 'st' || k === 'subtitle' || k === 'artist') meta.artist = dir[2];
      else if (k === 'key') meta.key = dir[2];
      else if (k === 'capo') meta.capo = dir[2];
      continue;
    }
    if (/\[[^\]]+\]/.test(line)) {
      // ChordPro inline
      let plain = '';
      const chords = [];
      const re = /\[([^\]]+)\]/g;
      let last = 0, m;
      while ((m = re.exec(line))) {
        plain += line.slice(last, m.index);
        chords.push({ pos: plain.length, name: m[1].trim() });
        last = m.index + m[0].length;
      }
      plain += line.slice(last);
      rows.push({ text: plain, chords });
      continue;
    }
    if (line.trim() && isChordLine(line)) {
      const chords = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(line))) if (parseChordName(m[0])) chords.push({ pos: m.index, name: m[0] });
      const next = lines[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next) && !/^\s*\{/.test(next) && !/\[[^\]]+\]/.test(next)) {
        rows.push({ text: next, chords });
        i++;
      } else {
        rows.push({ text: '', chords });
      }
      continue;
    }
    rows.push({ text: line, chords: [] });
  }
  return { meta, rows };
}

const MINORISH = new Set(['min', 'm7', 'm9', 'mmaj7']);

/** Minor-quality chord? Also covers undiagrammed spellings like m6, m11, m7b5. */
function isMinorChord(c) {
  if (!c) return false;
  if (MINORISH.has(c.typeId)) return true;
  return typeof c.suffix === 'string' && /^(m(?!aj)|min|-)/.test(c.suffix);
}

/**
 * Guess the key of a chord list: the major key whose diatonic triads
 * (I ii iii IV V vi) cover the most chords, with a bonus when the song
 * starts or ends on its tonic. Reports the relative minor when the song
 * starts or ends on vi instead. Returns { root, mode } or null.
 */
function guessKeyFromChords(chords) {
  const valid = chords.filter(c => c && c.root != null);
  if (!valid.length) return null;
  const majDeg = [[0, false], [2, true], [4, true], [5, false], [7, false], [9, true]];
  const first = valid[0], last = valid[valid.length - 1];
  const isTonic = (c, k) => c.root === k && !isMinorChord(c);
  const isRelMinor = (c, k) => c.root === (k + 9) % 12 && isMinorChord(c);
  let best = 0, bestScore = -1;
  for (let k = 0; k < 12; k++) {
    let score = 0;
    for (const c of valid) {
      if (majDeg.some(([d, minor]) => (k + d) % 12 === c.root && minor === isMinorChord(c))) score += 1;
    }
    for (const c of [first, last]) if (isTonic(c, k) || isRelMinor(c, k)) score += 1.5;
    if (score > bestScore) { bestScore = score; best = k; }
  }
  const minorEnds = [first, last].filter(c => isRelMinor(c, best)).length;
  const majorEnds = [first, last].filter(c => isTonic(c, best)).length;
  if (minorEnds > majorEnds) return { root: (best + 9) % 12, mode: 'minor' };
  return { root: best, mode: 'major' };
}

/** Parse "Artist - Title.mp3" style filenames. */
function guessMetaFromFilename(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\d+[\s.\-]+/, '').trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: '', title: base };
}

function formatTime(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseChordName, formatChord, transposeChord, transposeChordName, useFlatsFor,
    voicingDifficulty, easiestVoicings, rankTranspositions, parseLrc,
    alignChordsToLyrics, chordLineFor, toChordPro, isChordLine, parseChordSheet,
    guessKeyFromChords, isMinorChord, guessMetaFromFilename, formatTime,
  };
}
