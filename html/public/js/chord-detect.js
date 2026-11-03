// ═══════════════════════════════════════════════════════════
// AUDIO CHORD DETECTION (zero-dependency, runs in the browser)
//
// Pipeline:  mono PCM → downsample → STFT → chromagram (+ bass chroma)
//            → tuning correction → chord-template scores
//            → Viterbi smoothing → merged, timestamped segments
//            and a Krumhansl–Schmuckler key estimate.
//
// Pure functions only (no DOM), so it can be unit tested under Node.
// ═══════════════════════════════════════════════════════════

const DETECT_DEFAULTS = {
  targetRate: 11025,   // analysis sample rate
  frameSize: 4096,     // ~0.37 s window at 11025 Hz (≈2.7 Hz bins)
  hopSize: 2048,       // ~0.19 s hop
  minFreq: 55,         // A1
  maxFreq: 2000,
  bassMaxFreq: 220,
  include7ths: false,
  selfProb: 0.92,      // Viterbi self-transition probability (higher = smoother)
  emissionScale: 18,
  minSegment: 0.6,     // seconds; shorter segments are absorbed
  silenceDb: -50,
};

// Chord vocabulary. `type` ids match CHORD_TYPES in music-theory.js.
const DETECT_QUALITIES = [
  { type: 'maj', tones: [0, 4, 7], penalty: 0 },
  { type: 'min', tones: [0, 3, 7], penalty: 0 },
];
const DETECT_QUALITIES_7 = [
  { type: '7',   tones: [0, 4, 7, 10], penalty: 0.03 },
  { type: 'm7',  tones: [0, 3, 7, 10], penalty: 0.03 },
  { type: 'maj7', tones: [0, 4, 7, 11], penalty: 0.04 },
];

// ── FFT (in-place iterative radix-2) ─────────────────────────

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ── Pre-processing ───────────────────────────────────────────

/**
 * Average channels into one Float32Array. If averaging cancels most of the
 * energy (channels largely phase-inverted), fall back to the loudest
 * single channel so the music doesn't vanish before analysis.
 */
function mixToMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  const energy = (x) => { let e = 0; for (let i = 0; i < x.length; i += 4) e += x[i] * x[i]; return e; };
  const chE = channels.map(energy);
  const loudest = chE.indexOf(Math.max(...chE));
  // In-phase content keeps ~100% of the per-channel energy; uncorrelated ~50%.
  if (chE[loudest] > 0 && energy(out) < 0.1 * chE[loudest]) return channels[loudest];
  return out;
}

/** Box-filter decimation by an integer factor (cheap anti-alias). */
function downsample(samples, rate, targetRate) {
  const factor = Math.max(1, Math.floor(rate / targetRate));
  if (factor === 1) return { samples, rate };
  const n = Math.floor(samples.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * factor;
    for (let k = 0; k < factor; k++) s += samples[o + k];
    out[i] = s / factor;
  }
  return { samples: out, rate: rate / factor };
}

// ── Chromagram ──────────────────────────────────────────────

/**
 * Compute per-frame 12-bin chroma and bass chroma.
 * Returns { chroma: Float32Array[], bass: Float32Array[], energyDb: number[],
 *           frameTime: number, tuningCents: number }
 */
function computeChromagram(samples, rate, opts) {
  const o = Object.assign({}, DETECT_DEFAULTS, opts);
  const N = o.frameSize, H = o.hopSize;
  const window = new Float32Array(N);
  for (let i = 0; i < N; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));

  const binHz = rate / N;
  const kMin = Math.max(1, Math.ceil(o.minFreq / binHz));
  const kMax = Math.min(N / 2 - 1, Math.floor(o.maxFreq / binHz));
  const kBass = Math.min(kMax, Math.floor(o.bassMaxFreq / binHz));

  const frames = [];
  const energyDb = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  const frameCount = samples.length < N ? (samples.length > 0 ? 1 : 0) : 1 + Math.floor((samples.length - N) / H);

  // First pass: magnitude spectra + tuning histogram
  let tuneSin = 0, tuneCos = 0;
  for (let f = 0; f < frameCount; f++) {
    const off = f * H;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const x = off + i < samples.length ? samples[off + i] : 0;
      e += x * x;
      re[i] = x * window[i];
      im[i] = 0;
    }
    energyDb.push(10 * Math.log10(e / N + 1e-12));
    fftInPlace(re, im);
    const mag = new Float32Array(kMax + 1);
    let peak = 0;
    for (let k = kMin; k <= kMax; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      if (mag[k] > peak) peak = mag[k];
    }
    // Tuning: weight local spectral peaks by magnitude, use circular mean of
    // the deviation from the nearest equal-tempered semitone.
    for (let k = kMin + 1; k < kMax; k++) {
      if (mag[k] > peak * 0.1 && mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
        // Parabolic interpolation for sub-bin peak frequency
        const a = mag[k - 1], b = mag[k], c = mag[k + 1];
        const d = (a - c) / (2 * (a - 2 * b + c) || 1);
        const m = 69 + 12 * Math.log2(((k + d) * binHz) / 440);
        const ang = 2 * Math.PI * (m - Math.round(m));
        tuneSin += b * Math.sin(ang);
        tuneCos += b * Math.cos(ang);
      }
    }
    frames.push(mag);
  }

  const tuningSemis = (tuneSin === 0 && tuneCos === 0) ? 0 : Math.atan2(tuneSin, tuneCos) / (2 * Math.PI);

  // Second pass: fold spectral peaks into pitch classes (tuning-corrected).
  // Using only local maxima (with parabolic interpolation) instead of every
  // bin keeps window leakage and the noise floor from smearing the chroma.
  const chroma = [], bass = [];
  for (const mag of frames) {
    const c = new Float32Array(12), b = new Float32Array(12);
    let peak = 0;
    for (let k = kMin; k <= kMax; k++) if (mag[k] > peak) peak = mag[k];
    const floor = peak * 0.02;
    for (let k = kMin + 1; k < kMax; k++) {
      const v = mag[k];
      if (v <= floor || v <= mag[k - 1] || v < mag[k + 1]) continue;
      const a = mag[k - 1], cc = mag[k + 1];
      const den = a - 2 * v + cc;
      const d = den ? 0.5 * (a - cc) / den : 0;
      const m = 69 + 12 * Math.log2(((k + d) * binHz) / 440) - tuningSemis;
      const nearest = Math.round(m);
      const dev = Math.abs(m - nearest);
      if (dev > 0.35) continue;
      const w = Math.sqrt(v / peak) * (1 - dev);
      const pc = ((nearest % 12) + 12) % 12;
      c[pc] += w;
      if (k <= kBass) b[pc] += w;
    }
    chroma.push(normalizeVec(c));
    bass.push(normalizeVec(b));
  }

  return { chroma, bass, energyDb, frameTime: H / rate, frameOffset: N / 2 / rate, tuningCents: Math.round(tuningSemis * 100) };
}

function normalizeVec(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s);
  if (s > 0) for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

/** Moving-average filter along time (radius in frames). */
function smoothFrames(frames, radius) {
  if (radius <= 0) return frames;
  const out = [];
  for (let t = 0; t < frames.length; t++) {
    const acc = new Float32Array(12);
    const lo = Math.max(0, t - radius), hi = Math.min(frames.length - 1, t + radius);
    for (let u = lo; u <= hi; u++) for (let i = 0; i < 12; i++) acc[i] += frames[u][i];
    out.push(normalizeVec(acc));
  }
  return out;
}

// ── Chord templates ─────────────────────────────────────────

function buildChordStates(include7ths) {
  const qualities = include7ths ? DETECT_QUALITIES.concat(DETECT_QUALITIES_7) : DETECT_QUALITIES;
  const states = [];
  for (const q of qualities) {
    for (let root = 0; root < 12; root++) {
      const t = new Float32Array(12);
      // Root weighted slightly higher; 5th slightly lower (it's in every chord).
      for (const iv of q.tones) t[(root + iv) % 12] = iv === 0 ? 1.0 : (iv === 7 ? 0.8 : 0.9);
      states.push({ root, type: q.type, template: normalizeVec(t), penalty: q.penalty });
    }
  }
  states.push({ root: null, type: 'N', template: null, penalty: 0 }); // no chord
  return states;
}

function scoreFrame(chroma, bass, energyDb, states, o) {
  const silent = energyDb < o.silenceDb;
  return states.map(s => {
    if (s.type === 'N') return silent ? 1 : 0.35;
    if (silent) return 0;
    let dot = 0;
    for (let i = 0; i < 12; i++) dot += chroma[i] * s.template[i];
    return dot + 0.15 * bass[s.root] - s.penalty;
  });
}

// ── Viterbi ─────────────────────────────────────────────────

function viterbi(scores, selfProb, emissionScale) {
  const T = scores.length;
  if (T === 0) return [];
  const S = scores[0].length;
  const stay = Math.log(selfProb);
  const move = Math.log((1 - selfProb) / (S - 1));
  let prev = scores[0].map(x => x * emissionScale);
  const back = [];
  for (let t = 1; t < T; t++) {
    // Best predecessor overall (for the "move" transition)
    let bestIdx = 0;
    for (let s = 1; s < S; s++) if (prev[s] > prev[bestIdx]) bestIdx = s;
    const cur = new Float64Array(S);
    const bp = new Int32Array(S);
    for (let s = 0; s < S; s++) {
      const fromSelf = prev[s] + stay;
      const fromBest = prev[bestIdx] + move;
      if (fromSelf >= fromBest || bestIdx === s) { cur[s] = fromSelf; bp[s] = s; }
      else { cur[s] = fromBest; bp[s] = bestIdx; }
      cur[s] += scores[t][s] * emissionScale;
    }
    back.push(bp);
    prev = cur;
  }
  let s = 0;
  for (let i = 1; i < S; i++) if (prev[i] > prev[s]) s = i;
  const path = new Array(T);
  path[T - 1] = s;
  for (let t = T - 1; t > 0; t--) { s = back[t - 1][s]; path[t - 1] = s; }
  return path;
}

// ── Segments ────────────────────────────────────────────────

function pathToSegments(path, states, frameTime, totalDuration, minSegment, frameOffset) {
  const offset = frameOffset || 0; // time from frame start to its centre
  let segs = [];
  for (let t = 0; t < path.length; t++) {
    const st = states[path[t]];
    const last = segs[segs.length - 1];
    if (last && last.state === path[t]) continue;
    const start = segs.length === 0 ? 0 : Math.min(totalDuration, t * frameTime + offset);
    segs.push({ state: path[t], root: st.root, type: st.type, start });
  }
  for (let i = 0; i < segs.length; i++) {
    segs[i].end = i + 1 < segs.length ? segs[i + 1].start : totalDuration;
  }
  // Absorb too-short segments into their predecessor (or successor)
  let changed = true;
  while (changed && segs.length > 1) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].end - segs[i].start >= minSegment) continue;
      if (i > 0) segs[i - 1].end = segs[i].end;
      else segs[i + 1].start = segs[i].start;
      segs.splice(i, 1);
      changed = true;
      break;
    }
    // Merge neighbours that became identical
    const merged = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && last.state === s.state) last.end = s.end;
      else merged.push(s);
    }
    segs = merged;
  }
  return segs.map(s => ({ start: round3(s.start), end: round3(s.end), root: s.root, type: s.type }));
}

function round3(x) { return Math.round(x * 1000) / 1000; }

// ── Key estimation (Krumhansl–Kessler profiles) ─────────────

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Returns { root, mode: 'major'|'minor', confidence } */
function estimateKey(chromaFrames) {
  const sum = new Array(12).fill(0);
  for (const c of chromaFrames) for (let i = 0; i < 12; i++) sum[i] += c[i];
  let best = { root: 0, mode: 'major', confidence: -Infinity };
  for (let r = 0; r < 12; r++) {
    const rot = sum.map((_, i) => sum[(i + r) % 12]);
    const maj = pearson(rot, KK_MAJOR), min = pearson(rot, KK_MINOR);
    if (maj > best.confidence) best = { root: r, mode: 'major', confidence: maj };
    if (min > best.confidence) best = { root: r, mode: 'minor', confidence: min };
  }
  return best;
}

// ── Top-level ───────────────────────────────────────────────

/**
 * Detect chords from raw PCM.
 * @param {Float32Array[]} channels
 * @param {number} sampleRate
 * @param {object} [opts] overrides for DETECT_DEFAULTS
 * @returns {{ segments: Array<{start,end,root,type}>, key: {root,mode,confidence}|null, tuningCents, duration }}
 */
function detectChords(channels, sampleRate, opts) {
  const o = Object.assign({}, DETECT_DEFAULTS, opts);
  const mono = mixToMono(channels);
  const duration = mono.length / sampleRate;
  const ds = downsample(mono, sampleRate, o.targetRate);
  const cg = computeChromagram(ds.samples, ds.rate, o);
  const chroma = smoothFrames(cg.chroma, 2);
  const bass = smoothFrames(cg.bass, 2);
  const states = buildChordStates(o.include7ths);
  const scores = chroma.map((c, t) => scoreFrame(c, bass[t], cg.energyDb[t], states, o));
  const path = viterbi(scores, o.selfProb, o.emissionScale);
  const segments = pathToSegments(path, states, cg.frameTime, duration, o.minSegment, cg.frameOffset);
  const voiced = chroma.filter((_, t) => cg.energyDb[t] >= o.silenceDb);
  return {
    segments,
    key: voiced.length ? estimateKey(voiced) : null, // no tonal content → no key
    tuningCents: cg.tuningCents,
    duration,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DETECT_DEFAULTS, fftInPlace, mixToMono, downsample, computeChromagram,
    buildChordStates, viterbi, pathToSegments, estimateKey, detectChords,
  };
}
