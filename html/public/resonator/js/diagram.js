// ═══════════════════════════════════════════════════════════
// SVG CHORD DIAGRAM (resonator guitar)
// Depends on: instrument.js (stringCount, currentStringNames)
// ═══════════════════════════════════════════════════════════

function chordSVG(frets, noteNamesArr, root, mixed, opts = {}) {
  const n = stringCount();
  const FRETS_SHOWN = 5;
  const lm = 16, tm = 30, rm = 6;
  const ss = 16; // spacing between strings
  const gw = ss * (n - 1);
  const W = lm + gw + rm, H = 112;
  const gh = H - tm - 18;
  const fs = gh / FRETS_SHOWN;

  const pressed = frets.filter(f => typeof f === "number" && f > 0);
  const minFret = pressed.length > 0 ? Math.min(...pressed) : 0;
  const startFret = minFret > 1 ? minFret : 1;
  const showNut = startFret === 1;

  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">`;

  // bg
  s += `<rect class="d-bg" x="0" y="0" width="${W}" height="${H}" rx="3"/>`;

  // aged paper lines
  for (let i = 0; i < 3; i++) {
    s += `<line class="d-paper-line" x1="0" y1="${tm + 18 + i * 22}" x2="${W}" y2="${tm + 18 + i * 22}" stroke-width="0.5"/>`;
  }

  // Fret position marker
  if (startFret > 1) {
    s += `<text class="d-pos" x="${lm - 3}" y="${tm + fs * 0.65}" text-anchor="end" font-size="8" font-family="'Jost',sans-serif" font-weight="500">${startFret}fr</text>`;
  }

  // Nut
  if (showNut) {
    s += `<rect class="d-nut" x="${lm - 1}" y="${tm - 4}" width="${gw + 2}" height="4" rx="1"/>`;
  }

  // Fret lines
  for (let fi = 0; fi <= FRETS_SHOWN; fi++) {
    if (fi === 0 && showNut) continue;
    s += `<line class="d-fret" x1="${lm}" y1="${tm + fi * fs}" x2="${lm + gw}" y2="${tm + fi * fs}" stroke-width="0.8"/>`;
  }

  // Strings
  for (let si = 0; si < n; si++) {
    s += `<line class="d-string" x1="${lm + si * ss}" y1="${tm}" x2="${lm + si * ss}" y2="${tm + gh}" stroke-width="${1 + si * 0.1}"/>`;
  }

  // Muted markers
  frets.forEach((f, si) => {
    if (f !== null) return;
    const cx = lm + si * ss, cy = tm - 10;
    s += `<text class="d-mute" x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="9" font-weight="bold" font-family="monospace">&#215;</text>`;
  });

  // Open circles
  frets.forEach((f, si) => {
    if (f !== 0) return;
    const cx = lm + si * ss, cy = tm - 10;
    s += `<circle class="d-open" cx="${cx}" cy="${cy}" r="5" stroke-width="1.5"/>`;
    s += `<text class="d-open-text" x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="5.5" font-weight="bold" font-family="monospace">${noteNamesArr[si] || ''}</text>`;
  });

  // Finger dots
  frets.forEach((f, si) => {
    if (typeof f !== "number" || f <= 0) return;
    const fr = f - startFret + 1;
    const cy = tm + (fr - 0.5) * fs;
    const cx = lm + si * ss;
    s += `<circle class="d-dot" cx="${cx}" cy="${cy}" r="${fs * 0.36}"/>`;
    s += `<text class="d-dot-text" x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="6" font-weight="bold" font-family="monospace">${noteNamesArr[si] || ''}</text>`;
  });

  // String labels
  currentStringNames().forEach((sn, si) => {
    s += `<text class="d-label" x="${lm + si * ss}" y="${H - 2}" text-anchor="middle" font-size="7" font-family="'Jost',sans-serif">${sn}</text>`;
  });

  // Drone-clash badge — the open drone strings don't land on a chord tone
  if (opts.droneFit === "clash") {
    s += `<text class="d-clash-badge" x="${W - 3}" y="10" text-anchor="end" font-size="9">&#9888;</text>`;
  }

  s += `</svg>`;
  return s;
}

// Build a spoken-friendly description of a voicing for screen readers.
function voicingAriaLabel(grpLabel, noteNamesArr, frets) {
  const names = currentStringNames();
  const fingering = frets.map((f, si) => {
    const str = names[si];
    if (f === null) return `${str} muted`;
    return f === 0 ? `${str} open` : `${str} fret ${f}`;
  }).join(', ');
  return `${grpLabel} voicing. Fingering ${fingering}.`;
}
