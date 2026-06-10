# Uke Chord Atlas

A zero-dependency web app for exploring ukulele chord voicings and identifying chords from fret positions, all in GCEA standard tuning. No sound, no build step, no server — just open it.

## Features

### Chord Atlas (index.html)

- All 12 keys × 16 chord types (maj, min, sus2, sus4, add9, 6, 6/9, 7, maj7, 9, maj9, m7, m(maj7), m9, 7sus4, add11)
- Every playable voicing up to fret 12, max 4-fret span
- Extended chords (9, maj9, m9, 6/9) are voiced with the perfect 5th omitted, since a 4-string uke can sound at most four distinct notes
- **Open mid-neck filter** — isolates voicings that mix open strings with fretted notes higher up the neck

### Chord Identifier (identify.html)

- **Interactive SVG fretboard** — click/tap fret positions on each of the 4 strings
- **Real-time chord detection** — identifies the chord as you select frets, including extensions (add9, maj7, m9, etc.)
- **Slash chord notation** — shows inversions when the bass note differs from the root
- **Alternate interpretations** — lists all matching chord names ranked by simplicity
- **Interval formula display** — shows the intervals (1 3 5 b7, etc.) for each match

### Shared

- **Light and dark themes** — follows your system preference and remembers your choice
- **Mobile-friendly and keyboard-accessible** — real buttons, ARIA labels, visible focus, and reduced-motion support
- Zero runtime dependencies (Google Fonts loaded from CDN purely for styling, with serif fallbacks)

## Usage

Open `html/public/index.html` in any modern browser. No server required.

### Atlas

- Select a key → select a chord type → click (or tap) a diagram to see its notes and fingering
- Click the selected diagram again or press **Escape** to clear it
- Use the **★ open mid-neck** button to find resonant hybrid voicings

### Identifier

- Click a fret-string intersection on the fretboard to place a finger
- Click the same position again to reset that string to open
- The chord name, intervals, and alternate matches update live
- Press **Clear all** to reset all strings to open

Use the ☾/☀ toggle (top right) to switch between light and dark themes. Use the nav bar to switch between Atlas and Identifier.

## Structure

```
html/public/
  index.html            Atlas page
  identify.html         Chord identifier page
  css/
    shared.css          Theme, layout, header, nav, accessibility
    atlas.css           Key/type selectors, chord cards, grids
    identify.css        Fretboard SVG, result display
  js/
    music-theory.js     Note names, tuning, chord types, voicing generation, chord identification
    diagram.js          SVG chord diagram renderer
    theme.js            Light/dark theme toggle
    atlas.js            Atlas page logic and event wiring
    identify.js         Fretboard interaction and result rendering
```

The original single-file version is preserved at `uke-chord-atlas.html` in the project root.

## Tuning

Standard GCEA: G · C · E · A
