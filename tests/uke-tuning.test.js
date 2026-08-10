const test = require('node:test');
const assert = require('node:assert');
const { loadUkeEngine } = require('./helpers/load-uke-engine');

const ALL_TUNINGS = [
  'standard', 'lowg',
  'dTuning', 'dTuningLowA',
  'baritone', 'baritoneHighD',
];
const ALL_OPEN = [0, 0, 0, 0];

test('every tuning is well-formed', () => {
  const e = loadUkeEngine();

  assert.deepStrictEqual(Object.keys(e.TUNINGS), ALL_TUNINGS);

  for (const id of ALL_TUNINGS) {
    const t = e.TUNINGS[id];
    assert.strictEqual(t.id, id, `${id} carries its own id`);
    assert.strictEqual(t.open.length, 4, `${id} has 4 open strings`);
    assert.strictEqual(t.midi.length, 4, `${id} has 4 midi pitches`);
    assert.strictEqual(t.stringNames.length, 4, `${id} has 4 string names`);
  }
});

test('open strings are stored as real pitch classes, never negative', () => {
  const e = loadUkeEngine();

  // Regression: low-G used to be stored as [-5, 0, 4, 9]. The -5 survived
  // `(open + fret) % 12` as a negative number, which then broke the interval
  // arithmetic in identifyChord for roots 8-11.
  for (const id of ALL_TUNINGS) {
    e.setTuning(id);
    for (const n of e.currentOpen()) {
      assert.ok(n >= 0 && n <= 11, `${id} open string ${n} is a pitch class`);
    }
    for (let str = 0; str < 4; str++) {
      for (let fret = 0; fret <= 12; fret++) {
        const n = e.noteAtCurrent(str, fret);
        assert.ok(n >= 0 && n <= 11, `${id} string ${str} fret ${fret} => ${n}`);
      }
    }
  }
});

test('setTuning falls back to the default for unknown ids', () => {
  const e = loadUkeEngine();

  e.setTuning('baritone');
  assert.strictEqual(e.getTuningId(), 'baritone');

  e.setTuning('not-a-tuning');
  assert.strictEqual(e.getTuningId(), e.DEFAULT_TUNING);
});

test('both baritone tunings report as baritone, the ukulele ones do not', () => {
  const e = loadUkeEngine();

  const baritone = {};
  for (const id of ALL_TUNINGS) {
    e.setTuning(id);
    baritone[id] = e.isBaritone();
  }

  assert.deepStrictEqual(baritone, {
    standard: false,
    lowg: false,
    dTuning: false,
    dTuningLowA: false,
    baritone: true,
    baritoneHighD: true,
  });
});

test('every tuning is standard GCEA moved by its own offset', () => {
  const e = loadUkeEngine();

  // The whole atlas depends on this: voicings are generated once in GCEA and
  // reused everywhere, which only holds while the intervals between the
  // strings are identical in every tuning.
  const std = e.TUNINGS.standard.open;
  const shape = std.map(n => (n - std[0] + 12) % 12);

  for (const id of ALL_TUNINGS) {
    const t = e.TUNINGS[id];
    const theirs = t.open.map(n => (n - t.open[0] + 12) % 12);
    assert.deepStrictEqual(theirs, shape, `${id} keeps the GCEA interval shape`);
    assert.strictEqual(t.open[0], (std[0] - t.offset + 12) % 12,
      `${id} offset ${t.offset} matches its open strings`);
  }
});

test('transposing a root and back is a round trip', () => {
  const e = loadUkeEngine();

  for (const id of ALL_TUNINGS) {
    e.setTuning(id);
    for (let root = 0; root < 12; root++) {
      const looked = e.standardRootFor(root);
      assert.ok(looked >= 0 && looked <= 11, `${id} root ${root} stays a pitch class`);
      assert.strictEqual(e.soundingNote(looked), root, `${id} round-trips root ${root}`);
    }
  }
});

test('D tuning sounds a whole step above standard', () => {
  const e = loadUkeEngine();
  e.setTuning('dTuning');

  // Asking for C means playing the shape that voices Bb in standard tuning.
  assert.strictEqual(e.standardRootFor(0), 10, 'C in D tuning is Bb in standard');
  assert.strictEqual(e.soundingNote(10), 0);
  assert.strictEqual(e.currentStringNames().join(' '), 'A D F# B');
});

test('D tuning identifies the same shape a whole step higher', () => {
  const e = loadUkeEngine();

  e.setTuning('standard');
  const std = e.identifyChord(ALL_OPEN)[0];
  e.setTuning('dTuning');
  const d = e.identifyChord(ALL_OPEN)[0];

  assert.strictEqual(std.label, 'C6');
  assert.strictEqual(d.label, 'D6', 'a whole step above C6');
});

test('re-entrant tunings put a different string in the bass', () => {
  const e = loadUkeEngine();

  const lowestString = id => {
    e.setTuning(id);
    const midi = e.currentMidi();
    return midi.indexOf(Math.min(...midi));
  };

  // High-G and high-D are re-entrant: string 0 is not the lowest-sounding.
  assert.strictEqual(lowestString('standard'), 1, 'high-G: C is the lowest');
  assert.strictEqual(lowestString('lowg'), 0, 'low-G: G is the lowest');
  assert.strictEqual(lowestString('baritone'), 0, 'low-D: D is the lowest');
  assert.strictEqual(lowestString('baritoneHighD'), 1, 'high-D: G is the lowest');
});

test('baritone low-D and high-D name the same shape differently', () => {
  const e = loadUkeEngine();

  // All four strings open on a baritone sounds D G B E, which is G6 (or Em7).
  // Which note is in the bass — and therefore whether it is a slash chord —
  // is the only thing that separates low-D from high-D.
  e.setTuning('baritone');
  const lowD = e.identifyChord(ALL_OPEN);
  assert.strictEqual(lowD[0].bassName, 'D', 'low-D puts D in the bass');
  assert.ok(lowD.every(r => r.isSlash), 'every low-D reading is a slash chord');
  assert.ok(lowD.some(r => r.label === 'G6/D'), 'low-D open strings are G6/D');

  e.setTuning('baritoneHighD');
  const highD = e.identifyChord(ALL_OPEN);
  assert.strictEqual(highD[0].bassName, 'G', 'high-D puts G in the bass');
  assert.strictEqual(highD[0].label, 'G6', 'high-D open strings are plain G6');
  assert.ok(highD.some(r => r.label === 'Em7/G'), 'Em7/G is still offered');
});

test('low-G identifies chords that the negative pitch class used to break', () => {
  const e = loadUkeEngine();

  // G C E A with the G an octave down. Root A sits at index 9, which is
  // exactly where the old `(-5 - 9 + 12) % 12 = -2` went wrong and silently
  // dropped every match.
  e.setTuning('lowg');
  const results = e.identifyChord(ALL_OPEN);

  assert.ok(results.length > 0, 'low-G open strings identify as something');
  assert.ok(
    results.some(r => r.displayLabel === 'Am7'),
    'low-G open strings include Am7'
  );
  assert.ok(
    results.some(r => r.label === 'Am7/G'),
    'low-G puts G in the bass, making it Am7/G'
  );
});

test('high-G and low-G differ only in the bass', () => {
  const e = loadUkeEngine();

  const names = id => {
    e.setTuning(id);
    return e.identifyChord(ALL_OPEN).map(r => r.displayLabel).sort();
  };

  assert.deepStrictEqual(names('standard'), names('lowg'),
    'the same notes are sounding, so the same chords match');

  e.setTuning('standard');
  assert.strictEqual(e.identifyChord(ALL_OPEN)[0].bassName, 'C');
  e.setTuning('lowg');
  assert.strictEqual(e.identifyChord(ALL_OPEN)[0].bassName, 'G');
});

test('voicing generation is independent of the selected tuning', () => {
  const e = loadUkeEngine();

  // Voicings are always generated in standard GCEA and transposed for
  // baritone at display time, so switching tuning must not change the set.
  const counts = ALL_TUNINGS.map(id => {
    e.setTuning(id);
    return e.getVoicings(0).length;
  });

  assert.ok(counts[0] > 0, 'C has voicings');
  assert.ok(counts.every(c => c === counts[0]), `same count everywhere: ${counts}`);
});

test('diagrams label strings using the selected tuning', () => {
  const e = loadUkeEngine();

  const labelsFor = id => {
    e.setTuning(id);
    return e.currentStringNames().join('');
  };

  // Lowercase marks a string tuned an octave down, the usual ukulele
  // convention. Both baritones spell D G B E — they differ by octave, not by
  // note, and that difference shows up in chord naming rather than on a
  // diagram.
  assert.strictEqual(labelsFor('standard'), 'GCEA');
  assert.strictEqual(labelsFor('lowg'), 'gCEA', 'low-G is lowercase');
  assert.strictEqual(labelsFor('dTuning'), 'ADF#B');
  assert.strictEqual(labelsFor('dTuningLowA'), 'aDF#B', 'low-A is lowercase');
  assert.strictEqual(labelsFor('baritone'), 'DGBE');
  assert.strictEqual(labelsFor('baritoneHighD'), 'DGBE');

  e.setTuning('dTuning');
  const svg = e.chordSVG([0, 0, 0, 0], ['A', 'D', 'F#', 'B'], 9, false);
  assert.ok(svg.startsWith('<svg'), 'renders an SVG');
  assert.ok(svg.includes('>F#</text>'), 'the diagram carries the D-tuning labels');
});
