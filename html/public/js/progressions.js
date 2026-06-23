// ═══════════════════════════════════════════════════════════
// PROGRESSIONS PAGE LOGIC
// Handles deck selection, card stepping, flip state, and diagram rendering
// ═══════════════════════════════════════════════════════════

// State
let currentDeck = null;
let currentProgressionIndex = 0;
let isFlipped = false;
let selectedKeyFilter = null; // null = all keys, otherwise filter by specific key

// DOM elements
const deckGrid = document.getElementById('deck-grid');
const deckListView = document.getElementById('deck-list-view');
const cardViewer = document.getElementById('card-viewer');
const cardContainer = document.getElementById('card-container');
const cardFront = document.getElementById('card-front');
const cardBack = document.getElementById('card-back');
const chordSequence = document.getElementById('chord-sequence');
const cardRoman = document.getElementById('card-roman');
const patternName = document.getElementById('pattern-name');
const diagramStrip = document.getElementById('diagram-strip');
const scaleTonesSection = document.getElementById('scale-tones-section');
const viewerInfo = document.getElementById('viewer-info');
const backBtn = document.getElementById('back-to-decks');
const flipBtn = document.getElementById('flip-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const stepCounter = document.getElementById('step-counter');

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

/**
 * Initialize the progressions page
 */
function initProgressions() {
  // Render deck list
  renderDeckList();

  // Render tuning toggle
  renderTuningToggle('tuning-toggle', onTuningChanged);

  // Initialize tuning
  initTuning();

  // Set up theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Set up event listeners
  setupEventListeners();

  // Update ARIA labels
  updateAriaLabels();
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Deck grid click - select a deck
  deckGrid.addEventListener('click', (e) => {
    const deckCard = e.target.closest('.deck-card');
    if (deckCard) {
      const deckId = deckCard.dataset.deckId;
      selectDeck(deckId);
    }
  });

  // Deck grid keyboard navigation
  deckGrid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const deckCard = e.target.closest('.deck-card');
      if (deckCard) {
        e.preventDefault();
        const deckId = deckCard.dataset.deckId;
        selectDeck(deckId);
      }
    }
  });

  // Back button
  backBtn.addEventListener('click', () => showDeckList());

  // Flip button
  flipBtn.addEventListener('click', toggleFlip);

  // Previous button
  prevBtn.addEventListener('click', showPrevious);

  // Next button
  nextBtn.addEventListener('click', showNext);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!cardViewer.classList.contains('active')) return;

    switch (e.key) {
      case 'ArrowLeft':
        showPrevious();
        break;
      case 'ArrowRight':
        showNext();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        // Step through progressions
        if (e.key === 'ArrowUp') showPrevious();
        if (e.key === 'ArrowDown') showNext();
        break;
      case 'Space':
      case 'Enter':
        toggleFlip();
        e.preventDefault();
        break;
      case 'Escape':
        showDeckList();
        break;
    }
  });

  // Key filter - could add later if needed
}

// ═══════════════════════════════════════════════════════════
// DECK LIST
// ═══════════════════════════════════════════════════════════

/**
 * Render the deck list
 */
function renderDeckList() {
  if (!deckGrid) return;

  deckGrid.innerHTML = '';

  for (const deck of DECKS) {
    const count = deck.progressions.length;
    
    const card = document.createElement('a');
    card.href = '#';
    card.className = 'deck-card';
    card.dataset.deckId = deck.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${deck.title}: ${count} progressions`);

    card.innerHTML = `
      <div class="deck-card-header">
        <div class="deck-card-title">${escapeHtml(deck.title)}</div>
        <div class="deck-card-count">${count} progressions</div>
      </div>
      <div class="deck-card-description">${escapeHtml(deck.description)}</div>
    `;

    deckGrid.appendChild(card);
  }
}

// ═══════════════════════════════════════════════════════════
// DECK SELECTION & VIEWER
// ═══════════════════════════════════════════════════════════

/**
 * Select a deck and show the card viewer
 * @param {string} deckId - The deck ID to select
 */
function selectDeck(deckId) {
  const deck = DECKS.find(d => d.id === deckId);
  if (!deck) return;

  currentDeck = deck;
  currentProgressionIndex = 0;
  isFlipped = false;

  // Show the viewer
  showCardViewer();

  // Render the first progression
  renderProgression();

  // Update ARIA
  cardViewer.setAttribute('aria-hidden', 'false');
  deckListView.setAttribute('aria-hidden', 'true');
  cardViewer.classList.add('active');
  deckListView.classList.remove('active');

  // Focus on the card container for keyboard nav
  cardContainer.focus();
}

/**
 * Show the deck list view
 */
function showDeckList() {
  currentDeck = null;
  currentProgressionIndex = 0;
  isFlipped = false;

  cardViewer.classList.remove('active');
  deckListView.classList.add('active');
  cardViewer.setAttribute('aria-hidden', 'true');
  deckListView.setAttribute('aria-hidden', 'false');

  // Reset card state
  cardContainer.classList.remove('flipped');
  cardBack.setAttribute('aria-hidden', 'true');

  // Focus on first deck card
  const firstDeckCard = deckGrid.querySelector('.deck-card');
  if (firstDeckCard) {
    firstDeckCard.focus();
  }
}

/**
 * Show the card viewer
 */
function showCardViewer() {
  cardViewer.classList.add('active');
  deckListView.classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// PROGRESSION RENDERING
// ═══════════════════════════════════════════════════════════

/**
 * Render the current progression
 */
function renderProgression() {
  if (!currentDeck || !currentDeck.progressions[currentProgressionIndex]) return;

  const progression = currentDeck.progressions[currentProgressionIndex];

  // Update viewer header
  viewerInfo.innerHTML = `
    <div class="viewer-deck-title">${escapeHtml(currentDeck.title)}</div>
    <div class="viewer-progression-info">
      Key: <strong>${escapeHtml(progression.key)}</strong> · 
      ${escapeHtml(progression.patternName)}
    </div>
  `;

  // Update step counter
  stepCounter.textContent = `${currentProgressionIndex + 1} of ${currentDeck.progressions.length}`;

  // Update card front
  renderCardFront(progression);

  // Update card back (render diagrams)
  renderCardBack(progression);

  // Reset to front view
  cardContainer.classList.remove('flipped');
  cardBack.setAttribute('aria-hidden', 'true');
  flipBtn.textContent = 'Show Diagrams';
  flipBtn.setAttribute('aria-label', 'Flip card to show diagrams');

  // Update ARIA labels
  updateAriaLabels();
}

/**
 * Render the card front with chord sequence and roman numerals
 * @param {Object} progression - The progression to render
 */
function renderCardFront(progression) {
  // Clear previous content
  chordSequence.innerHTML = '';
  cardRoman.innerHTML = '';
  patternName.textContent = progression.patternDescription || '';

  // Render chord sequence
  progression.chords.forEach(chord => {
    const span = document.createElement('span');
    span.className = 'chord-in-sequence';
    span.textContent = chord;
    span.setAttribute('aria-label', `${chord} chord`);
    chordSequence.appendChild(span);
  });

  // Render roman numerals
  progression.roman.forEach(roman => {
    const span = document.createElement('span');
    span.className = 'roman-item';
    span.textContent = roman;
    span.setAttribute('aria-label', `${roman} scale degree`);
    cardRoman.appendChild(span);
  });
}

/**
 * Render the card back with diagrams and scale tones
 * @param {Object} progression - The progression to render
 */
function renderCardBack(progression) {
  // Clear previous content
  diagramStrip.innerHTML = '';
  scaleTonesSection.innerHTML = '';

  // Get voicings for each chord in the progression
  // Use a simple voicing (first position or open) for each chord
  for (let i = 0; i < progression.chords.length; i++) {
    const chordName = progression.chords[i];
    const roman = progression.roman[i];

    // Extract root from chord name
    const rootMatch = chordName.match(/^([A-G][#b]?)/);
    if (!rootMatch) continue;

    const root = rootMatch[1];
    const chordType = chordName.slice(root.length);

    // Find the root index
    const rootIndex = NOTE_NAMES.indexOf(root) !== -1 
      ? NOTE_NAMES.indexOf(root)
      : NOTE_NAMES_FLAT.indexOf(root);

    if (rootIndex === -1) continue;

    // Get voicings for this root
    const voicings = getVoicings(rootIndex);
    
    // Find a suitable voicing - prefer open position or simple shapes
    let selectedVoicing = null;
    
    // Look for the specific chord type first
    if (chordType) {
      selectedVoicing = voicings.find(v => 
        v.type === chordType || v.label === chordType
      );
    }
    
    // If not found, use the first major voicing as fallback
    if (!selectedVoicing && voicings.length > 0) {
      selectedVoicing = voicings[0];
    }

    if (selectedVoicing) {
      // Create diagram wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'diagram-wrapper';

      // Add chord label above diagram
      const label = document.createElement('div');
      label.className = 'chord-label-above';
      label.textContent = `${chordName} (${roman})`;
      wrapper.appendChild(label);

      // Generate note names for the voicing
      const noteNamesArr = selectedVoicing.notes.map(n => {
        const useFlats = FLAT_KEYS.has(rootIndex);
        const noteNames = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES;
        return noteNames[n % 12];
      });

      // Render the diagram SVG
      const svg = chordSVG(
        selectedVoicing.frets,
        noteNamesArr,
        rootIndex,
        selectedVoicing.frets.some(f => f === 0) && selectedVoicing.frets.some(f => f > 0)
      );
      wrapper.innerHTML += svg;
      
      diagramStrip.appendChild(wrapper);
    }
  }

  // Render scale tones for the key
  renderScaleTones(progression);
}

/**
 * Render scale tones for the progression's key
 * @param {Object} progression - The progression to render
 */
function renderScaleTones(progression) {
  const scaleTonesTitle = document.createElement('div');
  scaleTonesTitle.className = 'scale-tones-title';
  scaleTonesTitle.textContent = 'Scale Tones';
  scaleTonesSection.appendChild(scaleTonesTitle);

  const scaleTonesGrid = document.createElement('div');
  scaleTonesGrid.className = 'scale-tones-grid';
  scaleTonesSection.appendChild(scaleTonesGrid);

  // Get the first chord's scale (all chords should be in the same key)
  const firstChord = progression.chords[0];
  const scaleTones = getScaleTones(firstChord);

  scaleTones.forEach(tone => {
    const span = document.createElement('span');
    span.className = 'scale-tone';
    span.textContent = tone;
    span.setAttribute('aria-label', `${tone} note`);
    scaleTonesGrid.appendChild(span);
  });
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════

/**
 * Show the previous progression
 */
function showPrevious() {
  if (!currentDeck) return;

  currentProgressionIndex = (currentProgressionIndex - 1 + currentDeck.progressions.length) % currentDeck.progressions.length;
  renderProgression();
}

/**
 * Show the next progression
 */
function showNext() {
  if (!currentDeck) return;

  currentProgressionIndex = (currentProgressionIndex + 1) % currentDeck.progressions.length;
  renderProgression();
}

/**
 * Toggle the card flip state
 */
function toggleFlip() {
  isFlipped = !isFlipped;
  cardContainer.classList.toggle('flipped', isFlipped);
  cardBack.setAttribute('aria-hidden', !isFlipped);

  if (isFlipped) {
    flipBtn.textContent = 'Show Sequence';
    flipBtn.setAttribute('aria-label', 'Flip card to show chord sequence');
  } else {
    flipBtn.textContent = 'Show Diagrams';
    flipBtn.setAttribute('aria-label', 'Flip card to show diagrams');
  }
}

// ═══════════════════════════════════════════════════════════
// TUNING CHANGE HANDLER
// ═══════════════════════════════════════════════════════════

/**
 * Handle tuning changes - re-render current card if visible
 */
function onTuningChanged() {
  if (currentDeck && cardViewer.classList.contains('active')) {
    renderProgression();
  }
}

// ═══════════════════════════════════════════════════════════
// ACCESSIBILITY
// ═══════════════════════════════════════════════════════════

/**
 * Update ARIA labels based on current state
 */
function updateAriaLabels() {
  if (cardViewer.classList.contains('active') && currentDeck) {
    const progression = currentDeck.progressions[currentProgressionIndex];
    
    // Update card container label
    cardContainer.setAttribute('aria-label', 
      `Card ${currentProgressionIndex + 1} of ${currentDeck.progressions.length} in ${currentDeck.title} deck. ` +
      `Progression: ${progression.chords.join(' to ')}. ` +
      (isFlipped ? 'Showing diagrams' : 'Showing chord sequence')
    );

    // Update flip button
    flipBtn.setAttribute('aria-label', 
      isFlipped ? 'Flip card to show chord sequence' : 'Flip card to show diagrams'
    );
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// INITIALIZE ON DOM READY
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', initProgressions);
