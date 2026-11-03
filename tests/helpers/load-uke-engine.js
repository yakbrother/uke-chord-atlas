// Loads the main uke app's plain <script>-style globals (music-theory.js,
// chord-detect.js, song-utils.js) into an isolated vm context for testing.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = path.join(__dirname, '..', '..', 'html', 'public', 'js');

function loadUkeEngine() {
  const sandbox = {
    console,
    localStorage: {
      _store: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
    },
  };
  vm.createContext(sandbox);
  for (const file of ['music-theory.js', 'chord-detect.js', 'song-utils.js', 'pdf-export.js']) {
    const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox;
}

module.exports = { loadUkeEngine };
