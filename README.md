# Uke Chord Atlas

A standalone, single-file HTML app for exploring ukulele chord voicings across all 12 keys in GCEA standard tuning. No sound, no build step, no server — just open it.

## Features

- All 12 keys × 16 chord types (maj, min, sus2, sus4, add9, 6, 6/9, 7, maj7, 9, maj9, m7, m(maj7), m9, 7sus4, add11)
- Every playable voicing up to fret 12, max 4-fret span
- Extended chords (9, maj9, m9, 6/9) are voiced with the perfect 5th omitted, since a 4-string uke can sound at most four distinct notes
- **Open mid-neck filter** — isolates voicings that mix open strings with fretted notes higher up the neck
- **Light and dark themes** — follows your system preference and remembers your choice
- **Mobile-friendly and keyboard-accessible** — real buttons, ARIA labels, visible focus, and reduced-motion support
- Zero runtime dependencies (Google Fonts loaded from CDN purely for styling, with serif fallbacks)

## Usage

Open `uke-chord-atlas.html` directly in any modern browser. No server required.

- Select a key → select a chord type → click (or tap) a diagram to see its notes and fingering
- Click the selected diagram again or press **Escape** to clear it
- Use the **★ open mid-neck** button to find resonant hybrid voicings
- Use the ☾/☀ toggle (top right) to switch between light and dark themes

## Structure

Single-file app — all music theory, voicing generation, and SVG rendering live in one HTML file.

```
uke-chord-atlas.html   — the whole thing
```

## Tuning

Standard GCEA: G · C · E · A
