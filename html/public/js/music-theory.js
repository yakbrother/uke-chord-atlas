// ═══════════════════════════════════════════════════════════
// MUSIC THEORY ENGINE (shared)
// ═══════════════════════════════════════════════════════════

const NOTE_NAMES      = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const NOTE_NAMES_FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

// Keys that prefer flats
const FLAT_KEYS = new Set([1, 3, 5, 8, 10]); // Db, Eb, F, Ab, Bb

function noteName(n, root) {
  const nn = ((n % 12) + 12) % 12;
  return FLAT_KEYS.has(root) ? NOTE_NAMES_FLAT[nn] : NOTE_NAMES[nn];
}

function rootNoteName(root) {
  return FLAT_KEYS.has(root) ? NOTE_NAMES_FLAT[root] : NOTE_NAMES[root];
}

// ── Tunings ─────────────────────────────────────────────────
//
// `open` holds pitch classes (semitones, C = 0) and drives chord spelling.
// `midi` holds the actual sounding pitch of each open string, which is what
// distinguishes a re-entrant tuning from a linear one: the pitch classes are
// identical, but the lowest-sounding string is not. Only `midi` can tell you
// which note is in the bass, so slash-chord detection reads from there.
//
// `reentrant` means at least one string breaks the low-to-high ordering.
//
// `offset` is how many semitones the tuning sounds BELOW standard GCEA.
// Every tuning here is standard GCEA moved bodily up or down — the intervals
// between the strings never change — which is what lets all of them share one
// set of generated voicings. See standardRootFor() below.
const TUNINGS = {
  standard: {
    id: 'standard', label: 'Standard', short: 'GCEA',
    open: [7, 0, 4, 9],   midi: [55, 48, 52, 57], // G4 C4 E4 A4
    stringNames: ["G", "C", "E", "A"],
    offset: 0, baritone: false, reentrant: true,
  },
  lowg: {
    id: 'lowg', label: 'Low-G', short: 'gCEA',
    open: [7, 0, 4, 9],   midi: [43, 48, 52, 57], // G3 C4 E4 A4
    stringNames: ["g", "C", "E", "A"],
    offset: 0, baritone: false, reentrant: false,
  },
  // "D tuning" (also called English tuning) — a whole step above standard.
  // It was the common tuning before C tuning took over, and still turns up in
  // older method books and on vintage sopranos.
  dTuning: {
    id: 'dTuning', label: 'D (high-A)', short: 'ADF#B',
    open: [9, 2, 6, 11],  midi: [59, 52, 56, 61], // A4 D4 F#4 B4 — re-entrant
    stringNames: ["A", "D", "F#", "B"],
    offset: -2, baritone: false, reentrant: true,
  },
  dTuningLowA: {
    id: 'dTuningLowA', label: 'D (low-A)', short: 'aDF#B',
    open: [9, 2, 6, 11],  midi: [47, 52, 56, 61], // A3 D4 F#4 B4 — linear
    stringNames: ["a", "D", "F#", "B"],
    offset: -2, baritone: false, reentrant: false,
  },
  baritone: {
    id: 'baritone', label: 'Bari low-D', short: 'DGBE',
    open: [2, 7, 11, 4],  midi: [38, 43, 47, 52], // D3 G3 B3 E4 — linear
    stringNames: ["D", "G", "B", "E"],
    offset: 5, baritone: true, reentrant: false,
  },
  baritoneHighD: {
    id: 'baritoneHighD', label: 'Bari high-D', short: 'DGBE re-entrant',
    open: [2, 7, 11, 4],  midi: [50, 43, 47, 52], // D4 G3 B3 E4 — re-entrant
    stringNames: ["D", "G", "B", "E"],
    offset: 5, baritone: true, reentrant: true,
  },
};

const DEFAULT_TUNING = 'standard';

// Voicing generation always works in standard GCEA and transposes to whatever
// is selected, so it needs the standard shape regardless of the current tuning.
const OPEN = TUNINGS.standard.open;

let currentTuning = DEFAULT_TUNING;

function tuning() { return TUNINGS[currentTuning] || TUNINGS[DEFAULT_TUNING]; }

function setTuning(t) {
  currentTuning = TUNINGS[t] ? t : DEFAULT_TUNING;
  try { localStorage.setItem('uca-tuning', currentTuning); } catch (e) {}
}

function isLowG() { return currentTuning === 'lowg'; }
function isBaritone() { return tuning().baritone; }

function currentOpen() { return tuning().open; }
function currentMidi() { return tuning().midi; }
function currentStringNames() { return tuning().stringNames; }

function mod12(n) { return ((n % 12) + 12) % 12; }

/**
 * Which standard-GCEA root to look up in order to hear `displayRoot` in the
 * current tuning. A shape voicing F in GCEA sounds C on a baritone, so asking
 * for C looks up F.
 * @param {number} displayRoot - the key the player picked (0-11)
 * @returns {number} the root to search the standard voicing cache for
 */
function standardRootFor(displayRoot) {
  return mod12(displayRoot + tuning().offset);
}

/**
 * The inverse: what a note from a standard-tuning voicing actually sounds as
 * in the current tuning, for labelling diagrams.
 * @param {number} standardNote - a pitch class from a generated voicing
 * @returns {number} the pitch class that sounds
 */
function soundingNote(standardNote) {
  return mod12(standardNote - tuning().offset);
}

// Standard tuning noteAt — used by voicing generator (always GCEA)
function noteAt(str, fret) {
  return (OPEN[str] + fret) % 12;
}

// Current-tuning noteAt — used by identifier and display
function noteAtCurrent(str, fret) {
  return (currentOpen()[str] + fret) % 12;
}

// Chord type definitions — intervals from root
// commonality: higher = more likely to be the intended chord (1-10 scale)
const CHORD_TYPES = [
  { id: "maj",    label: "maj",      tones: [0, 4, 7],    commonality: 10 },
  { id: "min",    label: "min",      tones: [0, 3, 7],    commonality: 10 },
  { id: "7",      label: "7",        tones: [0, 4, 7, 10], commonality: 9 },
  { id: "m7",     label: "m7",       tones: [0, 3, 7, 10], commonality: 8 },
  { id: "maj7",   label: "maj7",     tones: [0, 4, 7, 11], commonality: 8 },
  { id: "sus4",   label: "sus4",     tones: [0, 5, 7],    commonality: 7 },
  { id: "sus2",   label: "sus2",     tones: [0, 2, 7],    commonality: 6 },
  { id: "6",      label: "6",        tones: [0, 4, 7, 9],  commonality: 6 },
  { id: "add9",   label: "add9",     tones: [0, 4, 7, 2],  commonality: 6 },
  { id: "m9",     label: "m9",       tones: [0, 3, 7, 10, 2], commonality: 5 },
  { id: "9",      label: "9",        tones: [0, 4, 7, 10, 2], commonality: 5 },
  { id: "maj9",   label: "maj9",     tones: [0, 4, 7, 11, 2], commonality: 5 },
  { id: "mmaj7",  label: "m(maj7)",  tones: [0, 3, 7, 11], commonality: 4 },
  { id: "7sus4",  label: "7sus4",    tones: [0, 5, 7, 10], commonality: 4 },
  { id: "69",     label: "6/9",      tones: [0, 4, 7, 9, 2], commonality: 3 },
  { id: "add11",  label: "add11",    tones: [0, 4, 5, 7],  commonality: 3 },
];

// Interval display names for the identifier page
const INTERVAL_NAMES = {
  0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
  6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7",
};

function isMixed(frets) {
  return frets.some(f => f === 0) && frets.some(f => f > 0);
}

// Generate all voicings for a given root
function generateVoicings(root) {
  const results = [];
  const seen = new Set();

  for (let s0 = 0; s0 <= 12; s0++)
  for (let s1 = 0; s1 <= 12; s1++)
  for (let s2 = 0; s2 <= 12; s2++)
  for (let s3 = 0; s3 <= 12; s3++) {
    const frets = [s0, s1, s2, s3];
    const pressed = frets.filter(f => f > 0);
    if (pressed.length > 0) {
      const lo = Math.min(...pressed);
      const hi = Math.max(...pressed);
      if (hi - lo > 3) continue;
    }
    const notes = frets.map((f, i) => noteAt(i, f));
    const ivs = new Set(notes.map(n => ((n - root) + 12) % 12));
    if (!ivs.has(0)) continue;

    for (const ct of CHORD_TYPES) {
      const full = new Set(ct.tones);
      // Extended chords: the perfect 5th is the conventional omission on
      // a 4-string instrument, so it becomes optional.
      const required = ct.tones.length > 4
        ? new Set(ct.tones.filter(t => t !== 7))
        : full;
      if (![...required].every(r => ivs.has(r))) continue;
      const allOk = notes.every(n => full.has(((n - root) + 12) % 12));
      if (!allOk) continue;
      const key = ct.id + ":" + frets.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ type: ct.id, label: ct.label, frets: [...frets], notes });
    }
  }
  return results;
}

// Cache voicings per root with LRU eviction
// Max 8 entries: covers all common keys without unbounded growth
const VOICING_CACHE_MAX = 8;
const voicingCache = {
  _order: [], // Track access order for LRU
  _data: {}, // Actual cached data
};

function getVoicings(root) {
  // If cached, move to end of access order (most recently used)
  if (voicingCache._data[root]) {
    const idx = voicingCache._order.indexOf(root);
    if (idx > -1) {
      voicingCache._order.splice(idx, 1);
    }
    voicingCache._order.push(root);
    return voicingCache._data[root];
  }

  // Generate and cache
  const voicings = generateVoicings(root);
  voicingCache._data[root] = voicings;
  voicingCache._order.push(root);

  // Evict oldest if over limit
  while (voicingCache._order.length > VOICING_CACHE_MAX) {
    const oldest = voicingCache._order.shift();
    delete voicingCache._data[oldest];
  }

  return voicings;
}

// ═══════════════════════════════════════════════════════════
// CHORD IDENTIFICATION (reverse lookup)
// ═══════════════════════════════════════════════════════════

/**
 * Given 4 fret positions, identify all matching chord names.
 * Tuning-aware: uses currentOpen() for note calculation.
 * Returns an array of { root, rootName, type, label, intervals, bassNote,
 *   isSlash } sorted best-match-first.
 */
function identifyChord(frets) {
  const open = currentOpen();
  const notes = frets.map((f, i) => (open[i] + f) % 12);
  const uniqueNotes = [...new Set(notes)];
  const results = [];

  // Bass note: the lowest *sounding* string, which depends on the octave each
  // open string is tuned to, not just its pitch class. In re-entrant tunings
  // (standard high-G, baritone high-D) the lowest string is not string 0.
  const pitches = currentMidi();
  let bassIdx = 0;
  let bassPitch = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = pitches[i] + frets[i];
    if (p < bassPitch) { bassPitch = p; bassIdx = i; }
  }
  const bassNote = notes[bassIdx];

  for (let root = 0; root < 12; root++) {
    const intervals = new Set(uniqueNotes.map(n => ((n - root) + 12) % 12));
    if (!intervals.has(0)) continue;

    for (const ct of CHORD_TYPES) {
      const full = new Set(ct.tones);
      const required = ct.tones.length > 4
        ? new Set(ct.tones.filter(t => t !== 7))
        : full;

      if (![...required].every(t => intervals.has(t))) continue;
      if (![...intervals].every(t => full.has(t))) continue;

      const rn = rootNoteName(root);
      const chordLabel = rn + (ct.label === "maj" ? "" : ct.label);
      const isSlash = bassNote !== root;
      const bassName = noteName(bassNote, root);

      results.push({
        root,
        rootName: rn,
        type: ct,
        label: isSlash ? chordLabel + "/" + bassName : chordLabel,
        displayLabel: chordLabel,
        intervals: ct.tones.map(t => INTERVAL_NAMES[t]).join(" "),
        bassNote,
        bassName,
        isSlash,
      });
    }
  }

  // Sort: non-slash before slash, more common first, fewer tones first, then alphabetical
  results.sort((a, b) => {
    if (a.isSlash !== b.isSlash) return a.isSlash ? 1 : -1;
    // More common chord types first (higher commonality)
    const commonalityDiff = b.type.commonality - a.type.commonality;
    if (commonalityDiff !== 0) return commonalityDiff;
    // Fewer tones (simpler) first
    const tonesDiff = a.type.tones.length - b.type.tones.length;
    if (tonesDiff !== 0) return tonesDiff;
    return a.label.localeCompare(b.label);
  });

  return results;
}

// ═══════════════════════════════════════════════════════════
// SCALE TONES
// ═══════════════════════════════════════════════════════════

// Major and natural minor scale intervals (in semitones from root)
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

/**
 * Get the scale tones for a given chord name
 * Returns the notes in the parent scale of the chord
 * @param {string} chordName - The chord name (e.g., "C", "G7", "Am")
 * @returns {Array} Array of note names in the scale
 */
function getScaleTones(chordName) {
  if (!chordName) return [];

  // Extract root from chord name
  const rootMatch = chordName.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];

  const rootName = rootMatch[1];
  const root = NOTE_NAMES.indexOf(rootName) !== -1 
    ? NOTE_NAMES.indexOf(rootName)
    : NOTE_NAMES_FLAT.indexOf(rootName);

  if (root === -1) return [];

  // Determine if minor based on chord name
  const chordType = chordName.slice(rootName.length);
  const isMinor = /^m(?!aj)/.test(chordType);

  // Get scale intervals
  const scaleIntervals = isMinor ? MINOR_SCALE : MAJOR_SCALE;

  // Map intervals to note names, using the same naming convention as the root
  const useFlats = FLAT_KEYS.has(root);
  const noteNames = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES;

  return scaleIntervals.slice(0, 7).map(interval => {
    const noteIndex = (root + interval) % 12;
    return noteNames[noteIndex];
  });
}

// ═══════════════════════════════════════════════════════════
// CHORD PROGRESSION SUGGESTIONS
// ═══════════════════════════════════════════════════════════

// Common chord progression patterns (in Roman numeral analysis)
// Each pattern is an array of scale degrees relative to the tonic (1 = I, 2 = ii, etc.)
const PROGRESSION_PATTERNS = [
  { name: 'I-IV-V',    pattern: [1, 4, 5] },  // Blues, Rock
  { name: 'I-V-vi-IV', pattern: [1, 5, 6, 4] }, // Pop, Rock
  { name: 'ii-V-I',    pattern: [2, 5, 1] },  // Jazz, common
  { name: 'I-vi-ii-V', pattern: [1, 6, 2, 5] }, // Circle progression
  { name: 'I-V-vi-iii-IV', pattern: [1, 5, 6, 3, 4] }, // 50s doo-wop
  { name: 'vi-ii-V-I', pattern: [6, 2, 5, 1] }, // Jazz turnaround
  { name: 'I-ii-iii-IV', pattern: [1, 2, 3, 4] }, // Ascending
  { name: 'I-IV-ii-V', pattern: [1, 4, 2, 5] }, // Common
];

// Map scale degree to chord type for progression display
// In major: 1=maj, 2=min, 3=min, 4=maj, 5=maj, 6=min, 7=dim
// In minor: 1=min, 2=dim, 3=maj, 4=min, 5=min, 6=maj, 7=maj
function getChordTypeForDegree(degree, isMinor) {
  if (isMinor) {
    // Natural minor scale
    const minorTypes = [null, 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
    return minorTypes[degree] || 'maj';
  } else {
    // Major scale
    const majorTypes = [null, 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
    return majorTypes[degree] || 'maj';
  }
}

/**
 * Get chord progression suggestions for a given root and chord type
 * @param {number} root - The root note (0-11)
 * @param {string} typeId - The chord type id
 * @returns {Array} Array of progression suggestions, each with name and chords
 */
function getProgressionSuggestions(root, typeId) {
  const isMinor = typeId === 'min' || typeId === 'm7' || typeId === 'm9' || typeId === 'mmaj7';
  const suggestions = [];

  for (const pattern of PROGRESSION_PATTERNS) {
    const chords = pattern.pattern.map(degree => {
      const chordRoot = (root + degree - 1) % 12;
      const chordType = getChordTypeForDegree(degree, isMinor);
      const rootName = rootNoteName(chordRoot);
      const label = chordType === 'maj' ? rootName : rootName + chordType;
      return label;
    });
    suggestions.push({
      name: pattern.name,
      chords: chords
    });
  }

  return suggestions;
}

// ═══════════════════════════════════════════════════════════
// STRUMMING PATTERNS
// ═══════════════════════════════════════════════════════════

// Common strumming patterns (D = Down, U = Up, - = rest)
const STRUMMING_PATTERNS = [
  { name: 'Basic',      pattern: ['D', 'D', 'U', 'U', 'D'] },
  { name: 'Common',     pattern: ['D', 'D', 'D', 'U', 'D'] },
  { name: 'Island',     pattern: ['D', 'D', 'U', '-', 'U', 'D'] },
  { name: 'Folk',       pattern: ['D', 'U', 'D', 'U', 'D'] },
  { name: 'Reggae',     pattern: ['D', '-', '-', 'U', 'D', '-', 'U'] },
  { name: 'Ska',        pattern: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'] },
  { name: 'Ballad',     pattern: ['D', '-', 'D', '-', 'U', '-', 'D'] },
  { name: 'Upbeat',     pattern: ['D', 'D', 'U', 'D', 'U', 'D'] },
];

/**
 * Get strumming pattern suggestions
 * @returns {Array} Array of strumming patterns with name and pattern
 */
function getStrummingPatterns() {
  return STRUMMING_PATTERNS;
}
