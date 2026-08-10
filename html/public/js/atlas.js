// ═══════════════════════════════════════════════════════════
// ATLAS PAGE — UI state, rendering, event wiring
// Depends on: music-theory.js, diagram.js, theme.js, tuning.js, favorites.js
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

// Picking a key with no type filter returns every voicing of all 16 chord
// types at once — a few hundred diagrams, which is unreadable as a starting
// point. Opening on plain majors keeps it to a handful; "All" is one click away.
const DEFAULT_TYPE = "maj";

const state = {
  root: null,
  type: DEFAULT_TYPE,
  mixedOnly: false,
  searchQuery: "",
};

// ── URL State Management ────────────────────────────────────────

/**
 * Parse URL search params and update state
 */
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

/**
 * Update URL to reflect current state
 */
function updateUrl() {
  const params = new URLSearchParams();
  
  if (state.root !== null) {
    params.set('key', state.root);
  }
  
  // Anything that isn't the default has to survive a reload, including "all".
  if (state.type !== DEFAULT_TYPE) {
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

  const fingering = frets.map((f, si) => `${currentStringNames()[si]}${f}`).join(' ');
  showInfo(`${noteNamesArr.join(' \u00b7 ')}  \u2014  ${fingering}`);
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
      data-mixed="true">\u2605 open mid-neck</button>
  `;
}

function renderContent() {
  const content = document.getElementById('chord-content');
  clearSelection();

  if (state.root === null) {
    content.innerHTML = `<div class="empty">Select a key above to begin.</div>`;
    return;
  }

  const displayRoot = state.root;
  // Every tuning is standard GCEA shifted by a fixed interval, so look up the
  // transposed root in the standard voicing cache to get fingerings that sound
  // as displayRoot in whatever is currently selected.
  let voicings = getVoicings(standardRootFor(displayRoot));

  if (state.type !== "all") {
    voicings = voicings.filter(v => v.type === state.type);
  }
  if (state.mixedOnly) {
    voicings = voicings.filter(v => isMixed(v.frets));
  }
  
  // Filter by search query
  if (state.searchQuery) {
    const rootName = rootNoteName(displayRoot);
    voicings = voicings.filter(v => {
      const chordName = rootName + (v.label === 'maj' ? '' : v.label);
      return chordName.toLowerCase().includes(state.searchQuery);
    });
  }

  voicings = voicings.slice().sort((a, b) => {
    const pa = a.frets.filter(f => f > 0);
    const pb = b.frets.filter(f => f > 0);
    const posA = pa.length > 0 ? Math.min(...pa) : 0;
    const posB = pb.length > 0 ? Math.min(...pb) : 0;
    return posA - posB;
  });

  const groups = {};
  for (const v of voicings) {
    const lbl = rootNoteName(displayRoot) + (v.label === 'maj' ? '' : v.label);
    if (!groups[lbl]) groups[lbl] = [];
    groups[lbl].push(v);
  }

  if (voicings.length === 0) {
    content.innerHTML = `<div class="empty">No voicings found for this selection.</div>`;
    return;
  }

  let html = '';
  for (const [grpLabel, vs] of Object.entries(groups)) {
    html += `<div class="chord-group">`;
    html += `<div class="group-label">${grpLabel} <span class="group-count">${vs.length} voicing${vs.length !== 1 ? 's' : ''}</span></div>`;
    html += `<div class="voicings-grid">`;
    vs.forEach((v) => {
      const mixed = isMixed(v.frets);
      // The voicing was generated in standard GCEA, so its notes have to be
      // transposed back into the current tuning before they are labelled.
      const noteNamesArr = v.notes.map(n => noteName(soundingNote(n), displayRoot));
      const svg = chordSVG(v.frets, noteNamesArr, displayRoot, mixed);
      const fretData = JSON.stringify(v.frets);
      const noteData = JSON.stringify(noteNamesArr);
      const isFavorited = isFavorite(displayRoot, v.type, v.frets);
      const ariaLabel = voicingAriaLabel(grpLabel, noteNamesArr, v.frets);
      html += `<button type="button" class="chord-card${mixed ? ' mixed' : ''}"
        aria-pressed="false"
        aria-label="${ariaLabel}"
        data-root="${displayRoot}" data-type="${v.type}" data-frets='${fretData}' data-notes='${noteData}'
        title="${noteNamesArr.join('-')} | frets: ${v.frets.join('-')}"
      >${svg}<span class="favorite-btn" data-root="${displayRoot}" data-type="${v.type}" data-frets='${fretData}'>${getStarIcon(isFavorited)}</span></button>`;
    });
    html += `</div></div>`;
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
    if (btn.dataset.type) selectType(btn.dataset.type);
  });

  document.getElementById('chord-content').addEventListener('click', e => {
    const card = e.target.closest('.chord-card');
    const favBtn = e.target.closest('.favorite-btn');
    
    if (favBtn) {
      e.stopPropagation();
      const root = parseInt(favBtn.dataset.root, 10);
      const type = favBtn.dataset.type;
      const frets = JSON.parse(favBtn.dataset.frets);
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
  setTimeout(() => { [0, 2, 5, 7, 9].forEach(r => getVoicings(r)); }, 500);
});

// Keyboard shortcut: Escape clears the current selection
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') clearSelection();
});
