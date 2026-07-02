// ═══════════════════════════════════════════════════════════
// MUSIC THEORY ENGINE (resonator guitar)
// Depends on: instrument.js (tuning, stringCount, currentOpen, currentMidi,
// currentStringNames, droneStringSubset, MAX_FRET)
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
  return frets.some(f => f === 0) && frets.some(f => typeof f === "number" && f > 0);
}

function fretsKey(frets) {
  return frets.map(f => (f === null ? "x" : f)).join(",");
}

// ═══════════════════════════════════════════════════════════
// VOICING GENERATION — position-window search
// ═══════════════════════════════════════════════════════════

const SPAN = 4; // max fret stretch across fretted strings in one voicing

// Per-string candidate frets for a chord-tone set, within [base, base+span].
// Always considers open (0) if it's a chord tone. Falls back to a forced
// mute (null) only when nothing in range matches — keeps mutes rare and
// targeted rather than combinatorially explosive.
function candidateFretsForString(stringIdx, base, span, chordToneSet, root) {
  const openPitch = currentOpen()[stringIdx];
  const cands = [];
  const openIv = ((openPitch - root) % 12 + 12) % 12;
  if (chordToneSet.has(openIv)) cands.push(0);

  const lo = Math.max(1, base);
  const hi = Math.min(MAX_FRET, base + span);
  const fretted = [];
  for (let f = lo; f <= hi; f++) {
    const iv = ((openPitch + f - root) % 12 + 12) % 12;
    if (chordToneSet.has(iv)) fretted.push(f);
  }
  // Cap branching: open (if any) plus at most the two lowest fretted matches.
  cands.push(...fretted.slice(0, 2));

  if (cands.length === 0) cands.push(null);
  return cands;
}

function cartesian(arrays) {
  return arrays.reduce((acc, arr) => {
    const out = [];
    for (const a of acc) for (const v of arr) out.push([...a, v]);
    return out;
  }, [[]]);
}

// Extended chords (>4 tones): the 5th is the conventional first omission
// when strings run out.
function requiredTonesFull(ct) {
  return ct.tones.length > 4 ? ct.tones.filter(t => t !== 7) : ct.tones;
}

// The base sweep independently lets each string pick among its own small
// candidate set, which combinatorially yields many near-duplicate shapes
// at (or near) the same neck position. Collapse to the single best voicing
// per (type, position, droneFit) so browsing stays to one shape per spot
// on the neck, while still keeping distinct up-the-neck positions.
function collapseByPosition(results, root) {
  const best = new Map();
  for (const v of results) {
    const pressed = v.frets.filter(f => typeof f === "number" && f > 0);
    const position = pressed.length ? Math.min(...pressed) : 0;
    const key = `${v.type}:${position}:${v.droneFit || ""}`;
    const existing = best.get(key);
    if (!existing || compareVoicings(v, existing, root) < 0) {
      best.set(key, v);
    }
  }
  return [...best.values()];
}

// Full 6-string / barre-slide search: every string is a candidate, and
// (per the uke app's original convention) every sounding note must be a
// chord tone — no "clashing drone" concept here.
function generateVoicingsFull(root) {
  const n = stringCount();
  const seen = new Set();
  const results = [];

  for (const ct of CHORD_TYPES) {
    const chordToneSet = new Set(ct.tones);
    const required = new Set(requiredTonesFull(ct));

    for (let base = 0; base <= MAX_FRET; base++) {
      const perString = [];
      for (let i = 0; i < n; i++) perString.push(candidateFretsForString(i, base, SPAN, chordToneSet, root));

      for (const frets of cartesian(perString)) {
        const ivsPresent = new Set();
        frets.forEach((f, i) => {
          if (f === null) return;
          ivsPresent.add(((currentOpen()[i] + f - root) % 12 + 12) % 12);
        });
        if (![...required].every(t => ivsPresent.has(t))) continue;

        const key = ct.id + ":" + fretsKey(frets);
        if (seen.has(key)) continue;
        seen.add(key);

        const notes = frets.map((f, i) => (f === null ? null : (currentOpen()[i] + f) % 12));
        results.push({ type: ct.id, label: ct.label, frets, notes, mode: "full", droneFit: null, stringSubset: null });
      }
    }
  }
  return collapseByPosition(results, root);
}

// Fingerstyle drone search: only `subset` strings are fretted; the rest
// ring open as drones regardless of chord fit. Voicings where the drones
// happen to be chord tones are tagged droneFit:'match'; others 'clash' —
// both are generated and ranked, not filtered.
function generateVoicingsDrone(root, includeString1) {
  const n = stringCount();
  const open = currentOpen();
  const subset = droneStringSubset(includeString1);
  const droneIdx = [...Array(n).keys()].filter(i => !subset.includes(i));
  const seen = new Set();
  const results = [];

  for (const ct of CHORD_TYPES) {
    const chordToneSet = new Set(ct.tones);
    const droneIvs = droneIdx.map(i => ((open[i] - root) % 12 + 12) % 12);
    const droneIvSet = new Set(droneIvs);

    // Priority tone-dropping when the fretted subset is too small to carry
    // every chord tone (drone-supplied tones count for free). Root and the
    // 3rd are never dropped.
    const third = ct.tones.includes(4) ? 4 : (ct.tones.includes(3) ? 3 : null);
    const protectedSet = new Set([0, third].filter(t => t !== null));
    let need = ct.tones.filter(t => !droneIvSet.has(t));
    const dropOrder = [7, 2, 9, 5, 10, 11]; // 5th, then extensions, then 7th
    for (const t of dropOrder) {
      if (need.length <= subset.length) break;
      if (protectedSet.has(t)) continue;
      need = need.filter(x => x !== t);
    }
    const neededSet = new Set(need);
    const droneFit = droneIvs.every(iv => chordToneSet.has(iv)) ? "match" : "clash";

    for (let base = 0; base <= MAX_FRET; base++) {
      const perString = subset.map(i => candidateFretsForString(i, base, SPAN, chordToneSet, root));

      for (const combo of cartesian(perString)) {
        const ivsPresent = new Set(droneIvs);
        combo.forEach((f, k) => {
          if (f === null) return;
          const i = subset[k];
          ivsPresent.add(((open[i] + f - root) % 12 + 12) % 12);
        });
        if (!ivsPresent.has(0)) continue; // root must sound somewhere
        if (![...neededSet].every(t => ivsPresent.has(t))) continue;

        const frets = new Array(n).fill(null);
        droneIdx.forEach(i => { frets[i] = 0; });
        subset.forEach((i, k) => { frets[i] = combo[k]; });

        const key = ct.id + ":" + fretsKey(frets);
        if (seen.has(key)) continue;
        seen.add(key);

        const notes = frets.map((f, i) => (f === null ? null : (open[i] + f) % 12));
        results.push({ type: ct.id, label: ct.label, frets, notes, mode: "drone", droneFit, stringSubset: subset.slice() });
      }
    }
  }
  return collapseByPosition(results, root);
}

// Cache voicings per tuning+mode+root(+string-1 state) with LRU eviction.
const VOICING_CACHE_MAX = 24;
const voicingCache = { _order: [], _data: {} };

function getVoicings(root, opts = {}) {
  const mode = opts.mode === "full" ? "full" : "drone";
  const includeString1 = opts.includeString1 !== false;
  const key = `${tuning().id}:${mode}:${mode === "drone" ? includeString1 : "-"}:${root}`;

  if (voicingCache._data[key]) {
    const idx = voicingCache._order.indexOf(key);
    if (idx > -1) voicingCache._order.splice(idx, 1);
    voicingCache._order.push(key);
    return voicingCache._data[key];
  }

  const voicings = mode === "full" ? generateVoicingsFull(root) : generateVoicingsDrone(root, includeString1);
  voicingCache._data[key] = voicings;
  voicingCache._order.push(key);

  while (voicingCache._order.length > VOICING_CACHE_MAX) {
    const oldest = voicingCache._order.shift();
    delete voicingCache._data[oldest];
  }

  return voicings;
}

// ── Ranking ─────────────────────────────────────────────────

function isUniformShape(frets) {
  const vals = frets.filter(f => f !== null);
  if (vals.length === 0) return false;
  return vals.every(v => v === vals[0]);
}

function voicingSortKey(v, root) {
  const midi = currentMidi();
  const open = currentOpen();
  let bassIdx = -1, bassPitch = Infinity;
  v.frets.forEach((f, i) => {
    if (f === null) return;
    const p = midi[i] + f;
    if (p < bassPitch) { bassPitch = p; bassIdx = i; }
  });
  const bassIsRoot = bassIdx >= 0 && (((open[bassIdx] + v.frets[bassIdx] - root) % 12 + 12) % 12) === 0;
  const uniform = isUniformShape(v.frets); // straight barre / all-open — idiomatic on an open tuning
  const openCount = v.frets.filter(f => f === 0).length;
  const muteCount = v.frets.filter(f => f === null).length;
  const pressed = v.frets.filter(f => typeof f === "number" && f > 0);
  const span = pressed.length ? Math.max(...pressed) - Math.min(...pressed) : 0;
  const lowestFret = pressed.length ? Math.min(...pressed) : 0;
  return { bassIsRoot, uniform, openCount, muteCount, span, lowestFret };
}

// Best-first comparator: drone-match before drone-clash, then bass root,
// straight-barre/all-open shapes, more open strings, fewer mutes, smaller
// span, lower position.
function compareVoicings(a, b, root) {
  if (a.droneFit !== b.droneFit) {
    if (a.droneFit === "match") return -1;
    if (b.droneFit === "match") return 1;
  }
  const ka = voicingSortKey(a, root), kb = voicingSortKey(b, root);
  if (ka.bassIsRoot !== kb.bassIsRoot) return ka.bassIsRoot ? -1 : 1;
  if (ka.uniform !== kb.uniform) return ka.uniform ? -1 : 1;
  if (ka.openCount !== kb.openCount) return kb.openCount - ka.openCount;
  if (ka.muteCount !== kb.muteCount) return ka.muteCount - kb.muteCount;
  if (ka.span !== kb.span) return ka.span - kb.span;
  return ka.lowestFret - kb.lowestFret;
}

// ═══════════════════════════════════════════════════════════
// CHORD IDENTIFICATION (reverse lookup)
// ═══════════════════════════════════════════════════════════

/**
 * Given N fret positions (null = muted string), identify all matching
 * chord names. Tuning-aware and mode-agnostic — reads exactly what's
 * fretted/muted regardless of Atlas's drone/full voicing mode.
 */
function identifyChord(frets) {
  const open = currentOpen();
  const midi = currentMidi();
  const n = stringCount();

  const notes = [];
  let bassIdx = -1, bassPitch = Infinity;
  for (let i = 0; i < n; i++) {
    const f = frets[i];
    if (f === null || f === undefined) continue;
    notes.push((open[i] + f) % 12);
    const p = midi[i] + f;
    if (p < bassPitch) { bassPitch = p; bassIdx = i; }
  }
  if (notes.length === 0) return [];

  const uniqueNotes = [...new Set(notes)];
  const bassNote = (open[bassIdx] + frets[bassIdx]) % 12;
  const results = [];

  for (let root = 0; root < 12; root++) {
    const intervals = new Set(uniqueNotes.map(nn => ((nn - root) + 12) % 12));
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

  results.sort((a, b) => {
    if (a.isSlash !== b.isSlash) return a.isSlash ? 1 : -1;
    const commonalityDiff = b.type.commonality - a.type.commonality;
    if (commonalityDiff !== 0) return commonalityDiff;
    const tonesDiff = a.type.tones.length - b.type.tones.length;
    if (tonesDiff !== 0) return tonesDiff;
    return a.label.localeCompare(b.label);
  });

  return results;
}

// ═══════════════════════════════════════════════════════════
// SCALE TONES
// ═══════════════════════════════════════════════════════════

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 12];

/**
 * Get the scale tones for a given chord name
 * @param {string} chordName - The chord name (e.g., "C", "G7", "Am")
 * @returns {Array} Array of note names in the scale
 */
function getScaleTones(chordName) {
  if (!chordName) return [];

  const rootMatch = chordName.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];

  const rootName = rootMatch[1];
  const root = NOTE_NAMES.indexOf(rootName) !== -1
    ? NOTE_NAMES.indexOf(rootName)
    : NOTE_NAMES_FLAT.indexOf(rootName);

  if (root === -1) return [];

  const chordType = chordName.slice(rootName.length);
  const isMinor = /^m(?!aj)/.test(chordType);

  const scaleIntervals = isMinor ? MINOR_SCALE : MAJOR_SCALE;

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

const PROGRESSION_PATTERNS = [
  { name: 'I-IV-V',    pattern: [1, 4, 5] },
  { name: 'I-V-vi-IV', pattern: [1, 5, 6, 4] },
  { name: 'ii-V-I',    pattern: [2, 5, 1] },
  { name: 'I-vi-ii-V', pattern: [1, 6, 2, 5] },
  { name: 'I-V-vi-iii-IV', pattern: [1, 5, 6, 3, 4] },
  { name: 'vi-ii-V-I', pattern: [6, 2, 5, 1] },
  { name: 'I-ii-iii-IV', pattern: [1, 2, 3, 4] },
  { name: 'I-IV-ii-V', pattern: [1, 4, 2, 5] },
];

function getChordTypeForDegree(degree, isMinor) {
  if (isMinor) {
    const minorTypes = [null, 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
    return minorTypes[degree] || 'maj';
  } else {
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
    suggestions.push({ name: pattern.name, chords });
  }

  return suggestions;
}

// ═══════════════════════════════════════════════════════════
// STRUMMING / SLIDE PATTERNS
// ═══════════════════════════════════════════════════════════

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
