// Loads the ukulele app's plain <script>-style globals (music-theory.js,
// diagram.js) into an isolated vm context so they can be unit tested without
// a build step or module system.
//
// Top-level `function` declarations land on the sandbox object, but `const`
// and `let` land in the context's lexical scope instead, so a bootstrap script
// runs inside the context to hand back everything under one object.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = path.join(__dirname, '..', '..', 'html', 'public', 'js');

const BOOTSTRAP = `({
  TUNINGS, DEFAULT_TUNING, OPEN, CHORD_TYPES, NOTE_NAMES,
  tuning, setTuning, isLowG, isBaritone,
  currentOpen, currentMidi, currentStringNames,
  standardRootFor, soundingNote,
  getTuningId: () => currentTuning,
  noteName, rootNoteName, noteAt, noteAtCurrent, isMixed,
  getVoicings, identifyChord,
  chordSVG, voicingAriaLabel,
})`;

function loadUkeEngine(files = ['music-theory.js', 'diagram.js']) {
  const sandbox = {
    console,
    localStorage: {
      _store: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
    },
  };
  vm.createContext(sandbox);

  for (const file of files) {
    const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return vm.runInContext(BOOTSTRAP, sandbox);
}

// vm contexts have their own Array/Object realm, which trips node:assert's
// deepEqual reference checks even when values are structurally identical.
// Round-tripping through JSON re-materializes plain data in the host realm.
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { loadUkeEngine, toPlain };
