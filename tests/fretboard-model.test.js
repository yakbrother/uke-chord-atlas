// Unit tests for the Identifier fretboard's tap / drag / keyboard rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = {};
  vm.createContext(ctx);
  const file = path.join(__dirname, '..', 'html', 'public', 'js', 'fretboard-model.js');
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.M = { FRETBOARD_GEOMETRY, fbStringX, fbFretY, fbCellAt, fbIsDot, fbRemove, fbPlace, fbDragTo, fbNextFreeString, fbKeyAction };', ctx, { filename: 'fretboard-model.js' });
  return ctx.M;
}
const M = load();
const plain = (v) => JSON.parse(JSON.stringify(v));
const G = M.FRETBOARD_GEOMETRY;

test('cell lookup: string centres, fret rows, the open row and off-board points', () => {
  const at = (s, f) => plain(M.fbCellAt(M.fbStringX(s), f === 0 ? G.openY : M.fbFretY(f), false));
  assert.deepEqual(at(0, 3), { s: 0, f: 3 });
  assert.deepEqual(at(3, 12), { s: 3, f: 12 });
  assert.deepEqual(at(2, 0), { s: 2, f: 0 });
  // Just inside a fret's lower edge still belongs to that fret
  assert.deepEqual(plain(M.fbCellAt(M.fbStringX(1), G.topMargin + 2 * G.cellH - 1, false)), { s: 1, f: 2 });
  // Off the board
  assert.equal(M.fbCellAt(M.fbStringX(0) - G.cellW, M.fbFretY(2), false), null);
  assert.equal(M.fbCellAt(M.fbStringX(3) + G.cellW, M.fbFretY(2), false), null);
  assert.equal(M.fbCellAt(M.fbStringX(1), G.topMargin + G.gridH + 10, false), null);
  assert.equal(M.fbCellAt(M.fbStringX(1), 0, false), null);
});

test('clamped lookup snaps drags that wander off the board', () => {
  assert.deepEqual(plain(M.fbCellAt(-500, M.fbFretY(4), true)), { s: 0, f: 4 });
  assert.deepEqual(plain(M.fbCellAt(5000, M.fbFretY(4), true)), { s: 3, f: 4 });
  assert.deepEqual(plain(M.fbCellAt(M.fbStringX(2), 99999, true)), { s: 2, f: 12 });
  assert.deepEqual(plain(M.fbCellAt(M.fbStringX(2), -99999, true)), { s: 2, f: 0 });
});

test('a dot is only where a string is fretted', () => {
  const frets = [0, 2, 3, 2];
  assert.equal(M.fbIsDot(frets, { s: 1, f: 2 }), true);
  assert.equal(M.fbIsDot(frets, { s: 1, f: 3 }), false);
  assert.equal(M.fbIsDot(frets, { s: 0, f: 0 }), false); // open strings have no dot
  assert.equal(M.fbIsDot(frets, null), false);
});

test('tap to remove and tap to place do not mutate the input', () => {
  const frets = [0, 2, 3, 2];
  assert.deepEqual(plain(M.fbRemove(frets, 2)), [0, 2, 0, 2]);
  assert.deepEqual(plain(M.fbPlace(frets, 0, 5)), [5, 2, 3, 2]);
  assert.deepEqual(plain(M.fbPlace(frets, 1, 0)), [0, 0, 3, 2]); // top row sets the string open
  assert.deepEqual(frets, [0, 2, 3, 2]);
});

test('dragging along a string changes the fret', () => {
  const r = plain(M.fbDragTo([0, 2, 3, 2], { s: 3, f: 2 }, { s: 3, f: 4 }));
  assert.deepEqual(r, { frets: [0, 2, 3, 4], at: { s: 3, f: 4 } });
});

test('dragging sideways onto an open string moves the finger there', () => {
  const r = plain(M.fbDragTo([0, 2, 0, 0], { s: 1, f: 2 }, { s: 0, f: 2 }));
  assert.deepEqual(r, { frets: [2, 0, 0, 0], at: { s: 0, f: 2 } });
});

test('dragging onto an occupied string keeps both notes', () => {
  const r = plain(M.fbDragTo([2, 3, 0, 0], { s: 0, f: 2 }, { s: 1, f: 4 }));
  // The dot stays on string 0 (only the fret follows the pointer); string 1 keeps fret 3
  assert.deepEqual(r, { frets: [4, 3, 0, 0], at: { s: 0, f: 4 } });
});

test('a drag that passes over an occupied string never wipes it', () => {
  let frets = [2, 3, 0, 0];
  let at = { s: 0, f: 2 };
  for (const s of [1, 2, 3]) ({ frets, at } = M.fbDragTo(frets, at, { s, f: 2 }));
  assert.deepEqual(plain(frets), [0, 3, 0, 2]);
  assert.deepEqual(plain(at), { s: 3, f: 2 });
});

test('dragging above the nut leaves the string open', () => {
  const r = plain(M.fbDragTo([0, 2, 3, 2], { s: 1, f: 2 }, { s: 1, f: 0 }));
  assert.deepEqual(r.frets, [0, 0, 3, 2]);
  assert.equal(r.at.f, 0);
});

test('a drag that has not left its cell changes nothing', () => {
  const frets = [0, 2, 3, 2];
  const r = M.fbDragTo(frets, { s: 2, f: 3 }, { s: 2, f: 3 });
  assert.deepEqual(plain(r.frets), frets);
  assert.notEqual(r.frets, frets); // still a copy
});

test('next free string skips fretted strings in either direction', () => {
  assert.equal(M.fbNextFreeString([2, 3, 0, 4], 0, 1), 2);
  assert.equal(M.fbNextFreeString([2, 3, 0, 4], 3, -1), 2);
  assert.equal(M.fbNextFreeString([2, 3, 1, 4], 0, 1), -1);
  assert.equal(M.fbNextFreeString([0, 3, 0, 0], 1, -1), 0);
});

test('keyboard: delete, up/down along the string, left/right to free strings', () => {
  const k = (frets, s, key) => plain(M.fbKeyAction(frets, s, key, 12));
  for (const key of ['Delete', 'Backspace', 'Enter', ' ']) {
    assert.deepEqual(k([0, 2, 3, 2], 2, key), { frets: [0, 2, 0, 2], focus: null });
  }
  assert.deepEqual(k([0, 2, 3, 2], 2, 'ArrowDown'), { frets: [0, 2, 4, 2], focus: 2 });
  assert.deepEqual(k([0, 2, 12, 2], 2, 'ArrowDown'), { frets: [0, 2, 12, 2], focus: 2 }); // capped
  assert.deepEqual(k([0, 2, 3, 2], 2, 'ArrowUp'), { frets: [0, 2, 2, 2], focus: 2 });
  assert.deepEqual(k([0, 1, 3, 2], 1, 'ArrowUp'), { frets: [0, 0, 3, 2], focus: null }); // fret 1 → open
  assert.deepEqual(k([2, 3, 0, 0], 0, 'ArrowRight'), { frets: [0, 3, 2, 0], focus: 2 }); // skips string 1
  assert.deepEqual(k([0, 3, 2, 4], 2, 'ArrowRight'), { frets: [0, 3, 2, 4], focus: 2 }); // nowhere to go
  assert.equal(k([0, 2, 3, 2], 2, 'a'), null);
  assert.equal(k([0, 2, 3, 2], 0, 'Delete'), null); // no dot on an open string
});
