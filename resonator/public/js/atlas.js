// ═══════════════════════════════════════════════════════════
// ATLAS PAGE — UI state, rendering, event wiring
// Depends on: instrument.js, music-theory.js, diagram.js, theme.js,
// tuning.js, favorites.js
// ═══════════════════════════════════════════════════════════

const KEYS = [
  { root: 0,  label: "C" },
  { root: 1,  label: "C#/Db" },
  { root: 2,  label: "D" },
  { root: 3,  label: "D#/Eb" },
  { root: 4,  label: "E" },
  { root: 5,  label: "F" },
  { root: 6,  label: "F#/Gb" },
  { root: 7,  label: "G" },
  { root: 8,  label: "G#/Ab" },
  { root: 9,  label: "A" },
  { root: 10, label: "A#/Bb" },
  { root: 11, label: "B" },
];

function loadIncludeString1() {
  try {
    const v = localStorage.getItem('rca-drone-string1');
    return v === null ? true : v === 'true';
  } catch (e) {
    return true;
  }
}

const state = {
  root: null,
  type: "all",
  mixedOnly: false,
  searchQuery: "",
  includeString1: loadIncludeString1(),
  showFull: false,
};

// ── URL State Management ────────────────────────────────────────

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('key')) {
    const keyIndex = parseInt(params.get('key'), 10);
    if (!isNaN(keyIndex) && keyIndex >= 0 && keyIndex <= 11) {
      state.root = keyIndex;
    }
  }

  if (params.has('type')) {
    const type = params.get('type');
    if (type === 'all' || CHORD_TYPES.some(ct => ct.id === type)) {
      state.type = type;
    }
  }

  if (params.has('mixed')) {
    state.mixedOnly = params.get('mixed') === 'true';
  }
}

function updateUrl() {
  const params = new URLSearchParams();

  if (state.root !== null) {
    params.set('key', state.root);
  }

  if (state.type !== 'all') {
    params.set('type', state.type);
  }

  if (state.mixedOnly) {
    params.set('mixed', 'true');
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

// ── Search ───────────────────────────────────────────────────────

function setSearchQuery(query) {
  state.searchQuery = query.toLowerCase().trim();
  renderContent();
}

function clearSearch() {
  state.searchQuery = "";
  document.getElementById('chord-search').value = "";
  renderContent();
}

// ── Selection / detail strip ────────────────────────────────

let currentCard = null;

function selectCard(cardEl, noteNamesArr, frets) {
  if (currentCard === cardEl) { clearSelection(); return; }
  if (currentCard) currentCard.setAttribute('aria-pressed', 'false');
  currentCard = cardEl;
  cardEl.setAttribute('aria-pressed', 'true');

  const fingering = frets.map((f, si) => f === null ? `${currentStringNames()[si]}x` : `${currentStringNames()[si]}${f}`).join(' ');
  showInfo(`${noteNamesArr.filter(Boolean).join(' · ')}  —  ${fingering}`);
}

function clearSelection() {
  if (currentCard) {
    currentCard.setAttribute('aria-pressed', 'false');
    currentCard = null;
  }
  hideInfo();
}

function showInfo(text) {
  const strip = document.getElementById('info-strip');
  strip.textContent = text;
  strip.classList.add('show');
}
function hideInfo() {
  const strip = document.getElementById('info-strip');
  strip.classList.remove('show');
  strip.textContent = '';
}

// ── Render helpers ──────────────────────────────────────────

function renderKeys() {
  const row = document.getElementById('key-row');
  row.innerHTML = KEYS.map(k => `
    <button type="button" class="key-btn" aria-pressed="${state.root === k.root}"
      data-root="${k.root}">${k.label}</button>
  `).join('');
}

function renderTypes() {
  const row = document.getElementById('type-row');
  const types = [
    { id: "all", label: "All" },
    ...CHORD_TYPES.map(ct => ({ id: ct.id, label: ct.label })),
  ];
  row.innerHTML = `<legend class="visually-hidden">Chord type</legend>` + types.map(t => `
    <button type="button" class="type-btn" aria-pressed="${state.type === t.id}"
      data-type="${t.id}">${t.label}</button>
  `).join('') + `
    <button type="button" class="type-btn mixed-btn" aria-pressed="${state.mixedOnly}"
      data-mixed="true">★ open mid-neck</button>
    <button type="button" class="type-btn string1-btn" aria-pressed="${state.includeString1}"
      data-string1="true" title="Fret string 1 too (4 fingers) instead of leaving it as a drone (3 fingers)">
      string 1: ${state.includeString1 ? 'fretted' : 'drone'}</button>
    <button type="button" class="type-btn full-btn" aria-pressed="${state.showFull}"
      data-full="true" title="Also show full 6-string barre / slide shapes">
      + full 6-string shapes</button>
  `;
}

function renderVoicingGroups(voicings, displayRoot, lookupRoot) {
  const groups = {};
  for (const v of voicings) {
    const lbl = rootNoteName(displayRoot) + (v.label === 'maj' ? '' : v.label);
    if (!groups[lbl]) groups[lbl] = [];
    groups[lbl].push(v);
  }

  let html = '';
  for (const [grpLabel, vs] of Object.entries(groups)) {
    html += `<div class="chord-group">`;
    html += `<div class="group-label">${grpLabel} <span class="group-count">${vs.length} voicing${vs.length !== 1 ? 's' : ''}</span></div>`;
    html += `<div class="voicings-grid">`;
    vs.forEach((v) => {
      const mixed = isMixed(v.frets);
      const noteNamesArr = v.notes.map(n => (n === null ? '' : noteName(n, displayRoot)));
      const svg = chordSVG(v.frets, noteNamesArr, displayRoot, mixed, { droneFit: v.droneFit });
      const fretData = JSON.stringify(v.frets);
      const noteData = JSON.stringify(noteNamesArr);
      const isFavorited = isFavorite(displayRoot, v.type, v.frets.map(f => (f === null ? 'x' : f)));
      const ariaLabel = voicingAriaLabel(grpLabel, noteNamesArr, v.frets) + (v.droneFit === 'clash' ? ' Drone clashes with this chord.' : '');
      html += `<button type="button" class="chord-card${mixed ? ' mixed' : ''}${v.droneFit === 'clash' ? ' drone-clash' : ''}"
        aria-pressed="false"
        aria-label="${ariaLabel}"
        data-root="${displayRoot}" data-type="${v.type}" data-frets='${fretData}' data-notes='${noteData}'
        title="frets: ${v.frets.map(f => f === null ? 'x' : f).join('-')}"
      >${svg}<span class="favorite-btn" data-root="${displayRoot}" data-type="${v.type}" data-frets='${fretData}'>${getStarIcon(isFavorited)}</span></button>`;
    });
    html += `</div></div>`;
  }
  return html;
}

function renderContent() {
  const content = document.getElementById('chord-content');
  clearSelection();

  if (state.root === null) {
    content.innerHTML = `<div class="empty">Select a key above to begin.</div>`;
    return;
  }

  const displayRoot = state.root;
  const lookupRoot = displayRoot;

  const applyFilters = (voicings) => {
    let out = voicings;
    if (state.type !== "all") out = out.filter(v => v.type === state.type);
    if (state.mixedOnly) out = out.filter(v => isMixed(v.frets));
    if (state.searchQuery) {
      const rootName = rootNoteName(displayRoot);
      out = out.filter(v => {
        const chordName = rootName + (v.label === 'maj' ? '' : v.label);
        return chordName.toLowerCase().includes(state.searchQuery);
      });
    }
    return out.slice().sort((a, b) => compareVoicings(a, b, lookupRoot));
  };

  const droneVoicings = applyFilters(getVoicings(lookupRoot, { mode: 'drone', includeString1: state.includeString1 }));

  if (droneVoicings.length === 0 && !state.showFull) {
    content.innerHTML = `<div class="empty">No fingerstyle voicings found for this selection.</div>`;
    return;
  }

  let html = renderVoicingGroups(droneVoicings, displayRoot, lookupRoot);

  if (state.showFull) {
    const fullVoicings = applyFilters(getVoicings(lookupRoot, { mode: 'full' }));
    html += `<div class="full-shapes-section">`;
    html += `<div class="full-shapes-heading">Full 6-string / barre &amp; slide shapes</div>`;
    html += fullVoicings.length
      ? renderVoicingGroups(fullVoicings, displayRoot, lookupRoot)
      : `<div class="empty">No full-neck voicings found for this selection.</div>`;
    html += `</div>`;
  }

  if (!html) {
    content.innerHTML = `<div class="empty">No voicings found for this selection.</div>`;
    return;
  }

  content.innerHTML = html;
}

// ── State transitions ───────────────────────────────────────

function selectKey(root) {
  state.root = root;
  renderKeys();
  renderContent();
  updateUrl();
}

function selectType(type) {
  state.type = type;
  renderTypes();
  renderContent();
  updateUrl();
}

function toggleMixed() {
  state.mixedOnly = !state.mixedOnly;
  renderTypes();
  renderContent();
  updateUrl();
}

function toggleIncludeString1() {
  state.includeString1 = !state.includeString1;
  try { localStorage.setItem('rca-drone-string1', String(state.includeString1)); } catch (e) { /* ignore */ }
  renderTypes();
  renderContent();
}

function toggleShowFull() {
  state.showFull = !state.showFull;
  renderTypes();
  renderContent();
}

// ── Boot ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Parse URL parameters
  parseUrlParams();

  renderKeys();
  renderTypes();
  renderTuningToggle('tuning-toggle', renderContent);
  renderContent();
  applyTheme(currentTheme());

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  document.getElementById('key-row').addEventListener('click', e => {
    const btn = e.target.closest('.key-btn');
    if (btn) selectKey(Number(btn.dataset.root));
  });

  document.getElementById('type-row').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.mixed) { toggleMixed(); return; }
    if (btn.dataset.string1) { toggleIncludeString1(); return; }
    if (btn.dataset.full) { toggleShowFull(); return; }
    if (btn.dataset.type) selectType(btn.dataset.type);
  });

  document.getElementById('chord-content').addEventListener('click', e => {
    const card = e.target.closest('.chord-card');
    const favBtn = e.target.closest('.favorite-btn');

    if (favBtn) {
      e.stopPropagation();
      const root = parseInt(favBtn.dataset.root, 10);
      const type = favBtn.dataset.type;
      const frets = JSON.parse(favBtn.dataset.frets).map(f => (f === null ? 'x' : f));
      const isNowFavorited = toggleFavorite(root, type, frets);
      favBtn.innerHTML = getStarIcon(isNowFavorited);
      return;
    }

    if (card) {
      selectCard(card, JSON.parse(card.dataset.notes), JSON.parse(card.dataset.frets));
    }
  });

  // Search functionality
  const searchInput = document.getElementById('chord-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => setSearchQuery(e.target.value));
  }
  document.getElementById('search-clear')?.addEventListener('click', clearSearch);

  // Precompute a few common keys in the background
  setTimeout(() => { [0, 2, 5, 7, 9].forEach(r => getVoicings(r, { mode: 'drone', includeString1: state.includeString1 })); }, 500);
});

// Keyboard shortcut: Escape clears the current selection
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') clearSelection();
});
