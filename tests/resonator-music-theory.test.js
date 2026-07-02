const test = require('node:test');
const assert = require('node:assert/strict');
const { loadResonatorEngine, toPlain } = require('./helpers/load-resonator-engine');

// Ground-truth checks against known Open D / Open Dm shapes, per the PR's
// manual verification notes: open strings, and barres at frets 2/5/7.

test('Open D tuning: open strings sound a D major chord', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD');
  const results = ctx.identifyChord([0, 0, 0, 0, 0, 0]);
  assert.ok(results.length > 0, 'expected at least one match');
  assert.equal(results[0].label, 'D');
  assert.equal(results[0].type.id, 'maj');
});

test('Open Dm tuning: open strings sound a D minor chord', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openDm');
  const results = ctx.identifyChord([0, 0, 0, 0, 0, 0]);
  assert.ok(results.length > 0, 'expected at least one match');
  assert.equal(results[0].label, 'Dmin');
  assert.equal(results[0].type.id, 'min');
});

test('Open D barre chords transpose the major triad up the neck', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD');

  const barre2 = ctx.identifyChord([2, 2, 2, 2, 2, 2]);
  assert.equal(barre2[0].label, 'E');
  assert.equal(barre2[0].type.id, 'maj');

  const barre5 = ctx.identifyChord([5, 5, 5, 5, 5, 5]);
  assert.equal(barre5[0].label, 'G');
  assert.equal(barre5[0].type.id, 'maj');

  const barre7 = ctx.identifyChord([7, 7, 7, 7, 7, 7]);
  assert.equal(barre7[0].label, 'A');
  assert.equal(barre7[0].type.id, 'maj');
});

test('Open Dm barre chords transpose the minor triad up the neck', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openDm');

  const barre5 = ctx.identifyChord([5, 5, 5, 5, 5, 5]);
  assert.equal(barre5[0].label, 'Gmin');
  assert.equal(barre5[0].type.id, 'min');

  const barre7 = ctx.identifyChord([7, 7, 7, 7, 7, 7]);
  assert.equal(barre7[0].label, 'Amin');
  assert.equal(barre7[0].type.id, 'min');
});

test('identifyChord reports a slash chord when the bass note is not the root', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD');
  // Mute the lowest (root) D string. The remaining open strings (A D F# A D)
  // are still exactly the D-major tone set, but the lowest sounding note is
  // now the 5th (A), so this should read as D/A.
  const results = ctx.identifyChord([null, 0, 0, 0, 0, 0]);
  const dMajor = results.find(r => r.displayLabel === 'D');
  assert.ok(dMajor, 'expected a D-major match among results');
  assert.equal(dMajor.isSlash, true);
  assert.equal(dMajor.bassName, 'A');
  assert.equal(dMajor.label, 'D/A');
});

test('identifyChord returns [] when no strings are fretted or open', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD');
  const results = ctx.identifyChord([null, null, null, null, null, null]);
  assert.deepEqual(toPlain(results), []);
});

test('getScaleTones returns the major scale for a bare major chord name', () => {
  const ctx = loadResonatorEngine();
  assert.deepEqual(toPlain(ctx.getScaleTones('C')), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
});

test('getScaleTones returns the natural minor scale for a minor chord name', () => {
  const ctx = loadResonatorEngine();
  assert.deepEqual(toPlain(ctx.getScaleTones('Am')), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
});

test('getScaleTones does not treat "maj7" as minor', () => {
  const ctx = loadResonatorEngine();
  assert.deepEqual(toPlain(ctx.getScaleTones('Cmaj7')), toPlain(ctx.getScaleTones('C')));
});

test('getProgressionSuggestions builds I-IV-V in the given major key', () => {
  const ctx = loadResonatorEngine();
  const suggestions = ctx.getProgressionSuggestions(0, 'maj'); // root = C
  const iivV = suggestions.find(s => s.name === 'I-IV-V');
  assert.deepEqual(toPlain(iivV.chords), ['C', 'F', 'G']);
});

test('getProgressionSuggestions builds minor-key progressions for minor chord types', () => {
  const ctx = loadResonatorEngine();
  const suggestions = ctx.getProgressionSuggestions(9, 'min'); // root = A minor
  const iivV = suggestions.find(s => s.name === 'I-IV-V');
  assert.deepEqual(toPlain(iivV.chords), ['Amin', 'Dmin', 'Emin']);
});

test('droneStringSubset fingerstyle default frets strings 4-3-2, drones 6-5(-1)', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD'); // 6 strings, indices 0..5 low->high
  assert.deepEqual(toPlain(ctx.droneStringSubset(true)), [2, 3, 4, 5]);
  assert.deepEqual(toPlain(ctx.droneStringSubset(false)), [2, 3, 4]);
});

test('generateVoicingsDrone tags voicings whose drones are chord tones as "match"', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD');
  // Root D: the two lowest strings (D, A) and open low string are chord tones
  // of D major, so any D-major voicing in this tuning should be droneFit "match".
  const voicings = ctx.getVoicings(2, { mode: 'drone', includeString1: true });
  const dMajor = voicings.filter(v => v.type === 'maj');
  assert.ok(dMajor.length > 0, 'expected at least one D-major drone voicing');
  assert.ok(dMajor.every(v => v.droneFit === 'match'), 'all D-major voicings in Open D should be drone matches');
});

test('generateVoicingsDrone tags a clashing key as "clash" for at least one produced voicing', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD');
  // Root Eb (3): the open-D drones (D, A, D) are not Eb-major chord tones,
  // so Eb-major voicings should be flagged as drone clashes.
  const voicings = ctx.getVoicings(3, { mode: 'drone', includeString1: true });
  const ebMajor = voicings.filter(v => v.type === 'maj');
  assert.ok(ebMajor.length > 0, 'expected at least one Eb-major drone voicing');
  assert.ok(ebMajor.every(v => v.droneFit === 'clash'));
});

test('every fretted note in every generated full voicing is a chord tone', () => {
  const ctx = loadResonatorEngine();
  ctx.setTuning('openD');
  const open = ctx.currentOpen();
  const root = 2; // D
  const voicings = ctx.getVoicings(root, { mode: 'full' });
  const dMajor = voicings.filter(v => v.type === 'maj');
  assert.ok(dMajor.length > 0);
  for (const v of dMajor) {
    v.frets.forEach((f, i) => {
      if (f === null) return;
      const interval = ((open[i] + f - root) % 12 + 12) % 12;
      assert.ok([0, 4, 7].includes(interval), `fret ${f} on string ${i} is not a D-major tone`);
    });
  }
});
