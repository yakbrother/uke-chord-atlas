// ═══════════════════════════════════════════════════════════
// FRETBOARD MODEL — pure rules behind the Identifier's fretboard
// (no DOM), so they can be unit tested under Node.
//
// State is an array of frets, one per string (low index = left
// column): 0 = open, n > 0 = finger on fret n. Every function
// returns a new array and never mutates its input.
// ═══════════════════════════════════════════════════════════

const FRETBOARD_GEOMETRY = (() => {
  const g = {
    strings: 4,
    maxFret: 12,
    leftMargin: 42,  // room for fret numbers
    topMargin: 36,   // room for open-string note labels
    cellW: 52,       // horizontal spacing between strings
    cellH: 38,       // vertical spacing between frets
    rightPad: 20,
    bottomPad: 28,   // room for string names
  };
  g.gridW = (g.strings - 1) * g.cellW;
  g.gridH = g.maxFret * g.cellH;
  g.W = g.leftMargin + g.gridW + g.rightPad;
  g.H = g.topMargin + g.gridH + g.bottomPad;
  g.openY = g.topMargin - 16; // centre of the open-string row
  return g;
})();

const fbStringX = (s, g = FRETBOARD_GEOMETRY) => g.leftMargin + s * g.cellW;
const fbFretY = (f, g = FRETBOARD_GEOMETRY) => g.topMargin + (f - 0.5) * g.cellH; // centre of fret f >= 1

/**
 * Map a point in SVG coordinates to a cell { s, f } (f = 0 is the open row).
 * Returns null when the point is off the board, unless `clamp` is set, in
 * which case it snaps to the nearest cell (used while dragging).
 */
function fbCellAt(x, y, clamp, g = FRETBOARD_GEOMETRY) {
  let s = Math.round((x - g.leftMargin) / g.cellW);
  if (clamp) {
    s = Math.min(g.strings - 1, Math.max(0, s));
  } else {
    if (s < 0 || s >= g.strings || Math.abs(x - fbStringX(s, g)) > g.cellW / 2) return null;
    if (y < g.openY - 16 || y > g.topMargin + g.gridH) return null;
  }
  const f = y < g.topMargin ? 0 : Math.min(g.maxFret, Math.max(1, Math.ceil((y - g.topMargin) / g.cellH)));
  return { s, f };
}

/** Is there a finger dot at this cell? */
function fbIsDot(frets, cell) {
  return !!cell && cell.f > 0 && frets[cell.s] === cell.f;
}

/** Tap on a dot: remove it (the string goes back to open). */
function fbRemove(frets, s) {
  const next = frets.slice();
  next[s] = 0;
  return next;
}

/** Tap on an empty cell: put a finger there (f = 0 sets the string open). */
function fbPlace(frets, s, f) {
  const next = frets.slice();
  next[s] = f;
  return next;
}

/**
 * Move the dot currently at `from` ({ s, f }) towards `to` ({ s, f }).
 * A string that already has a finger can't take another, so a sideways
 * move onto an occupied string keeps the dot on its own string and only
 * changes the fret. Moving to f = 0 (above the nut) leaves the string open.
 * Returns { frets, at } where `at` is the dot's new cell.
 */
function fbDragTo(frets, from, to) {
  let s = to.s;
  if (s !== from.s && frets[s] > 0) s = from.s;
  if (s === from.s && to.f === from.f) return { frets: frets.slice(), at: { s, f: to.f } };
  const next = frets.slice();
  if (s !== from.s) next[from.s] = 0; // the finger leaves its old string
  next[s] = to.f;
  return { frets: next, at: { s, f: to.f } };
}

/** Nearest string from `s` in direction `step` (±1) with no finger on it, or -1. */
function fbNextFreeString(frets, s, step) {
  let t = s + step;
  while (t >= 0 && t < frets.length && frets[t] > 0) t += step;
  return t >= 0 && t < frets.length ? t : -1;
}

/**
 * Keyboard control for the dot on string `s`.
 * Returns { frets, focus } (focus = string whose dot should keep focus, or
 * null when the dot was removed), or null when the key does nothing.
 */
function fbKeyAction(frets, s, key, maxFret = FRETBOARD_GEOMETRY.maxFret) {
  const f = frets[s];
  if (!(f > 0)) return null;
  switch (key) {
    case 'Delete': case 'Backspace': case 'Enter': case ' ':
      return { frets: fbRemove(frets, s), focus: null };
    case 'ArrowUp': {
      const next = fbPlace(frets, s, f - 1); // fret 1 → open
      return { frets: next, focus: f - 1 > 0 ? s : null };
    }
    case 'ArrowDown':
      return { frets: fbPlace(frets, s, Math.min(maxFret, f + 1)), focus: s };
    case 'ArrowLeft': case 'ArrowRight': {
      const t = fbNextFreeString(frets, s, key === 'ArrowLeft' ? -1 : 1);
      if (t < 0) return { frets: frets.slice(), focus: s }; // nowhere free to go
      const next = fbRemove(frets, s);
      next[t] = f;
      return { frets: next, focus: t };
    }
    default:
      return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FRETBOARD_GEOMETRY, fbStringX, fbFretY, fbCellAt, fbIsDot, fbRemove, fbPlace,
    fbDragTo, fbNextFreeString, fbKeyAction,
  };
}
