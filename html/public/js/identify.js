// ═══════════════════════════════════════════════════════════
// CHORD IDENTIFIER PAGE
// Depends on: music-theory.js, theme.js, tuning.js
// ═══════════════════════════════════════════════════════════

const MAX_FRET = 12;

// Current fret selection per string [G, C, E, A] — 0 = open
const selectedFrets = [0, 0, 0, 0];

// ── URL State Management ───────────────────────────────────────────

/**
 * Parse URL search params and update fret selection
 */
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  
  if (params.has('frets')) {
    const fretsStr = params.get('frets');
    const frets = fretsStr.split(',').map(f => parseInt(f, 10));
    if (frets.length === 4 && frets.every(f => !isNaN(f) && f >= 0 && f <= 12)) {
      for (let i = 0; i < 4; i++) {
        selectedFrets[i] = frets[i];
      }
    }
  }
}

/**
 * Update URL to reflect current fret selection
 */
function updateUrl() {
  const params = new URLSearchParams();
  params.set('frets', selectedFrets.join(','));
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

// ── Fretboard SVG ───────────────────────────────────────────

const STRINGS = 4;
const FB = {
  leftMargin: 42,  // room for fret numbers
  topMargin: 36,   // room for open-string note labels
  cellW: 52,       // horizontal spacing between strings
  cellH: 38,       // vertical spacing between frets
  rightPad: 20,
  bottomPad: 28,   // room for string names
};
FB.gridW = (STRINGS - 1) * FB.cellW;
FB.gridH = MAX_FRET * FB.cellH;
FB.W = FB.leftMargin + FB.gridW + FB.rightPad;
FB.H = FB.topMargin + FB.gridH + FB.bottomPad;

const stringX = (s) => FB.leftMargin + s * FB.cellW;
const fretY = (f) => FB.topMargin + (f - 0.5) * FB.cellH; // centre of fret f (f >= 1)
const OPEN_Y = FB.topMargin - 16;

/** Static board: background, frets, strings, markers, labels, hover cells. */
function renderFretboard() {
  const { leftMargin, topMargin, cellW, cellH, gridW, gridH, W, H } = FB;

  let svg = `<svg id="fretboard-svg" tabindex="-1" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Interactive ukulele fretboard. Tap a fret to place a finger; tap a dot to remove it or drag it to another fret.">`;

  svg += `<rect class="fb-bg" x="0" y="0" width="${W}" height="${H}" rx="4"/>`;
  svg += `<rect class="fb-nut" x="${leftMargin - 2}" y="${topMargin - 4}" width="${gridW + 4}" height="5" rx="1"/>`;

  for (let f = 1; f <= MAX_FRET; f++) {
    const y = topMargin + f * cellH;
    svg += `<line class="fb-fret-line" x1="${leftMargin}" y1="${y}" x2="${leftMargin + gridW}" y2="${y}"/>`;
  }
  for (let s = 0; s < STRINGS; s++) {
    const x = stringX(s);
    svg += `<line class="fb-string-line" x1="${x}" y1="${topMargin}" x2="${x}" y2="${topMargin + gridH}" stroke-width="${1.2 + s * 0.2}"/>`;
  }

  // Position dots (standard uke markers at 5, 7, 10, double at 12)
  const midX = leftMargin + gridW / 2;
  for (const mf of [5, 7, 10]) svg += `<circle class="fb-marker" cx="${midX}" cy="${fretY(mf)}" r="4"/>`;
  svg += `<circle class="fb-marker" cx="${midX - 12}" cy="${fretY(12)}" r="3.5"/>`;
  svg += `<circle class="fb-marker" cx="${midX + 12}" cy="${fretY(12)}" r="3.5"/>`;

  for (let f = 1; f <= MAX_FRET; f++) {
    svg += `<text class="fb-fret-num" x="${leftMargin - 10}" y="${fretY(f) + 4}" text-anchor="end">${f}</text>`;
  }
  currentStringNames().forEach((name, s) => {
    svg += `<text class="fb-string-name" x="${stringX(s)}" y="${topMargin + gridH + 20}" text-anchor="middle">${name}</text>`;
  });

  // Hover cells (visual only; input is handled on the whole SVG)
  for (let s = 0; s < STRINGS; s++) {
    const x = stringX(s);
    svg += `<rect class="fb-hit" x="${x - cellW / 2 + 1}" y="${OPEN_Y - 14}" width="${cellW - 2}" height="28"/>`;
    for (let f = 1; f <= MAX_FRET; f++) {
      svg += `<rect class="fb-hit" x="${x - cellW / 2 + 1}" y="${fretY(f) - cellH / 2 + 1}" width="${cellW - 2}" height="${cellH - 2}"/>`;
    }
  }

  svg += `<g id="fb-dynamic"></g></svg>`;
  document.getElementById('fretboard-container').innerHTML = svg;

  const el = document.getElementById('fretboard-svg');
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);
  el.addEventListener('keydown', onDotKey);
  // touch-action on SVG shapes isn't honoured everywhere, so stop the page from
  // scrolling (which would cancel the pointer stream) only while a dot is dragged.
  el.addEventListener('touchstart', e => {
    if (e.target.closest && e.target.closest('.fb-dot-g')) e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  renderDots();
}

/** Open-string rings and finger dots (redrawn on every change; the board stays put). */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element; attribute values and text are set as data, never parsed as markup. */
function svgEl(tag, attrs, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Open-string rings and finger dots (redrawn on every change; the board stays put). */
function renderDots(focusString) {
  const layer = document.getElementById('fb-dynamic');
  if (!layer) return;
  const strNames = currentStringNames();
  const nodes = [];
  for (let s = 0; s < STRINGS; s++) {
    const x = stringX(s);
    const isOpen = selectedFrets[s] === 0;
    nodes.push(svgEl('circle', { class: 'fb-open-ring' + (isOpen ? ' fb-selected' : ''), cx: x, cy: OPEN_Y, r: 10 }));
    nodes.push(svgEl('text', { class: 'fb-open-note' + (isOpen ? '' : ' fb-dim'), x, y: OPEN_Y + 4, 'text-anchor': 'middle' },
      noteName(noteAtCurrent(s, 0), 0)));

    const f = selectedFrets[s];
    if (f > 0) {
      const note = noteName(noteAtCurrent(s, f), 0);
      const dragging = drag && drag.s === s && drag.moved;
      const g = svgEl('g', {
        class: 'fb-dot-g' + (dragging ? ' fb-dragging' : ''), 'data-string': s, 'data-fret': f,
        tabindex: 0, role: 'button',
        'aria-label': `${strNames[s]} string, fret ${f}, ${note}. Press Delete to remove; arrow keys move it.`,
      });
      g.append(
        svgEl('circle', { class: 'fb-dot fb-selected', cx: x, cy: fretY(f), r: FB.cellH * 0.34 }),
        svgEl('text', { class: 'fb-dot-text', x, y: fretY(f) + 4, 'text-anchor': 'middle' }, note));
      nodes.push(g);
    }
  }
  layer.replaceChildren(...nodes);
  if (focusString !== undefined) {
    const dot = layer.querySelector(`.fb-dot-g[data-string="${focusString}"]`);
    if (dot) dot.focus();
  }
}

// ── Input: tap to place/remove, drag to move ───────────────

let drag = null;     // { s, f, x0, y0, moved, pointerId } while dragging a dot
let pending = null;  // { s, f, x0, y0, pointerId } tap on an empty cell, placed on release
const DRAG_THRESHOLD = 6; // px before a press on a dot becomes a drag

/** Map a pointer event to { s, f } (f = 0 above the nut), or null if off the board. */
function cellFromEvent(e) {
  const svg = document.getElementById('fretboard-svg');
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const s = Math.round((p.x - FB.leftMargin) / FB.cellW);
  if (s < 0 || s >= STRINGS || Math.abs(p.x - stringX(s)) > FB.cellW / 2) return null;
  if (p.y < OPEN_Y - 16 || p.y > FB.topMargin + FB.gridH) return null;
  const f = p.y < FB.topMargin ? 0 : Math.min(MAX_FRET, Math.max(1, Math.ceil((p.y - FB.topMargin) / FB.cellH)));
  return { s, f };
}

/** Clamp a drag position to the board (drags may wander off it). */
function clampedCell(e) {
  const svg = document.getElementById('fretboard-svg');
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const s = Math.min(STRINGS - 1, Math.max(0, Math.round((p.x - FB.leftMargin) / FB.cellW)));
  const f = p.y < FB.topMargin ? 0 : Math.min(MAX_FRET, Math.max(1, Math.ceil((p.y - FB.topMargin) / FB.cellH)));
  return { s, f };
}

function commit(focusString) {
  renderDots(focusString);
  renderResult();
  updateUrl();
}

function onPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  if (drag) return;   // one drag at a time: a second finger must not strand the first
  pending = null;     // every new press starts a fresh gesture
  const cell = cellFromEvent(e);
  if (!cell) return;
  if (cell.f > 0 && selectedFrets[cell.s] === cell.f) {
    // Pressed a finger dot: could be a tap (remove) or the start of a drag
    drag = { s: cell.s, f: cell.f, x0: e.clientX, y0: e.clientY, moved: false, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else {
    pending = { s: cell.s, f: cell.f, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId };
    // Capture so a release outside the board still reaches us and clears the tap
    e.currentTarget.setPointerCapture(e.pointerId);
  }
}

function onPointerMove(e) {
  if (pending && pending.pointerId === e.pointerId &&
      Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0) > 10) {
    pending = null; // the user is scrolling or swiping, not tapping
  }
  if (!drag || drag.pointerId !== e.pointerId) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_THRESHOLD) return;
  drag.moved = true;
  const to = clampedCell(e);
  // A string that already has a finger can't take another: stay on the current string
  if (to.s !== drag.s && selectedFrets[to.s] > 0) to.s = drag.s;
  if (to.s === drag.s && to.f === drag.f) { renderDots(); return; }
  if (to.s !== drag.s) selectedFrets[drag.s] = 0; // finger leaves its old string
  selectedFrets[to.s] = to.f;
  drag.s = to.s; drag.f = to.f;
  if (to.f === 0) {
    // Dragged above the nut: the string is now open and there is no dot left to drag
    drag = null;
  }
  commit();
}

function onPointerUp(e) {
  if (drag && drag.pointerId === e.pointerId) {
    // Browsers can coalesce away the last move before release; apply the release point too
    if (drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) >= DRAG_THRESHOLD) onPointerMove(e);
    if (!drag) return; // the final move dropped it above the nut
    if (!drag.moved) selectedFrets[drag.s] = 0; // a tap on a dot removes it
    drag = null;
    commit();
    return;
  }
  if (pending && pending.pointerId === e.pointerId) {
    const cell = cellFromEvent(e);
    if (cell && cell.s === pending.s && cell.f === pending.f) {
      selectedFrets[cell.s] = cell.f; // place (or set the string open from the top row)
      commit();
    }
    pending = null;
  }
}

function onPointerCancel(e) {
  if (drag && drag.pointerId === e.pointerId) { drag = null; renderDots(); }
  if (pending && pending.pointerId === e.pointerId) pending = null;
}

/** Keyboard control for a focused dot. */
function onDotKey(e) {
  const dot = e.target.closest && e.target.closest('.fb-dot-g');
  if (!dot) return;
  const s = parseInt(dot.dataset.string, 10);
  const f = selectedFrets[s];
  let focus = s;
  switch (e.key) {
    case 'Delete': case 'Backspace': case 'Enter': case ' ':
      selectedFrets[s] = 0;
      focus = undefined;
      break;
    case 'ArrowUp':
      selectedFrets[s] = f - 1; // fret 1 → open
      if (selectedFrets[s] === 0) focus = undefined;
      break;
    case 'ArrowDown':
      selectedFrets[s] = Math.min(MAX_FRET, f + 1);
      break;
    case 'ArrowLeft': case 'ArrowRight': {
      // Move to the nearest string in that direction that has no finger on it
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      let t = s + step;
      while (t >= 0 && t < STRINGS && selectedFrets[t] > 0) t += step;
      if (t < 0 || t >= STRINGS) { e.preventDefault(); return; }
      selectedFrets[s] = 0;
      selectedFrets[t] = f;
      focus = t;
      break;
    }
    default:
      return;
  }
  e.preventDefault();
  commit(focus);
  if (focus === undefined) document.getElementById('fretboard-svg').focus();
}

function clearFretboard() {
  for (let i = 0; i < 4; i++) selectedFrets[i] = 0;
  drag = null; pending = null;
  renderFretboard();
  renderResult();
  updateUrl();
}

// ── Result rendering ────────────────────────────────────────

function renderResult() {
  const container = document.getElementById('identify-result');
  const notes = selectedFrets.map((f, i) => noteAtCurrent(i, f));
  const noteNamesArr = notes.map(n => noteName(n, 0));
  const strNames = currentStringNames();

  // Always show current notes
  const notesDisplay = selectedFrets.map((f, i) => {
    const name = noteName(noteAtCurrent(i, f), 0);
    return `<span class="id-note">${strNames[i]}: ${name}${f > 0 ? ' <small>(fret ' + f + ')</small>' : ' <small>(open)</small>'}</span>`;
  }).join('');

  const results = identifyChord(selectedFrets);

  if (results.length === 0) {
    container.innerHTML = `
      <div class="id-notes-row">${notesDisplay}</div>
      <div class="id-primary">?</div>
      <div class="id-hint">No known chord matches these notes.</div>
    `;
    return;
  }

  const primary = results[0];
  const alternates = results.slice(1);

  let html = `<div class="id-notes-row">${notesDisplay}</div>`;
  html += `<div class="id-primary">${primary.label}</div>`;
  html += `<div class="id-intervals">${primary.intervals}</div>`;

  if (alternates.length > 0) {
    html += `<div class="id-also">Also matches:</div>`;
    html += `<div class="id-alt-list">`;
    alternates.forEach(a => {
      html += `<span class="id-alt-chip">${a.label} <small>${a.intervals}</small></span>`;
    });
    html += `</div>`;
  }

  // Add chord progression suggestions
  if (primary.root !== undefined && primary.type && primary.type.id) {
    const progressions = getProgressionSuggestions(primary.root, primary.type.id);
    if (progressions.length > 0) {
      html += `<div class="id-progressions">`;
      html += `<div class="id-progression-label">Common progressions:</div>`;
      html += `<div class="id-progression-list">`;
      progressions.forEach(p => {
        html += `<span class="id-progression-chip">${p.name}: ${p.chords.join(' - ')}</span>`;
      });
      html += `</div></div>`;
    }
  }

  // Add strumming pattern suggestions
  const patterns = getStrummingPatterns();
  if (patterns.length > 0) {
    html += `<div class="id-strumming">`;
    html += `<div class="id-strumming-label">Strumming patterns:</div>`;
    html += `<div class="id-strumming-list">`;
    patterns.forEach(p => {
      const patternDisplay = p.pattern.map(s => 
        s === '-' ? '<span class="strum-rest">•</span>' : 
        s === 'D' ? '<span class="strum-down">↓</span>' : 
        '<span class="strum-up">↑</span>'
      ).join('');
      html += `<span class="id-strumming-chip">${p.name}: ${patternDisplay}</span>`;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html;
}

// ── Boot ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Parse URL parameters
  parseUrlParams();

  renderFretboard();
  renderResult();
  applyTheme(currentTheme());
  
  // Update URL to match current state
  updateUrl();

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('clear-btn').addEventListener('click', clearFretboard);

  renderTuningToggle('tuning-toggle', clearFretboard);
});
