# Uke Chord Atlas — Drone Edition

A standalone HTML app for exploring ukulele chord voicings across all 12 keys, with drone audio playback.

## Features

- All 12 keys × 16 chord types (maj, min, sus2, sus4, add9, 6, 6/9, 7, maj7, 9, maj9, m7, m(maj7), m9, 7sus4, add11)
- Every playable voicing up to fret 12, max 4-fret span
- **Drone playback** — click any chord diagram to hear it sustained (sine + triangle layers, vibrato, room reverb)
- **Open mid-neck filter** — isolates voicings that mix open strings with fretted notes higher up the neck
- GCEA standard tuning
- Zero dependencies except HTMX (loaded from CDN) and Google Fonts

## Usage

Open `uke-chord-atlas.html` directly in any modern browser. No server required.

- Select a key → select a chord type → click a diagram to drone it
- Click again or press **Escape** to stop
- Use the **★ open mid-neck** button to find those resonant hybrid voicings

## Structure

Single-file app — all music theory, voicing generation, SVG rendering, and Web Audio in one HTML file.

```
uke-chord-atlas.html   — the whole thing
```

## Audio Engine

Each chord drones all 4 strings simultaneously:
- Sine wave (fundamental) + triangle wave (octave harmonic) per string
- Per-string vibrato at slightly offset rates for natural beating
- Convolved reverb impulse response
- Brief sawtooth transient on attack
- Open strings boosted slightly (they ring freer on a real uke)

## Tuning

Standard GCEA: G4 (392Hz) · C4 (261.63Hz) · E4 (329.63Hz) · A4 (440Hz)

