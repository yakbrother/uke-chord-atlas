# I Let Mistral Build My Chord Progressions Feature — Here's What It Got Wrong

I'm building [Uke Chord Atlas](https://ukechordatlas.com), a soundless ukulele chord reference app. Pure HTML, vanilla JS, CSS — no frameworks, no build tools. When I needed a progressions page that generates chord sequences in all 12 keys with flashcard-style navigation, I handed the spec to Mistral and let it write the feature end to end.

The result looked impressive at first glance: ~1,200 lines across three new files, a card flip UI with keyboard nav, scale tone display, and algorithmically generated decks for six progression categories. Clean structure, good comments, solid CSS with responsive breakpoints and reduced-motion support.

Then I ran a code review.

## The showstopper: chords that aren't chords

The entire progression engine is broken. Mistral wrote a `romanToChord()` function that converts Roman numerals (I, IV, V) to chord names (C, F, G). Then it called that function with *numeric strings* ("1", "4", "5") instead of Roman numerals. The regex `^([ivIV]+°?)` doesn't match digits, so every progression silently displays raw numbers instead of chord names.

This isn't a subtle edge case. It's the core feature. Every single progression on the page is wrong. The function works — it's just never called correctly.

## maj7 is not minor

The `getScaleTones()` function determines whether a chord is minor by checking `chordType.startsWith('m')`. The string `"maj7"` starts with `"m"`. So Cmaj7, Fmaj9, and every major seventh chord gets classified as minor, producing the wrong parent scale.

The fix is a three-character regex: `/^m(?!aj)/`. Mistral wrote `startsWith('m')` — the kind of shortcut that passes a mental spot-check but fails the moment you think about the data.

## Keyboard nav that doesn't work

Three separate keyboard issues:

1. **Space key uses wrong event property.** The handler checks for `case 'Space':` but `KeyboardEvent.key` returns `' '` (a literal space character). `'Space'` is the `code` property, not `key`. The flip shortcut is silently dead.

2. **Focus target has no tabindex.** The code calls `.focus()` on a plain `<div>`, which is a no-op without `tabindex="0"`. Keyboard users can't reach the card viewer.

3. **Arrow keys scroll the page.** No `preventDefault()` on arrow key handlers, so stepping through cards also scrolls the viewport.

Each of these is a one-line fix. Together they mean keyboard navigation — which Mistral clearly intended, given the ARIA labels and key handler structure — doesn't function at all.

## Copy-paste constants

Mistral defined `ROOTS`, `FLAT_ROOTS`, and `ALL_ROOTS` in the new file despite identical arrays (`NOTE_NAMES`, `NOTE_NAMES_FLAT`) already existing in `music-theory.js`. Same for `MAJOR_SCALE_CHORDS` / `MINOR_SCALE_CHORDS`, which duplicate `getChordTypeForDegree()`. Two sources of truth for the same data means eventual drift.

## Dead code shipped confidently

`getChordTones()` — a fully documented, 30-line function — has zero callers. `selectedKeyFilter` is declared and never referenced. Two "Minor Moods" patterns (`i-IV-V` and `i-iv-V`) use the same numeric array and produce identical output despite different names. Mistral generated plausible-looking code that does nothing.

## What it got right

Credit where it's due:

- **CSS is solid.** Responsive grid, card flip with `backface-visibility`, `prefers-reduced-motion` media query, consistent use of CSS custom properties. No issues.
- **HTML structure is clean.** Proper ARIA attributes, semantic landmarks, skip link, CSP meta tag matching the other pages.
- **`escapeHtml()` for dynamic content.** User-facing strings go through DOM-based escaping. No innerHTML with raw user data.
- **Architecture is reasonable.** Separation of data generation (`progression-data.js`) from UI logic (`progressions.js`) from shared music theory. The module boundaries make sense.

## The takeaway

Mistral produced code that *looks* production-ready. Good naming, consistent style, thorough comments, proper accessibility markup. The kind of output that passes a cursory review. But the feature doesn't work — the primary function is called with wrong argument types, keyboard nav is broken in three independent ways, and a core music theory function has a logic error that affects common chord types.

AI-generated code needs the same review rigor as human code. The difference is that AI fails in a specific way: it builds convincing scaffolding around incorrect wiring. The structure is right, the intent is right, and the bugs hide in the seams between components.

I fixed everything in about 20 minutes. The architecture Mistral chose was fine — I just had to make it actually work.

---

*Tim Eaton builds [Uke Chord Atlas](https://ukechordatlas.com) and writes at [timeaton.dev](https://timeaton.dev).*
