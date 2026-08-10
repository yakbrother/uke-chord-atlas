# Uke Chord Atlas

A zero-dependency web app for exploring ukulele chord voicings and identifying chords from fret positions. No sound, no build step, no server — just open it.

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

- **Six tunings** — standard GCEA, D tuning ADF#B, and baritone DGBE, each in a re-entrant and a linear form ([details](#tunings))
- **Light and dark themes** — follows your system preference and remembers your choice
- **Mobile-friendly and keyboard-accessible** — real buttons, ARIA labels, visible focus, and reduced-motion support
- Zero runtime dependencies (Google Fonts loaded from CDN purely for styling, with serif fallbacks)

## Usage

Open `html/public/index.html` in any modern browser. No server required.

### Atlas

- Select a key to see its major voicings, then pick another chord type — or **All** to see every type at once
- Click (or tap) a diagram to see its notes and fingering
- Click the selected diagram again or press **Escape** to clear it
- Use the **★ open mid-neck** button to find resonant hybrid voicings

### Identifier

- Click a fret-string intersection on the fretboard to place a finger
- Click the same position again to reset that string to open
- The chord name, intervals, and alternate matches update live
- Press **Clear all** to reset all strings to open

Use the ☾/☀ toggle (top right) to switch between light and dark themes. Use the nav bar to switch between Atlas and Identifier.

## Tests

```bash
npm test
```

Covers the music theory engine, chord identification, and every tuning. The
engine files are plain `<script>` globals, so the tests load them into a `vm`
context rather than importing them. No dependencies — `node --test` only.

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
    music-theory.js     Note names, tunings, chord types, voicing generation, chord identification
    diagram.js          SVG chord diagram renderer
    theme.js            Light/dark theme toggle
    tuning.js           Tuning toggle rendering and persistence
    favorites.js        Favourited voicings in localStorage
    atlas.js            Atlas page logic and event wiring
    identify.js         Fretboard interaction and result rendering
```

The original single-file version is preserved at `uke-chord-atlas.html` in the project root.

## Tunings

Six tunings, switchable from the toggle in the header on every page. Your
choice is remembered.

| Tuning | Open strings | Sounds | Notes |
| --- | --- | --- | --- |
| **Standard** | G4 C4 E4 A4 | — | Re-entrant: the G string sounds *above* the C |
| **Low-G** | G3 C4 E4 A4 | — | Linear; the G string drops an octave |
| **D (high-A)** | A4 D4 F#4 B4 | +2 | Re-entrant. The old standard, still on many vintage sopranos |
| **D (low-A)** | A3 D4 F#4 B4 | +2 | Linear |
| **Bari low-D** | D3 G3 B3 E4 | −5 | The usual baritone, linear |
| **Bari high-D** | D4 G3 B3 E4 | −5 | Re-entrant baritone: the D sounds above the G |

Every tuning is standard GCEA moved bodily up or down — the intervals between
the strings never change. That is what lets all six share one set of generated
voicings: the Atlas looks up the transposed root and labels the result with the
key you actually picked. Tunings that *reshape* the intervals (slack-key
`gCEG`, or a bass uke's `EADG`) would need the voicing generator rewritten, so
they are not offered.

Within a pair, the two variants produce identical *shapes* — same pitch
classes, same fingerings — but disagree about which note is in the bass. The
Identifier therefore names the same fingering differently. All four strings
open:

| Tuning | Reads as |
| --- | --- |
| Standard | `C6`, `Am7/C` |
| Low-G | `Am7/G`, `C6/G` |
| D (high-A) | `D6`, `Bm7/D` |
| D (low-A) | `Bm7/A`, `D6/A` |
| Bari low-D | `Em7/D`, `G6/D` |
| Bari high-D | `G6`, `Em7/G` |
