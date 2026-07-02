// ═══════════════════════════════════════════════════════════
// PROGRESSION DECK DATA (algorithmically generated)
// Custom deck names and descriptions
// Reuses NOTE_NAMES_FLAT, FLAT_KEYS from music-theory.js
// ═══════════════════════════════════════════════════════════

// Semitone offsets for each scale degree (1-based index)
const MAJOR_OFFSETS = [null, 0, 2, 4, 5, 7, 9, 11];
const MINOR_OFFSETS = [null, 0, 2, 3, 5, 7, 8, 10];

/**
 * Resolve a numeric scale degree to a chord name in a given key
 * @param {number} degree - Scale degree 1-7
 * @param {string} key - Root note (e.g., 'C', 'Ab')
 * @param {boolean} isMinorKey - Whether the key is minor
 * @param {string} suffix - Optional suffix (e.g., '7', 'maj7')
 * @returns {string} The chord name (e.g., 'G', 'Dm', 'Bbdim')
 */
function degreeToChord(degree, key, isMinorKey, suffix) {
  const keyIndex = NOTE_NAMES_FLAT.indexOf(key);
  if (keyIndex === -1 || degree < 1 || degree > 7) return key;

  const offsets = isMinorKey ? MINOR_OFFSETS : MAJOR_OFFSETS;
  const chordRootIndex = (keyIndex + offsets[degree]) % 12;
  const chordRoot = rootNoteName(chordRootIndex);

  // Chord quality from scale degree
  const chordType = getChordTypeForDegree(degree, isMinorKey);

  let chordName = chordRoot;
  if (chordType !== 'maj') {
    chordName += chordType;
  }
  if (suffix) {
    chordName += suffix;
  }
  return chordName;
}

/**
 * Generate progressions for all keys
 * @param {Array} patterns - Array of {name, pattern, description, category}
 * @returns {Array} Array of deck objects
 */
function generateDecks() {
  // Define progression patterns grouped by category
  const patternsByCategory = {
    'Foundations': [
      { name: 'I-IV-V', pattern: [1, 4, 5], description: 'The cornerstone of blues, rock, and country music' },
      { name: 'I-V-vi-IV', pattern: [1, 5, 6, 4], description: 'The classic pop progression - hear it everywhere' },
      { name: 'I-vi-IV-V', pattern: [1, 6, 4, 5], description: '50s doo-wop magic in four chords' },
      { name: 'vi-IV-I-V', pattern: [6, 4, 1, 5], description: 'A sentimental journey home' }
    ],
    'Jazz & Movement': [
      { name: 'ii-V-I', pattern: [2, 5, 1], description: 'The most common jazz cadence - smooth resolution' },
      { name: 'I-ii-iii-IV', pattern: [1, 2, 3, 4], description: 'Ascending diatonic climb' },
      { name: 'I-vi-ii-V', pattern: [1, 6, 2, 5], description: 'Circle progression - endless loop potential' },
      { name: 'iii-vi-ii-V', pattern: [3, 6, 2, 5], description: 'Jazz minor line with tension and release' },
      { name: 'I-IV-ii-V', pattern: [1, 4, 2, 5], description: 'Common jazz standard progression' }
    ],
    'Color & Tension': [
      { name: 'I-V/vi-vi', pattern: [1, 3, 6], description: 'Secondary dominant pulling to the relative minor' },
      { name: 'I-iii-IV-V', pattern: [1, 3, 4, 5], description: 'Medial progression with a surprise third' },
      { name: 'I-IV-vi-V', pattern: [1, 4, 6, 5], description: 'Variation on the pop classic' },
      { name: 'ii-IV-V', pattern: [2, 4, 5], description: 'Minor start, major resolution' }
    ],
    'Minor Moods': [
      { name: 'i-iv-v', pattern: [1, 4, 5], description: 'Natural minor classic — all minor chords' },
      { name: 'i-VI-III-VII', pattern: [1, 6, 3, 7], description: 'Dark and mysterious minor progression' },
      { name: 'i-iv-VII', pattern: [1, 4, 7], description: 'Modal minor with a flat-seven lift' },
      { name: 'i-VI-iv-V', pattern: [1, 6, 4, 5], description: 'Minor variation on the pop progression' }
    ],
    'Turnarounds': [
      { name: 'I-V-iv-IV', pattern: [1, 5, 4, 4], description: 'Bluesy turnaround with chromatic flavor' },
      { name: 'I-V-I-IV', pattern: [1, 5, 1, 4], description: 'Simple and effective cadence' },
      { name: 'I-IV-I-V', pattern: [1, 4, 1, 5], description: 'Plagal to dominant resolution' },
      { name: 'vi-ii-V-I', pattern: [6, 2, 5, 1], description: 'Full circle cadence' }
    ],
    'Extended Journeys': [
      { name: 'I-V-vi-iii-IV-I-IV-V', pattern: [1, 5, 6, 3, 4, 1, 4, 5], description: 'The full 50s progression' },
      { name: 'I-ii-iii-IV-V-vi', pattern: [1, 2, 3, 4, 5, 6], description: 'Ascending through the scale' },
      { name: 'I-V-IV-iii-ii-i', pattern: [1, 5, 4, 3, 2, 1], description: 'Descending chromatic feel' }
    ]
  };

  const decks = [];

  // Generate decks for each category
  for (const [categoryName, patterns] of Object.entries(patternsByCategory)) {
    const deckId = categoryName.toLowerCase().replace(/[^a-z]/g, '-');
    const deck = {
      id: deckId,
      title: categoryName,
      description: `Explore ${patterns.length} essential progressions in the ${categoryName} family`,
      progressions: []
    };

    const MAJOR_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    const MINOR_ROMAN = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

    // Generate progressions for each pattern in all 12 keys
    for (const pattern of patterns) {
      // Generate for major keys
      for (const key of NOTE_NAMES_FLAT) {
        const chords = pattern.pattern.map(deg => degreeToChord(deg, key, false));
        const roman = pattern.pattern.map(deg => MAJOR_ROMAN[deg - 1] || String(deg));

        deck.progressions.push({
          id: `${deckId}-${pattern.name.toLowerCase().replace(/[^a-z]/g, '-')}-${key.toLowerCase().replace('#', 's')}`,
          key: key,
          mode: 'major',
          roman: roman,
          chords: chords,
          patternName: pattern.name,
          patternDescription: pattern.description
        });
      }

      // Generate for minor keys
      for (const key of NOTE_NAMES_FLAT) {
        const minorKey = key + 'm';
        const chords = pattern.pattern.map(deg => degreeToChord(deg, key, true));
        const roman = pattern.pattern.map(deg => MINOR_ROMAN[deg - 1] || String(deg));

        deck.progressions.push({
          id: `${deckId}-${pattern.name.toLowerCase().replace(/[^a-z]/g, '-')}-${key.toLowerCase().replace('#', 's')}-min`,
          key: minorKey,
          mode: 'minor',
          roman: roman,
          chords: chords,
          patternName: pattern.name,
          patternDescription: pattern.description
        });
      }
    }

    decks.push(deck);
  }

  return decks;
}

// Generate all decks
const DECKS = generateDecks();

// ═══════════════════════════════════════════════════════════
// Export for use in progressions.js
// ═══════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DECKS };
}
