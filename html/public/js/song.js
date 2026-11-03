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
  tuningCents: 0,
  transpose: 0,
  preferFlats: null,     // null = automatic
  voicingPick: {},       // chord label → voicing index
  editing: false,
  lyricOffset: 0,
};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

function setProgress(frac) {
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

function diagramHtml(chord) {
  if (!chord) return '<div class="no-diagram">–</div>';
  const label = labelFor(chord);
  const vs = voicingsFor(chord);
  if (!vs.length) return `<div class="no-diagram" title="No diagram for this chord type">${esc(label)}<br><small>no diagram</small></div>`;
  const idx = (song.voicingPick[label] || 0) % vs.length;
  const v = vs[idx];
  const root = transposeChord(chord, song.transpose).root;
  const names = v.notes.map(n => noteName(n, flats() ? 5 : 0));
  return chordSVG(v.frets, names, root, isMixed(v.frets));
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
  } else if (t < 0) {
    note = `Or put a capo on fret ${-t} to keep the original key.`;
  }
  $('capo-note').textContent = note.trim();
}

function renderPalette() {
  const seen = new Map();
  for (const c of allChords()) {
    const l = labelFor(c);
    if (l && !seen.has(l)) seen.set(l, c);
  }
  const pal = $('palette');
  pal.innerHTML = [...seen.entries()].map(([label, c]) => {
    const n = voicingsFor(c).length;
    return `<button type="button" class="chord-card palette-card" data-label="${esc(label)}" aria-label="${esc(label)}${n > 1 ? ', tap for another voicing' : ''}">
      <span class="pc-name">${esc(label)}</span>${diagramHtml(c)}
      ${n > 1 ? `<span class="pc-count">${(song.voicingPick[label] || 0) % n + 1}/${n}</span>` : ''}
    </button>`;
  }).join('');
}

function renderTimeline() {
  const tl = $('timeline');
  if (song.source !== 'audio') { tl.hidden = true; tl.innerHTML = ''; return; }
  tl.hidden = false;
  tl.classList.toggle('editing', song.editing);
  tl.innerHTML = song.segments.map((s, i) => {
    const label = labelFor(s.chord) || 'N.C.';
    if (song.editing) {
      return `<span class="seg seg-edit" data-i="${i}"><span class="seg-time">${formatTime(s.start)}</span>
        <input type="text" class="seg-input" data-i="${i}" value="${esc(s.chord ? label : '')}" placeholder="N.C." aria-label="Chord at ${formatTime(s.start)}" size="5"></span>`;
    }
    return `<button type="button" class="seg${s.chord ? '' : ' nc'}" data-i="${i}" data-start="${s.start}">
      <span class="seg-time">${formatTime(s.start)}</span><span class="seg-name">${esc(label)}</span></button>`;
  }).join('');
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

function renderSheet() {
  const sheet = $('sheet');
  const rows = currentRows();
  if (rows) {
    sheet.innerHTML = rows.map((r, i) => {
      const chordLine = chordLineFor(r);
      const timeAttr = r.time != null ? ` data-time="${r.time}" tabindex="0" role="button" aria-label="Jump to ${formatTime(r.time)}"` : '';
      if (!r.text && !chordLine) return `<div class="row blank" data-row="${i}"></div>`;
      return `<div class="row" data-row="${i}"${timeAttr}>${chordLine ? `<div class="row-chords">${esc(chordLine)}</div>` : ''}<div class="row-text">${esc(r.text) || '&nbsp;'}</div></div>`;
    }).join('');
    return;
  }
  if (song.lyrics.length) {
    sheet.innerHTML = `<p class="hint">These lyrics have no timestamps, so chords can't be placed on them. Follow the timeline above.</p>` +
      song.lyrics.map(l => `<div class="row"><div class="row-text">${esc(l.text) || '&nbsp;'}</div></div>`).join('');
    return;
  }
  sheet.innerHTML = song.source === 'audio'
    ? '<p class="hint">Add lyrics (Find synced lyrics, or paste them) to see chords above the words.</p>'
    : '';
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
    $('now-diagram').innerHTML = diagramHtml(cur && cur.chord);
    $('next-name').textContent = nxt ? labelFor(nxt.chord) : '–';
    $('next-diagram').innerHTML = diagramHtml(nxt && nxt.chord);
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

async function loadAudioFile(file) {
  if (!file) return;
  song.file = file;
  const meta = guessMetaFromFilename(file.name);
  if (!$('meta-artist').value && meta.artist) $('meta-artist').value = meta.artist;
  if (!$('meta-title').value && meta.title) $('meta-title').value = meta.title;

  if (song.audioUrl) URL.revokeObjectURL(song.audioUrl);
  song.audioUrl = URL.createObjectURL(file);
  $('audio').src = song.audioUrl;

  setStatus(`Decoding “${file.name}”…`);
  setProgress(0.1);
  await nextFrame();
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    ctx.close && ctx.close();
    const channels = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(buf.getChannelData(c));
    song.pcm = { channels, sampleRate: buf.sampleRate };
    await analyze();
  } catch (err) {
    console.error(err);
    setProgress(null);
    setStatus('Could not decode that file. Try MP3, M4A, or WAV.', true);
  }
}

async function analyze() {
  if (!song.pcm) return;
  setStatus('Listening for chords…');
  setProgress(0.5);
  await nextFrame();
  const t0 = performance.now();
  const res = detectChords(song.pcm.channels, song.pcm.sampleRate, {
    include7ths: $('opt-sevenths').checked,
    selfProb: SMOOTHING_LEVELS[parseInt($('opt-smoothing').value, 10)] || 0.92,
  });
  song.source = 'audio';
  song.duration = res.duration;
  song.tuningCents = res.tuningCents;
  song.segments = res.segments.map(s => ({
    start: s.start, end: s.end,
    chord: s.type === 'N' ? null : { root: s.root, typeId: s.type, suffix: DETECTED_SUFFIX[s.type] || '', bass: null },
  }));
  song.origKey = { root: res.key.root, mode: res.key.mode };
  song.transpose = 0;
  song.voicingPick = {};
  song.editing = false;
  $('edit-toggle').setAttribute('aria-pressed', 'false');
  setProgress(1);
  const n = song.segments.filter(s => s.chord).length;
  setStatus(`Found ${n} chord changes in ${formatTime(res.duration)} (analysis took ${((performance.now() - t0) / 1000).toFixed(1)} s). Likely key: ${keyLabel(song.origKey, 0)}.`);
  setTimeout(() => setProgress(null), 600);
  $('reanalyze-btn').hidden = false;
  renderAll();
  if (!song.lyrics.length && $('meta-title').value.trim()) fetchLyrics(true);
}

// ── Loading a pasted chart ──────────────────────────────────

function loadSheet() {
  const text = $('sheet-input').value;
  const parsed = parseChordSheet(text);
  if (!parsed.rows.some(r => r.chords.length)) {
    setStatus('No chords found. Use [C] ChordPro brackets, or put chord names on their own line above the lyrics.', true);
    return;
  }
  song.source = 'sheet';
  song.sheetRows = parsed.rows.map(r => ({ text: r.text, chords: r.chords.map(c => ({ pos: c.pos, name: c.name, chord: parseChordName(c.name) })) }));
  // Trim leading/trailing blank rows
  while (song.sheetRows.length && !song.sheetRows[0].text.trim() && !song.sheetRows[0].chords.length) song.sheetRows.shift();
  while (song.sheetRows.length && !song.sheetRows[song.sheetRows.length - 1].text.trim() && !song.sheetRows[song.sheetRows.length - 1].chords.length) song.sheetRows.pop();
  if (parsed.meta.title) $('meta-title').value = parsed.meta.title;
  if (parsed.meta.artist) $('meta-artist').value = parsed.meta.artist;
  let key = null;
  if (parsed.meta.key) {
    const k = parseChordName(parsed.meta.key);
    if (k) key = { root: k.root, mode: k.typeId === 'min' ? 'minor' : 'major' };
  }
  song.origKey = key || guessKeyFromChords(allChords());
  song.transpose = 0;
  song.voicingPick = {};
  if (parsed.meta.capo && parseInt(parsed.meta.capo, 10) > 0) {
    // Chart written with a capo: shapes are relative to the capo
    setStatus(`Loaded chart (written for capo ${parseInt(parsed.meta.capo, 10)}).`);
  } else {
    setStatus(`Loaded chart with ${allChords().length} chords.`);
  }
  renderAll();
}

// ── Lyrics ──────────────────────────────────────────────────

async function fetchLyrics(quiet) {
  const artist = $('meta-artist').value.trim();
  const title = $('meta-title').value.trim();
  if (!title) { setStatus('Enter a song title (and ideally the artist) to look up lyrics.', true); return; }
  const btn = $('lyrics-fetch-btn');
  btn.disabled = true;
  if (!quiet) setStatus('Looking up lyrics on LRCLIB…');
  try {
    let rec = null;
    if (artist) {
      const p = new URLSearchParams({ artist_name: artist, track_name: title });
      if (song.duration) p.set('duration', String(Math.round(song.duration)));
      const r = await fetch(`${LRCLIB}/get?${p}`);
      if (r.ok) rec = await r.json();
    }
    if (!rec || (!rec.syncedLyrics && !rec.plainLyrics)) {
      const p = new URLSearchParams({ track_name: title });
      if (artist) p.set('artist_name', artist);
      const r = await fetch(`${LRCLIB}/search?${p}`);
      const list = r.ok ? await r.json() : [];
      if (Array.isArray(list) && list.length) {
        const score = (x) => (x.syncedLyrics ? 0 : 1000) + (song.duration && x.duration ? Math.abs(x.duration - song.duration) : 0);
        rec = list.slice().sort((a, b) => score(a) - score(b))[0];
      }
    }
    if (!rec || (!rec.syncedLyrics && !rec.plainLyrics)) {
      setStatus(`No lyrics found for “${title}”. You can paste them instead.`, !quiet);
      return;
    }
    song.lyrics = parseLrc(rec.syncedLyrics || rec.plainLyrics);
    const synced = !!rec.syncedLyrics;
    setStatus(`Lyrics loaded: ${rec.artistName || artist} – ${rec.trackName || title}${synced ? ' (synced)' : ' (not synced)'}.`);
    renderAll();
  } catch (err) {
    console.error(err);
    setStatus('Lyrics lookup failed (are you offline?). You can paste lyrics instead.', true);
  } finally {
    btn.disabled = false;
  }
}

function applyPastedLyrics() {
  const text = $('lyrics-input').value;
  song.lyrics = parseLrc(text);
  if (!song.lyrics.length) { setStatus('No lyrics to use.', true); return; }
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

function exportChordPro() {
  const rows = currentRows();
  const k = playKey();
  const capo = song.source === 'audio' && song.transpose < 0 ? -song.transpose : null;
  const tuningName = isBaritone() ? 'baritone DGBE' : (isLowG() ? 'low-G gCEA' : 'standard GCEA');
  const meta = {
    title: $('meta-title').value.trim(),
    artist: $('meta-artist').value.trim(),
    key: k ? (flats() ? NOTE_NAMES_FLAT : NOTE_NAMES)[k.root] + (k.mode === 'minor' ? 'm' : '') : '',
    capo,
    tuning: tuningName,
  };
  const segs = song.segments.map(s => ({ start: s.start, end: s.end, label: labelFor(s.chord) }));
  const text = toChordPro(meta, rows, segs);
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (meta.title || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.cho';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
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
  $('reanalyze-btn').addEventListener('click', analyze);
  $('opt-sevenths').addEventListener('change', () => { if (song.pcm) analyze(); });
  $('opt-smoothing').addEventListener('change', () => { if (song.pcm) analyze(); });

  // Sheet
  $('sheet-load-btn').addEventListener('click', loadSheet);

  // Lyrics
  $('lyrics-fetch-btn').addEventListener('click', () => fetchLyrics(false));
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
  $('print-btn').addEventListener('click', () => window.print());
});
