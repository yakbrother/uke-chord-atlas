// ═══════════════════════════════════════════════════════════
// INSTRUMENT & TUNING MODEL (resonator guitar)
// Centralizes everything instrument-specific so music-theory.js,
// diagram.js, and identify.js read from here instead of hardcoding
// string counts or pitch classes.
// ═══════════════════════════════════════════════════════════

// Semitone pitch classes (C = 0) and absolute MIDI, low string -> high string.
const TUNINGS = {
  openD: {
    id: 'openD',
    label: 'Open D',
    strings: 6,
    // D2  A2  D3  F#3 A3  D4
    open: [2, 9, 2, 6, 9, 2],
    midi: [38, 45, 50, 54, 57, 62],
    stringNames: ['D', 'A', 'D', 'F#', 'A', 'D'],
  },
  openDm: {
    id: 'openDm',
    label: 'Open Dm',
    strings: 6,
    // D2  A2  D3  F3  A3  D4
    open: [2, 9, 2, 5, 9, 2],
    midi: [38, 45, 50, 53, 57, 62],
    stringNames: ['D', 'A', 'D', 'F', 'A', 'D'],
  },
};

const MAX_FRET = 19;
const DEFAULT_TUNING = 'openD';

let currentTuning = DEFAULT_TUNING;

function setTuning(id) {
  currentTuning = TUNINGS[id] ? id : DEFAULT_TUNING;
  try { localStorage.setItem('rca-tuning', currentTuning); } catch (e) { /* ignore */ }
}

function tuning() { return TUNINGS[currentTuning]; }
function stringCount() { return tuning().strings; }
function currentOpen() { return tuning().open; }
function currentMidi() { return tuning().midi; }
function currentStringNames() { return tuning().stringNames; }

function initTuning() {
  try {
    const s = localStorage.getItem('rca-tuning');
    if (s && TUNINGS[s]) currentTuning = s;
  } catch (e) { /* localStorage may be unavailable */ }
}

// ═══════════════════════════════════════════════════════════
// FINGERSTYLE DRONE STRING SUBSET
// Default playing style: fret strings 4-3-2(-1), leave 6 & 5 (and 1,
// if excluded) ringing open as drones. Indices are low(0) -> high(n-1).
// ═══════════════════════════════════════════════════════════

function droneStringSubset(includeString1) {
  const n = stringCount();
  return includeString1 ? [n - 4, n - 3, n - 2, n - 1] : [n - 4, n - 3, n - 2];
}
