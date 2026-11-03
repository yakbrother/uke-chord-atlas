const test = require('node:test');
const assert = require('node:assert/strict');
const { loadUkeEngine } = require('./helpers/load-uke-engine');
const { toPlain } = require('./helpers/load-resonator-engine');

// ── Synthetic audio ─────────────────────────────────────────

const SR = 22050;

function synthChord(midis, secs, detuneSemis = 0) {
  const n = Math.floor(SR * secs);
  const out = new Float32Array(n);
  for (const m of midis) {
    for (let h = 1; h <= 4; h++) {
      const f = 440 * Math.pow(2, (m - 69 + detuneSemis) / 12) * h;
      const a = 0.15 / h;
      for (let i = 0; i < n; i++) out[i] += a * Math.sin(2 * Math.PI * f * i / SR) * Math.exp(-(i / SR) * 1.5);
    }
  }
  return out;
}

function concat(parts) {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const C = [48, 60, 64, 67], G = [43, 55, 59, 62], Am = [45, 57, 60, 64], F = [41, 53, 57, 60];

function detectedLabels(ctx, segs) {
  return toPlain(segs.map(s => s.type === 'N' ? 'N' : ctx.formatChord({ root: s.root, typeId: s.type, suffix: s.type === 'min' ? 'm' : '' }, false)));
}

test('detects a I–V–vi–IV progression from synthesized audio', () => {
  const ctx = loadUkeEngine();
  const audio = concat([C, G, Am, F, C, G, Am, F].map(c => synthChord(c, 2)));
  const res = ctx.detectChords([audio], SR);
  assert.deepEqual(detectedLabels(ctx, res.segments), ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
  assert.deepEqual(toPlain({ root: res.key.root, mode: res.key.mode }), { root: 0, mode: 'major' });
  // Boundaries land within ~0.4 s of the true 2 s grid
  res.segments.slice(1).forEach((s, i) => assert.ok(Math.abs(s.start - 2 * (i + 1)) < 0.4, `boundary ${s.start}`));
});

test('compensates for a recording that is tuned ~35 cents sharp', () => {
  const ctx = loadUkeEngine();
  const audio = concat([Am, F, C, G].map(c => synthChord(c, 2, 0.35)));
  const res = ctx.detectChords([audio], SR);
  assert.deepEqual(detectedLabels(ctx, res.segments), ['Am', 'F', 'C', 'G']);
  assert.ok(res.tuningCents > 20 && res.tuningCents < 50, `tuning ${res.tuningCents}`);
});

test('silence is reported as no-chord', () => {
  const ctx = loadUkeEngine();
  const audio = concat([new Float32Array(SR * 2), synthChord(G, 3)]);
  const res = ctx.detectChords([audio], SR);
  // Every segment that overlaps the 2 s of leading silence must be no-chord
  // (allowing for the analysis window straddling the boundary).
  for (const seg of res.segments.filter(x => x.start < 1.6)) assert.equal(seg.type, 'N', `chord at ${seg.start}s`);
  assert.ok(res.segments[0].end > 1.6 && res.segments[0].end < 2.5, `silence ends at ${res.segments[0].end}`);
  const last = res.segments[res.segments.length - 1];
  assert.equal(last.type, 'maj');
  assert.equal(last.root, 7);
});

test('a completely silent recording reports no key', () => {
  const ctx = loadUkeEngine();
  const res = ctx.detectChords([new Float32Array(SR * 3)], SR);
  assert.equal(res.key, null);
  assert.ok(res.segments.every(x => x.type === 'N'));
});

test('7th detection finds a dominant 7th when enabled', () => {
  const ctx = loadUkeEngine();
  const G7 = [43, 55, 59, 62, 65];
  const res = ctx.detectChords([synthChord(G7, 3)], SR, { include7ths: true });
  assert.equal(res.segments.length, 1);
  assert.equal(res.segments[0].root, 7);
  assert.equal(res.segments[0].type, '7');
});

// ── Chord names & transposition ────────────────────────────

test('parses common chord spellings', () => {
  const ctx = loadUkeEngine();
  const p = s => toPlain(ctx.parseChordName(s));
  assert.equal(p('Am').typeId, 'min');
  assert.equal(p('Bbmaj7').root, 10);
  assert.equal(p('Bbmaj7').typeId, 'maj7');
  assert.equal(p('F#m7').root, 6);
  assert.equal(p('C/E').bass, 4);
  assert.equal(p('Bdim').typeId, null); // valid chord, no diagram
  assert.equal(p('C6/9').typeId, '69');
  assert.equal(p('C6/9').bass, null);
  assert.equal(p('C6/9/E').bass, 4);
  assert.equal(p('C6/A').typeId, '6');
  assert.equal(p('C6/A').bass, 9);
  assert.equal(ctx.transposeChordName('C6/9', 2, false), 'D6/9');
  assert.equal(ctx.parseChordName('Amazing'), null);
  assert.equal(ctx.parseChordName('Hello'), null);
});

test('transposes chord names with key-appropriate spelling', () => {
  const ctx = loadUkeEngine();
  assert.equal(ctx.transposeChordName('G', 2, false), 'A');
  assert.equal(ctx.transposeChordName('Am7', -2, false), 'Gm7');
  assert.equal(ctx.transposeChordName('C/E', 3, true), 'Eb/G');
  assert.equal(ctx.transposeChordName('F#m', 1, false), 'Gm');
  assert.equal(ctx.transposeChordName('E', 1, true), 'F');
  assert.equal(ctx.useFlatsFor(5, 'major'), true);   // F major
  assert.equal(ctx.useFlatsFor(2, 'minor'), true);   // D minor → F major
  assert.equal(ctx.useFlatsFor(7, 'major'), false);  // G major
});

// ── Baritone voicings ──────────────────────────────────────

test('baritone easiest G is the standard-uke C shape (0-0-0-3)', () => {
  const ctx = loadUkeEngine();
  ctx.setTuning('baritone');
  const [best] = toPlain(ctx.easiestVoicings(7, 'maj', 1));
  assert.deepEqual(best.frets, [0, 0, 0, 3]);
  assert.deepEqual(best.notes, [2, 7, 11, 7]); // D G B G
});

test('baritone easiest C, D and Em match standard chart shapes', () => {
  const ctx = loadUkeEngine();
  ctx.setTuning('baritone');
  // Baritone C = standard-uke F shape (2-0-1-0)
  assert.deepEqual(toPlain(ctx.easiestVoicings(0, 'maj', 1)[0].frets), [2, 0, 1, 0]);
  // Baritone D = standard-uke G shape (0-2-3-2)
  assert.deepEqual(toPlain(ctx.easiestVoicings(2, 'maj', 1)[0].frets), [0, 2, 3, 2]);
  // Baritone Em = standard-uke Am shape (2-0-0-0)
  assert.deepEqual(toPlain(ctx.easiestVoicings(4, 'min', 1)[0].frets), [2, 0, 0, 0]);
});

test('easiest-key ranking moves an Ab song to G on baritone', () => {
  const ctx = loadUkeEngine();
  ctx.setTuning('baritone');
  const chords = ['Ab', 'Eb', 'Fm', 'Db'].map(ctx.parseChordName);
  const ranked = toPlain(ctx.rankTranspositions(chords));
  assert.equal(ranked[0].semis, -1);
  const capoRanked = toPlain(ctx.rankTranspositions(chords, -7, 0));
  assert.ok(capoRanked.every(r => r.semis <= 0 && r.semis >= -7));
});

// ── Lyrics ─────────────────────────────────────────────────

test('parses LRC including multi-stamp lines and offsets', () => {
  const ctx = loadUkeEngine();
  const lines = toPlain(ctx.parseLrc('[ti:Song]\n[offset:+500]\n[00:10.00][00:40.00]Chorus line\n[00:05.50]First line\n'));
  assert.deepEqual(lines, [
    { time: 5, text: 'First line' },
    { time: 9.5, text: 'Chorus line' },
    { time: 39.5, text: 'Chorus line' },
  ]);
  const plain = toPlain(ctx.parseLrc('\nJust words\nMore words\n\n'));
  assert.deepEqual(plain.map(l => l.time), [null, null]);
});

test('aligns chord changes above synced lyric lines', () => {
  const ctx = loadUkeEngine();
  const lines = [{ time: 4, text: 'Somewhere over the rainbow' }, { time: 8, text: 'Way up high' }];
  const segs = [
    { start: 0, end: 4, label: 'C' },
    { start: 4, end: 6, label: 'C' },
    { start: 6, end: 8, label: 'Em' },
    { start: 8, end: 12, label: 'F' },
  ];
  const rows = toPlain(ctx.alignChordsToLyrics(lines, segs, 12));
  assert.equal(rows[0].text, ''); // instrumental intro row
  assert.equal(rows[0].chords[0].label, 'C');
  assert.deepEqual(rows[1].chords.map(c => c.label), ['C', 'Em']);
  const emPos = rows[1].chords[1].pos;
  assert.ok(emPos > 5 && emPos < 20, `pos ${emPos}`);
  assert.equal(rows[1].text[emPos - 1], ' '); // snapped to a word start
  assert.deepEqual(rows[2].chords.map(c => c.label), ['F']);
});

// ── Chord sheets ───────────────────────────────────────────

test('parses ChordPro and chords-over-lyrics, and writes ChordPro', () => {
  const ctx = loadUkeEngine();
  const cp = toPlain(ctx.parseChordSheet('{title: Rainbow}\n{key: C}\n[C]Somewhere [Em]over'));
  assert.equal(cp.meta.title, 'Rainbow');
  assert.deepEqual(cp.rows[0], { text: 'Somewhere over', chords: [{ pos: 0, name: 'C' }, { pos: 10, name: 'Em' }] });

  const col = toPlain(ctx.parseChordSheet('C         Em\nSomewhere over the rainbow\nAm  F\n'));
  assert.equal(col.rows[0].text, 'Somewhere over the rainbow');
  assert.deepEqual(col.rows[0].chords, [{ pos: 0, name: 'C' }, { pos: 10, name: 'Em' }]);
  assert.equal(col.rows[1].text, '');
  assert.deepEqual(col.rows[1].chords.map(c => c.name), ['Am', 'F']);

  const out = ctx.toChordPro({ title: 'Rainbow', key: 'C' }, [{ text: 'Somewhere over', chords: [{ pos: 0, label: 'C' }, { pos: 10, label: 'Em' }] }], []);
  assert.match(out, /\{title: Rainbow\}/);
  assert.match(out, /\[C\]Somewhere \[Em\]over/);

  // Chords sharing a position keep their order through a round trip
  const twin = toPlain(ctx.parseChordSheet('[C][G]word'));
  const twinOut = ctx.toChordPro({}, twin.rows.map(r => ({ text: r.text, chords: r.chords.map(c => ({ pos: c.pos, label: c.name })) })), []);
  assert.match(twinOut, /\[C\]\[G\]word/);

  // No synced rows: progression, then the plain lyrics
  const plain = ctx.toChordPro({}, null, [{ label: 'G' }, { label: 'C' }], ['First line', 'Second line']);
  assert.match(plain, /\[G\] \[C\]/);
  assert.match(plain, /First line\nSecond line/);
});

test('a lyric line with chord-like words is not a chord line', () => {
  const ctx = loadUkeEngine();
  assert.equal(ctx.isChordLine('A Bm G'), true);
  assert.equal(ctx.isChordLine('A day in the life'), false);
});

test('guesses keys from chord lists', () => {
  const ctx = loadUkeEngine();
  const k = names => toPlain(ctx.guessKeyFromChords(names.map(ctx.parseChordName)));
  assert.deepEqual(k(['G', 'C', 'D', 'G']), { root: 7, mode: 'major' });
  assert.deepEqual(k(['Am', 'F', 'C', 'G', 'Am']), { root: 9, mode: 'minor' });
  // m6/m11 have no diagram type but still count as minor
  assert.equal(ctx.isMinorChord(ctx.parseChordName('Am6')), true);
  assert.equal(ctx.isMinorChord(ctx.parseChordName('Cmaj7')), false);
  assert.deepEqual(k(['Am6', 'F', 'C', 'G', 'Am6']), { root: 9, mode: 'minor' });
});

test('guesses artist and title from file names', () => {
  const ctx = loadUkeEngine();
  assert.deepEqual(toPlain(ctx.guessMetaFromFilename('03 - Israel Kamakawiwoole - Over the Rainbow.mp3')), { artist: 'Israel Kamakawiwoole', title: 'Over the Rainbow' });
  assert.deepEqual(toPlain(ctx.guessMetaFromFilename('song.wav')), { artist: '', title: 'song' });
});
