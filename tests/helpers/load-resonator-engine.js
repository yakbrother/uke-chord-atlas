// Loads the resonator app's plain <script>-style globals (instrument.js,
// music-theory.js) into an isolated vm context so they can be unit tested
// without a build step or module system.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = path.join(__dirname, '..', '..', 'resonator', 'public', 'js');

function loadResonatorEngine() {
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

  for (const file of ['instrument.js', 'music-theory.js']) {
    const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return sandbox;
}

// vm contexts have their own Array/Object realm, which trips node:assert's
// deepEqual reference checks even when values are structurally identical.
// Round-tripping through JSON re-materializes plain data in the host realm.
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { loadResonatorEngine, toPlain };
