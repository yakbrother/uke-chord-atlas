// ═══════════════════════════════════════════════════════════
// SONG LAB PAGE — load audio or a chord chart, detect chords,
// transpose, show diagrams for the current tuning, sync lyrics.
// Depends on: music-theory.js, diagram.js, theme.js, tuning.js,
// chord-detect.js, song-utils.js
// ═══════════════════════════════════════════════════════════

const LRCLIB = 'https://lrclib.net/api';
const DETECTED_SUFFIX = { maj: '', min: 'm', '7': '7', m7: 'm7', maj7: 'maj7' };
const SMOOTHING_LEVELS = [0.8, 0.88, 0.92, 0.96, 0.985];

const song = {
  source: null,          // 'audio' | 'sheet'
  file: null,
  audioUrl: null,
  pcm: null,             // { channels, sampleRate } kept for re-analysis
  duration: 0,
  segments: [],          // [{ start, end, chord|null }] chord = parsed chord
  sheetRows: [],         // [{ text, chords: [{ pos, chord }] }]
  lyrics: [],            // [{ time|null, text }]
  origKey: null,         // { root, mode }
  capo: 0,               // capo written on a pasted chart
  tuningCents: 0,
  transpose: 0,
  preferFlats: null,     // null = automatic
  voicingPick: {},       // chord label → voicing index
  editing: false,
  lyricOffset: 0,
};

const $ = (id) => document.getElementById(id);

/**
 * Build a DOM element. Text always goes in via textContent and attributes via
 * setAttribute, so song data (lyrics, chord names) is never parsed as HTML.
 */
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const svgParser = new DOMParser();

/** Parse the trusted SVG markup from chordSVG() (numbers + fixed note names) into a node. */
function svgNode(markup) {
  const doc = svgParser.parseFromString(markup, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

let infoTimer = null;
function toast(msg) {
  const el = $('info-strip');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setStatus(msg, isError) {
  const el = $('status');
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

let progressHideTimer = null;

function setProgress(frac) {
  clearTimeout(progressHideTimer); // a newer operation owns the bar now
  const wrap = $('progress');
  if (frac == null) { wrap.hidden = true; return; }
  wrap.hidden = false;
  $('progress-bar').style.width = Math.round(frac * 100) + '%';
}

const nextFrame = () => new Promise(r => setTimeout(r, 30));

// ── Key / spelling helpers ──────────────────────────────────

function playKey() {
  if (!song.origKey) return null;
  return { root: (song.origKey.root + song.transpose + 120) % 12, mode: song.origKey.mode };
}

function flats() {
  if (song.preferFlats !== null) return song.preferFlats;
  const k = playKey();
  return k ? useFlatsFor(k.root, k.mode) : false;
}

function keyLabel(k, transposeBy) {
  if (!k) return '–';
  const root = (k.root + (transposeBy || 0) + 120) % 12;
  const f = song.preferFlats !== null ? song.preferFlats : useFlatsFor(root, k.mode);
  return (f ? NOTE_NAMES_FLAT : NOTE_NAMES)[root] + (k.mode === 'minor' ? ' minor' : ' major');
}

/** Transposed display label for a parsed chord (or '' for no-chord). */
function labelFor(chord) {
  if (!chord) return '';
  return formatChord(transposeChord(chord, song.transpose), flats());
}

function allChords() {
  if (song.source === 'audio') return song.segments.map(s => s.chord).filter(Boolean);
  return song.sheetRows.flatMap(r => r.chords.map(c => c.chord)).filter(Boolean);
}

// ── Diagrams ────────────────────────────────────────────────

function voicingsFor(chord) {
  if (!chord) return [];
  const t = transposeChord(chord, song.transpose);
  return easiestVoicings(t.root, t.typeId, 6);
}

function diagramNode(chord) {
  if (!chord) return el('div', { class: 'no-diagram', text: '–' });
  const label = labelFor(chord);
  const vs = voicingsFor(chord);
  if (!vs.length) {
    return el('div', { class: 'no-diagram', title: 'No diagram for this chord type' },
      label, el('br'), el('small', { text: 'no diagram' }));
  }
  const idx = (song.voicingPick[label] || 0) % vs.length;
  const v = vs[idx];
  const root = transposeChord(chord, song.transpose).root;
  const names = v.notes.map(n => noteName(n, flats() ? 5 : 0));
  return svgNode(chordSVG(v.frets, names, root, isMixed(v.frets)));
}

// ── Rendering ───────────────────────────────────────────────

function renderAll() {
  const hasSong = song.source && (song.segments.length || song.sheetRows.length);
  $('controls').hidden = !hasSong;
  $('palette-panel').hidden = !hasSong;
  $('sheet-panel').hidden = !hasSong && !song.lyrics.length;
  $('player-panel').hidden = song.source !== 'audio';
  $('edit-toggle').hidden = song.source !== 'audio';
  if (!hasSong && !song.lyrics.length) return;
  renderControls();
  renderPalette();
  renderTimeline();
  renderSheet();
  lastSegIdx = -2; lastRowIdx = -2;
  updatePlayhead(true);
}

function renderControls() {
  $('orig-key').textContent = keyLabel(song.origKey, 0);
  $('play-key').textContent = keyLabel(song.origKey, song.transpose);
  const t = song.transpose;
  $('tr-value').textContent = (t > 0 ? '+' : '') + t;
  $('opt-flats').checked = flats();
  let note = '';
  if (song.source === 'audio') {
    if (t < 0 && t >= -9) note = `Capo on fret ${-t}: these shapes will sound in the original key, so you can play along with the recording.`;
    else if (t > 0) note = `These shapes sound ${t} semitone${t > 1 ? 's' : ''} higher than the recording. To play along, use “Easiest with a capo” or transpose down.`;
    else if (t < -9) note = 'This is lower than the recording; a capo that high is impractical.';
    if (song.tuningCents && Math.abs(song.tuningCents) >= 15) {
      note += ` The recording is about ${Math.abs(song.tuningCents)} cents ${song.tuningCents > 0 ? 'sharp' : 'flat'}; tune your strings to match.`;
    }
  } else {
    if (song.capo) note = `This chart is written for capo ${song.capo}. `;
    if (t < 0) note += `Or put a capo on fret ${-t} to keep the original key.`;
  }
  $('capo-note').textContent = note.trim();
}

function renderPalette() {
  const seen = new Map();
  for (const c of allChords()) {
    const l = labelFor(c);
    if (l && !seen.has(l)) seen.set(l, c);
  }
  $('palette').replaceChildren(...[...seen.entries()].map(([label, c]) => {
    const n = voicingsFor(c).length;
    return el('button', {
      type: 'button', class: 'chord-card palette-card', 'data-label': label,
      'aria-label': label + (n > 1 ? ', tap for another voicing' : ''),
    },
    el('span', { class: 'pc-name', text: label }),
    diagramNode(c),
    n > 1 ? el('span', { class: 'pc-count', text: `${(song.voicingPick[label] || 0) % n + 1}/${n}` }) : null);
  }));
}

function renderTimeline() {
  const tl = $('timeline');
  if (song.source !== 'audio') { tl.hidden = true; tl.replaceChildren(); return; }
  tl.hidden = false;
  tl.classList.toggle('editing', song.editing);
  tl.replaceChildren(...song.segments.map((s, i) => {
    const label = labelFor(s.chord) || 'N.C.';
    const time = el('span', { class: 'seg-time', text: formatTime(s.start) });
    if (song.editing) {
      const input = el('input', {
        type: 'text', class: 'seg-input', 'data-i': i, placeholder: 'N.C.',
        'aria-label': `Chord at ${formatTime(s.start)}`, size: 5,
      });
      input.value = s.chord ? label : '';
      return el('span', { class: 'seg seg-edit', 'data-i': i }, time, input);
    }
    return el('button', { type: 'button', class: 'seg' + (s.chord ? '' : ' nc'), 'data-i': i, 'data-start': s.start },
      time, el('span', { class: 'seg-name', text: label }));
  }));
}

function currentRows() {
  if (song.source === 'sheet') {
    return song.sheetRows.map(r => ({
      time: null, text: r.text,
      chords: r.chords.map(c => ({ pos: c.pos, label: c.chord ? labelFor(c.chord) : c.name })),
    }));
  }
  const timed = song.lyrics.some(l => l.time != null);
  if (song.source === 'audio' && timed) {
    const lines = song.lyrics.map(l => ({ time: l.time + song.lyricOffset, text: l.text }));
    const segs = song.segments.map(s => ({ start: s.start, end: s.end, label: labelFor(s.chord) }));
    return alignChordsToLyrics(lines, segs, song.duration);
  }
  return null;
}

function lyricRow(text) {
  return el('div', { class: 'row' }, el('div', { class: 'row-text', text: text || '\u00a0' }));
}

function renderSheet() {
  const sheet = $('sheet');
  const rows = currentRows();
  if (rows) {
    sheet.replaceChildren(...rows.map((r, i) => {
      const chordLine = chordLineFor(r);
      if (!r.text && !chordLine) return el('div', { class: 'row blank', 'data-row': i });
      const timed = r.time != null;
      return el('div', {
        class: 'row', 'data-row': i,
        'data-time': timed ? r.time : null, tabindex: timed ? 0 : null,
        role: timed ? 'button' : null, 'aria-label': timed ? `Jump to ${formatTime(r.time)}` : null,
      },
      chordLine ? el('div', { class: 'row-chords', text: chordLine }) : null,
      el('div', { class: 'row-text', text: r.text || '\u00a0' }));
    }));
    return;
  }
  if (song.lyrics.length) {
    sheet.replaceChildren(
      progressionNode(),
      el('p', { class: 'hint', text: "These lyrics have no timestamps, so chords can't be placed on them. Follow the timeline above." }),
      ...song.lyrics.map(l => lyricRow(l.text)));
    return;
  }
  if (song.source === 'audio') {
    sheet.replaceChildren(progressionNode(),
      el('p', { class: 'hint', text: 'Add lyrics (Find synced lyrics, or paste them) to see chords above the words.' }));
  } else {
    sheet.replaceChildren();
  }
}

/** Printable progression for audio songs without synced lyrics (the timeline is screen-only). */
function progressionNode() {
  const labels = song.segments.map(s => labelFor(s.chord)).filter(Boolean);
  const lines = [];
  for (let i = 0; i < labels.length; i += 8) lines.push(labels.slice(i, i + 8).join('  '));
  return el('div', { class: 'print-progression' }, lines.map(l => el('div', { class: 'row-chords', text: l })));
}

// ── Playback sync ───────────────────────────────────────────

let lastSegIdx = -2, lastRowIdx = -2, rafId = null;

function segIndexAt(t) {
  const segs = song.segments;
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

function updatePlayhead(force) {
  if (song.source !== 'audio') return;
  const t = $('audio').currentTime || 0;
  const si = segIndexAt(t);
  if (si !== lastSegIdx || force) {
    lastSegIdx = si;
    const cur = song.segments[si];
    let nextIdx = si + 1;
    while (nextIdx < song.segments.length && !song.segments[nextIdx].chord) nextIdx++;
    const nxt = song.segments[nextIdx];
    $('now-name').textContent = cur && cur.chord ? labelFor(cur.chord) : 'N.C.';
    $('now-diagram').replaceChildren(diagramNode(cur && cur.chord));
    $('next-name').textContent = nxt ? labelFor(nxt.chord) : '–';
    $('next-diagram').replaceChildren(diagramNode(nxt && nxt.chord));
    document.querySelectorAll('#timeline .seg.active').forEach(el => el.classList.remove('active'));
    const segEl = document.querySelector(`#timeline .seg[data-i="${si}"]`);
    if (segEl) {
      segEl.classList.add('active');
      if (!$('audio').paused) segEl.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }
  const rows = document.querySelectorAll('#sheet .row[data-time]');
  let ri = -1;
  rows.forEach((el, i) => { if (parseFloat(el.dataset.time) <= t) ri = i; });
  if (ri !== lastRowIdx || force) {
    lastRowIdx = ri;
    rows.forEach((el, i) => el.classList.toggle('active', i === ri));
    if (ri >= 0 && !$('audio').paused) rows[ri].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function tick() {
  updatePlayhead(false);
  rafId = requestAnimationFrame(tick);
}

function seek(t) {
  const a = $('audio');
  a.currentTime = Math.max(0, t);
  updatePlayhead(true);
}

// ── Loading audio ───────────────────────────────────────────

// Each load (audio file or chart) bumps this; async work started for an
// older load checks it and discards its result instead of overwriting
// state for whatever the user has loaded since.
let loadToken = 0;
let lyricsToken = 0;
const MAX_AUDIO_SECONDS = 20 * 60; // keeps decoded PCM to a few hundred MB at most
// Checked before decoding: ~20 min of uncompressed 16-bit stereo WAV is ~210 MB
const MAX_FILE_BYTES = 250 * 1024 * 1024;

function resetLyrics() {
  lyricsToken++; // drop any lookup still in flight for the previous song
  song.lyrics = [];
  song.lyricOffset = 0;
  $('lyrics-offset').value = '0';
  $('lyrics-fetch-btn').disabled = false;
}

/** Duration from the browser's metadata parser (no full decode). NaN if unknown. */
function probeDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement('audio');
    let done = false;
    const finish = (d) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(url);
      resolve(d);
    };
    // iOS may not load metadata for a file it isn't playing; don't stall on it
    const timer = setTimeout(() => finish(NaN), 2000);
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => finish(probe.duration));
    probe.addEventListener('error', () => finish(NaN)); // let decodeAudioData decide
    probe.src = url;
  });
}

/** Drop the current recording: stop playback and free its decoded PCM and URL. */
function releaseAudio() {
  const audio = $('audio');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (song.audioUrl) URL.revokeObjectURL(song.audioUrl);
  song.audioUrl = null;
  song.pcm = null;
  song.file = null;
  song.segments = [];
  song.duration = 0;
  $('reanalyze-btn').hidden = true;
}

async function loadAudioFile(file) {
  if (!file) return;
  const token = ++loadToken;
  const startArtist = $('meta-artist').value, startTitle = $('meta-title').value;
  const startLyricsToken = lyricsToken;
  if (file.size > MAX_FILE_BYTES) {
    setStatus(`That file is ${Math.round(file.size / 1048576)} MB; Song Lab handles files up to ${MAX_FILE_BYTES / 1048576} MB.`, true);
    return;
  }
  // Check the length from the file's metadata before decoding: compressed
  // files can be hours long while still small, and decoding allocates it all.
  setStatus(`Reading “${file.name}”…`);
  const length = await probeDuration(file);
  if (token !== loadToken) return;
  if (Number.isFinite(length) && length > MAX_AUDIO_SECONDS) {
    setStatus(`That recording is ${formatTime(length)} long; Song Lab handles up to ${MAX_AUDIO_SECONDS / 60} minutes.`, true);
    return;
  }

  setStatus(`Decoding “${file.name}”…`);
  setProgress(0.1);
  await nextFrame();
  let pcm, ctx = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    if (buf.duration > MAX_AUDIO_SECONDS) {
      if (token !== loadToken) return;
      setProgress(null);
      setStatus(`That recording is ${formatTime(buf.duration)} long; Song Lab handles up to ${MAX_AUDIO_SECONDS / 60} minutes.`, true);
      return;
    }
    const channels = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(buf.getChannelData(c));
    pcm = { channels, sampleRate: buf.sampleRate };
  } catch (err) {
    console.error(err);
    if (token !== loadToken) return;
    setProgress(null);
    setStatus('Could not decode that file. Try MP3, M4A, or WAV.', true);
    return; // previous song (audio + analysis) stays as it was
  } finally {
    if (ctx && ctx.close) ctx.close().catch(() => {});
  }
  if (token !== loadToken) return; // a newer file or chart was loaded meanwhile

  // Decode succeeded: now replace the previous song's audio, metadata and lyrics,
  // keeping anything the user typed or pasted while the file was decoding.
  const edited = $('meta-artist').value !== startArtist || $('meta-title').value !== startTitle;
  const pastedMeanwhile = lyricsToken !== startLyricsToken;
  const audio = $('audio');
  audio.pause();
  if (song.audioUrl) URL.revokeObjectURL(song.audioUrl);
  song.audioUrl = URL.createObjectURL(file);
  audio.src = song.audioUrl;
  song.file = file;
  song.pcm = pcm;
  song.duration = 0;
  if (!pastedMeanwhile) resetLyrics();
  if (!edited) {
    const meta = guessMetaFromFilename(file.name);
    $('meta-artist').value = meta.artist;
    $('meta-title').value = meta.title;
  }
  await analyze(token);
}

async function analyze(token) {
  if (token === undefined) token = loadToken;
  if (!song.pcm || token !== loadToken) return;
  const pcm = song.pcm;
  setStatus('Listening for chords…');
  setProgress(0.5);
  await nextFrame();
  if (token !== loadToken || song.pcm !== pcm) return;
  const t0 = performance.now();
  let res;
  try {
    res = detectChords(pcm.channels, pcm.sampleRate, {
      include7ths: $('opt-sevenths').checked,
      selfProb: SMOOTHING_LEVELS[parseInt($('opt-smoothing').value, 10)] || 0.92,
    });
  } catch (err) {
    console.error(err);
    // Don't leave the previous song's chords paired with this recording
    releaseAudio();
    song.source = null;
    setProgress(null);
    setStatus('Chord analysis failed for this recording (it may be too large for this device).', true);
    renderAll();
    return;
  }
  song.source = 'audio';
  song.duration = res.duration;
  song.tuningCents = res.tuningCents;
  song.segments = res.segments.map(s => ({
    start: s.start, end: s.end,
    chord: s.type === 'N' ? null : { root: s.root, typeId: s.type, suffix: DETECTED_SUFFIX[s.type] || '', bass: null },
  }));
  song.origKey = res.key ? { root: res.key.root, mode: res.key.mode } : null;
  song.capo = 0;
  song.transpose = 0;
  song.voicingPick = {};
  song.editing = false;
  $('edit-toggle').setAttribute('aria-pressed', 'false');
  $('edit-toggle').textContent = 'Fix chords';
  setProgress(1);
  const n = song.segments.filter(s => s.chord).length;
  const keyNote = song.origKey ? ` Likely key: ${keyLabel(song.origKey, 0)}.` : '';
  setStatus(`Found ${n} chord changes in ${formatTime(res.duration)} (analysis took ${((performance.now() - t0) / 1000).toFixed(1)} s).${keyNote}`);
  progressHideTimer = setTimeout(() => { $('progress').hidden = true; }, 600);
  $('reanalyze-btn').hidden = false;
  renderAll();
}

// ── Loading a pasted chart ──────────────────────────────────

function loadSheet() {
  const text = $('sheet-input').value;
  const parsed = parseChordSheet(text);
  if (!parsed.rows.some(r => r.chords.length)) {
    setStatus('No chords found. Use [C] ChordPro brackets, or put chord names on their own line above the lyrics.', true);
    return;
  }
  loadToken++; // cancel any audio decode/analysis still running
  releaseAudio();
  setProgress(null);
  resetLyrics();
  song.source = 'sheet';
  song.sheetRows = parsed.rows.map(r => ({ text: r.text, chords: r.chords.map(c => ({ pos: c.pos, name: c.name, chord: parseChordName(c.name) })) }));
  // Trim leading/trailing blank rows
  while (song.sheetRows.length && !song.sheetRows[0].text.trim() && !song.sheetRows[0].chords.length) song.sheetRows.shift();
  while (song.sheetRows.length && !song.sheetRows[song.sheetRows.length - 1].text.trim() && !song.sheetRows[song.sheetRows.length - 1].chords.length) song.sheetRows.pop();
  $('meta-title').value = parsed.meta.title || '';
  $('meta-artist').value = parsed.meta.artist || '';
  let key = null;
  if (parsed.meta.key) {
    const k = parseChordName(parsed.meta.key);
    if (k) key = { root: k.root, mode: isMinorChord(k) ? 'minor' : 'major' };
  }
  song.origKey = key || guessKeyFromChords(allChords());
  const capo = parseInt(parsed.meta.capo, 10);
  song.capo = capo > 0 ? capo : 0;
  song.transpose = 0;
  song.voicingPick = {};
  setStatus(song.capo
    ? `Loaded chart with ${allChords().length} chords (written for capo ${song.capo}).`
    : `Loaded chart with ${allChords().length} chords.`);
  renderAll();
}

// ── Lyrics ──────────────────────────────────────────────────

const LYRICS_TIMEOUT_MS = 10000;

async function lrclibGet(path, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LYRICS_TIMEOUT_MS);
  try {
    const r = await fetch(`${LRCLIB}/${path}?${params}`, { signal: ctrl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`LRCLIB returned HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Lower is better: closeness in duration first, synced lyrics as a tie-breaker. */
function lyricsScore(rec) {
  const d = song.duration && rec.duration ? Math.abs(rec.duration - song.duration) : 0;
  return Math.min(d, 60) + (rec.syncedLyrics ? 0 : 3);
}

// Sends only the artist, title and (for audio) duration typed in the fields
// above, and only when the user presses "Find synced lyrics".
const CHART_HAS_LYRICS = 'A pasted chart carries its own lyrics; edit them in the chart instead.';

async function fetchLyrics() {
  if (song.source === 'sheet') { setStatus(CHART_HAS_LYRICS, true); return; }
  const artist = $('meta-artist').value.trim();
  const title = $('meta-title').value.trim();
  if (!title) { setStatus('Enter a song title (and ideally the artist) to look up lyrics.', true); return; }
  const token = ++lyricsToken;
  const btn = $('lyrics-fetch-btn');
  btn.disabled = true;
  setStatus('Looking up lyrics on LRCLIB…');
  try {
    let rec = null;
    if (artist) {
      const p = new URLSearchParams({ artist_name: artist, track_name: title });
      if (song.duration) p.set('duration', String(Math.round(song.duration)));
      rec = await lrclibGet('get', p);
    }
    if (!rec || (!rec.syncedLyrics && !rec.plainLyrics)) {
      const p = new URLSearchParams({ track_name: title });
      if (artist) p.set('artist_name', artist);
      const list = (await lrclibGet('search', p)) || [];
      // Skip versions whose length is far from this recording (live cuts, edits)
      const usable = (Array.isArray(list) ? list : [])
        .filter(x => x.syncedLyrics || x.plainLyrics)
        .filter(x => !song.duration || !x.duration || Math.abs(x.duration - song.duration) <= 15);
      rec = usable.sort((a, b) => lyricsScore(a) - lyricsScore(b))[0] || null;
    }
    if (token !== lyricsToken) return; // a different song was loaded meanwhile
    if (!rec || (!rec.syncedLyrics && !rec.plainLyrics)) {
      setStatus(`No lyrics found for “${title}”. You can paste them instead.`);
      return;
    }
    song.lyrics = parseLrc(rec.syncedLyrics || rec.plainLyrics);
    const synced = !!rec.syncedLyrics;
    setStatus(`Lyrics loaded: ${rec.artistName || artist} – ${rec.trackName || title}${synced ? ' (synced)' : ' (not synced)'}.`);
    renderAll();
  } catch (err) {
    console.error(err);
    if (token !== lyricsToken) return;
    setStatus(err.name === 'AbortError'
      ? 'LRCLIB did not respond in time. Try again, or paste lyrics instead.'
      : `Lyrics lookup failed (${err.message || 'network error'}). You can paste lyrics instead.`, true);
  } finally {
    if (token === lyricsToken) btn.disabled = false;
  }
}

function applyPastedLyrics() {
  if (song.source === 'sheet') { setStatus(CHART_HAS_LYRICS, true); return; }
  const parsed = parseLrc($('lyrics-input').value);
  if (!parsed.length) { setStatus('No lyrics to use.', true); return; } // keep what's loaded
  lyricsToken++; // a lookup still in flight must not replace the pasted lyrics
  $('lyrics-fetch-btn').disabled = false;
  song.lyrics = parsed;
  const synced = song.lyrics.some(l => l.time != null);
  setStatus(synced ? `Using ${song.lyrics.length} timed lyric lines.` : 'Using plain lyrics (no timestamps).');
  renderAll();
}

// ── Transposition ───────────────────────────────────────────

function setTranspose(t) {
  song.transpose = Math.max(-11, Math.min(11, t));
  song.voicingPick = {};
  renderAll();
}

function pickEasiest(capoOnly) {
  const chords = allChords();
  if (!chords.length) return;
  const ranked = capoOnly ? rankTranspositions(chords, -7, 0) : rankTranspositions(chords);
  const best = ranked[0];
  setTranspose(best.semis);
  const tuningName = isBaritone() ? 'baritone' : (isLowG() ? 'low-G' : 'standard');
  toast(capoOnly
    ? (best.semis === 0 ? 'No capo needed: original key is easiest' : `Capo ${-best.semis}: easiest ${tuningName} shapes`)
    : `Easiest ${tuningName} key: ${keyLabel(song.origKey, best.semis)}`);
}

// ── Chord editing ───────────────────────────────────────────

function commitSegEdit(input) {
  const i = parseInt(input.dataset.i, 10);
  const seg = song.segments[i];
  if (!seg) return;
  const val = input.value.trim();
  if (!val || /^n\.?c\.?$/i.test(val)) { seg.chord = null; }
  else {
    const ch = parseChordName(val);
    if (!ch) { input.classList.add('invalid'); toast(`“${val}” isn't a chord name I know`); return; }
    // The user typed it in the displayed (transposed) key: store it in the original key
    seg.chord = transposeChord(ch, -song.transpose);
  }
  input.classList.remove('invalid');
  // Merge with identical neighbours is skipped on purpose: keeps inputs stable while editing.
  renderPalette();
  renderSheet();
  updatePlayhead(true);
}

// ── Export ──────────────────────────────────────────────────

function exportCapo() {
  return song.source === 'audio'
    ? (song.transpose < 0 ? -song.transpose : null)
    : (song.capo || null);
}

function tuningLabel() {
  return isBaritone() ? 'baritone DGBE' : (isLowG() ? 'low-G gCEA' : 'standard GCEA');
}

function exportFileBase() {
  return ($('meta-title').value.trim() || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'song';
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportChordPro() {
  const rows = currentRows();
  const k = playKey();
  const meta = {
    title: $('meta-title').value.trim(),
    artist: $('meta-artist').value.trim(),
    key: k ? (flats() ? NOTE_NAMES_FLAT : NOTE_NAMES)[k.root] + (k.mode === 'minor' ? 'm' : '') : '',
    capo: exportCapo(),
    tuning: tuningLabel(),
  };
  const segs = song.segments.map(s => ({ start: s.start, end: s.end, label: labelFor(s.chord) }));
  // Untimed lyrics can't carry chords, but they still belong in the file
  const plain = !rows && song.lyrics.length ? song.lyrics.map(l => l.text) : null;
  downloadBlob(new Blob([toChordPro(meta, rows, segs, plain)], { type: 'text/plain' }), exportFileBase() + '.cho');
}

/** Diagrams exactly as shown in the palette (current voicing choice per chord). */
function exportDiagrams() {
  const seen = new Map();
  for (const c of allChords()) {
    const l = labelFor(c);
    if (l && !seen.has(l)) seen.set(l, c);
  }
  const out = [];
  for (const [label, c] of seen) {
    const vs = voicingsFor(c);
    if (!vs.length) continue; // no diagram for this chord type
    const v = vs[(song.voicingPick[label] || 0) % vs.length];
    out.push({
      name: label,
      frets: v.frets,
      notes: v.notes.map(n => noteName(n, flats() ? 5 : 0)),
      stringNames: currentStringNames(),
    });
  }
  return out;
}

function exportPdf() {
  const rows = currentRows();
  let sheet;
  if (rows) {
    sheet = rows.map(r => ({ chordLine: chordLineFor(r), text: r.text }));
  } else {
    // No synced lyrics: the progression, then any plain lyrics
    const labels = song.segments.map(s => labelFor(s.chord)).filter(Boolean);
    sheet = [];
    for (let i = 0; i < labels.length; i += 8) sheet.push({ chordLine: labels.slice(i, i + 8).join('  '), text: '' });
    if (song.lyrics.length) {
      sheet.push({ chordLine: '', text: '' });
      sheet.push(...song.lyrics.map(l => ({ chordLine: '', text: l.text })));
    }
  }
  const k = playKey();
  const capo = exportCapo();
  const details = [];
  if (k) details.push(`Key: ${keyLabel(song.origKey, song.transpose)}`);
  if (capo) details.push(`Capo ${capo}`);
  details.push(`Tuning: ${tuningLabel()}`);
  if (song.transpose) details.push(`Transposed ${song.transpose > 0 ? '+' : ''}${song.transpose} from ${keyLabel(song.origKey, 0)}`);
  const bytes = buildChordSheetPdf({
    title: $('meta-title').value.trim() || 'Untitled song',
    artist: $('meta-artist').value.trim(),
    details,
    diagrams: exportDiagrams(),
    rows: sheet,
    footer: 'Song Lab \u00B7 Uke Chord Atlas',
  });
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), exportFileBase() + '.pdf');
}

// ── Wiring ──────────────────────────────────────────────────

function selectTab(which) {
  const audio = which === 'audio';
  $('tab-audio').setAttribute('aria-selected', String(audio));
  $('tab-sheet').setAttribute('aria-selected', String(!audio));
  $('tab-audio').tabIndex = audio ? 0 : -1;
  $('tab-sheet').tabIndex = audio ? -1 : 0;
  $('pane-audio').hidden = !audio;
  $('pane-sheet').hidden = audio;
}

document.addEventListener('DOMContentLoaded', () => {
  // Song Lab is built around the baritone; default to it unless the
  // player has already chosen a tuning elsewhere in the app.
  let saved = null;
  try { saved = localStorage.getItem('uca-tuning'); } catch (e) { /* ignore */ }
  if (!saved) currentTuning = 'baritone';

  applyTheme(currentTheme());
  $('theme-toggle').addEventListener('click', toggleTheme);
  renderTuningToggle('tuning-toggle', () => { song.voicingPick = {}; renderAll(); });

  // Tabs
  $('tab-audio').addEventListener('click', () => selectTab('audio'));
  $('tab-sheet').addEventListener('click', () => selectTab('sheet'));
  document.querySelector('.source-tabs').addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const toSheet = $('tab-audio').getAttribute('aria-selected') === 'true';
      selectTab(toSheet ? 'sheet' : 'audio');
      $(toSheet ? 'tab-sheet' : 'tab-audio').focus();
    }
  });

  // Audio input
  $('audio-file').addEventListener('change', e => loadAudioFile(e.target.files[0]));
  const dz = $('drop-zone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadAudioFile(f);
  });
  $('reanalyze-btn').addEventListener('click', () => { if (song.source === 'audio') analyze(); });
  $('opt-sevenths').addEventListener('change', () => { if (song.source === 'audio') analyze(); });
  $('opt-smoothing').addEventListener('change', () => { if (song.source === 'audio') analyze(); });

  // Sheet
  $('sheet-load-btn').addEventListener('click', loadSheet);

  // Lyrics
  $('lyrics-fetch-btn').addEventListener('click', fetchLyrics);
  $('lyrics-apply-btn').addEventListener('click', applyPastedLyrics);
  $('lyrics-offset').addEventListener('change', e => {
    song.lyricOffset = parseFloat(e.target.value) || 0;
    renderSheet();
    updatePlayhead(true);
  });

  // Transpose
  $('tr-down').addEventListener('click', () => setTranspose(song.transpose - 1));
  $('tr-up').addEventListener('click', () => setTranspose(song.transpose + 1));
  $('tr-reset').addEventListener('click', () => setTranspose(0));
  $('easy-btn').addEventListener('click', () => pickEasiest(false));
  $('easy-capo-btn').addEventListener('click', () => pickEasiest(true));
  $('opt-flats').addEventListener('change', e => { song.preferFlats = e.target.checked; renderAll(); });

  // Palette: cycle voicings
  $('palette').addEventListener('click', e => {
    const card = e.target.closest('.palette-card');
    if (!card) return;
    const label = card.dataset.label;
    song.voicingPick[label] = (song.voicingPick[label] || 0) + 1;
    renderPalette();
    updatePlayhead(true);
    const again = document.querySelector(`.palette-card[data-label="${CSS.escape(label)}"]`);
    if (again) again.focus();
  });

  // Timeline: seek / edit
  $('timeline').addEventListener('click', e => {
    const seg = e.target.closest('button.seg');
    if (seg) { seek(parseFloat(seg.dataset.start)); $('audio').play().catch(() => {}); }
  });
  $('timeline').addEventListener('change', e => {
    if (e.target.classList.contains('seg-input')) commitSegEdit(e.target);
  });
  $('timeline').addEventListener('focusin', e => {
    if (e.target.classList.contains('seg-input')) seek(song.segments[parseInt(e.target.dataset.i, 10)].start);
  });
  $('edit-toggle').addEventListener('click', e => {
    song.editing = !song.editing;
    e.currentTarget.setAttribute('aria-pressed', String(song.editing));
    e.currentTarget.textContent = song.editing ? 'Done fixing' : 'Fix chords';
    renderTimeline();
    updatePlayhead(true);
  });

  // Sheet rows: seek
  const sheetSeek = e => {
    const row = e.target.closest('.row[data-time]');
    if (!row || song.source !== 'audio') return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    seek(parseFloat(row.dataset.time));
  };
  $('sheet').addEventListener('click', sheetSeek);
  $('sheet').addEventListener('keydown', sheetSeek);

  // Player
  const audio = $('audio');
  audio.addEventListener('play', () => { cancelAnimationFrame(rafId); tick(); });
  audio.addEventListener('pause', () => cancelAnimationFrame(rafId));
  audio.addEventListener('seeked', () => updatePlayhead(true));
  audio.addEventListener('loadedmetadata', () => { if (!song.duration) song.duration = audio.duration; });

  $('export-btn').addEventListener('click', exportChordPro);
  $('pdf-btn').addEventListener('click', exportPdf);
  $('print-btn').addEventListener('click', () => window.print());
});
