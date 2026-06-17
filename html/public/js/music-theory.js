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

// GCEA open-string pitches (semitones, C = 0)
const OPEN = [7, 0, 4, 9]; // G C E A (high-G)
const OPEN_LOWG = [-5, 0, 4, 9]; // g C E A (low-G, octave lower)
const STRING_NAMES_UKE = ["G", "C", "E", "A"];
const STRING_NAMES_LOWG = ["g", "C", "E", "A"];

// DGBE baritone — same intervals, a perfect 4th (5 semitones) lower
const OPEN_BARI = [2, 7, 11, 4]; // D G B E
const STRING_NAMES_BARI = ["D", "G", "B", "E"];
const BARI_OFFSET = 5;

let currentTuning = 'standard';

function setTuning(t) {
  currentTuning = t;
  try { localStorage.setItem('uca-tuning', t); } catch (e) {}
}

function isLowG() { return currentTuning === 'lowg'; }
function isBaritone() { return currentTuning === 'baritone'; }

function currentOpen() {
  if (isBaritone()) return OPEN_BARI;
  if (isLowG()) return OPEN_LOWG;
  return OPEN;
}

function currentStringNames() {
  if (isBaritone()) return STRING_NAMES_BARI;
  if (isLowG()) return STRING_NAMES_LOWG;
  return STRING_NAMES_UKE;
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
const CHORD_TYPES = [
  { id: "maj",    label: "maj",      tones: [0, 4, 7] },
  { id: "min",    label: "min",      tones: [0, 3, 7] },
  { id: "sus2",   label: "sus2",     tones: [0, 2, 7] },
  { id: "sus4",   label: "sus4",     tones: [0, 5, 7] },
  { id: "add9",   label: "add9",     tones: [0, 4, 7, 2] },
  { id: "6",      label: "6",        tones: [0, 4, 7, 9] },
  { id: "69",     label: "6/9",      tones: [0, 4, 7, 9, 2] },
  { id: "7",      label: "7",        tones: [0, 4, 7, 10] },
  { id: "maj7",   label: "maj7",     tones: [0, 4, 7, 11] },
  { id: "9",      label: "9",        tones: [0, 4, 7, 10, 2] },
  { id: "maj9",   label: "maj9",     tones: [0, 4, 7, 11, 2] },
  { id: "m7",     label: "m7",       tones: [0, 3, 7, 10] },
  { id: "mmaj7",  label: "m(maj7)",  tones: [0, 3, 7, 11] },
  { id: "m9",     label: "m9",       tones: [0, 3, 7, 10, 2] },
  { id: "7sus4",  label: "7sus4",    tones: [0, 5, 7, 10] },
  { id: "add11",  label: "add11",    tones: [0, 4, 5, 7] },
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

// Cache voicings per root
const voicingCache = {};
function getVoicings(root) {
  if (!voicingCache[root]) voicingCache[root] = generateVoicings(root);
  return voicingCache[root];
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

  // Bass note: use approximate MIDI pitches for the current tuning.
  // Standard GCEA: G4=55, C4=48, E4=52, A4=57
  // Baritone DGBE: D3=50, G3=43, B3=47, E4=52
  const pitches = isBaritone() ? [50, 43, 47, 52] : [55, 48, 52, 57];
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

  // Sort: non-slash before slash, fewer tones (simpler) first, then alphabetical
  results.sort((a, b) => {
    if (a.isSlash !== b.isSlash) return a.isSlash ? 1 : -1;
    const diff = a.type.tones.length - b.type.tones.length;
    if (diff !== 0) return diff;
    return a.label.localeCompare(b.label);
  });

  return results;
}
