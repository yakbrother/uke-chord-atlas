// ═══════════════════════════════════════════════════════════
// PROGRESSION DECK DATA (algorithmically generated)
// Custom deck names and descriptions - not replicating chord_files IP
// ═══════════════════════════════════════════════════════════

// All 12 chromatic roots
const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Flatten for simpler use
const ALL_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Roman numeral to scale degree mapping
const ROMAN_TO_DEGREE = {
  'I': 1, 'i': 1,
  'II': 2, 'ii': 2,
  'III': 3, 'iii': 3,
  'IV': 4, 'iv': 4,
  'V': 5, 'v': 5,
  'VI': 6, 'vi': 6,
  'VII': 7, 'vii': 7,
  'vii°': 7
};

// Major scale chord types for each degree
const MAJOR_SCALE_CHORDS = [
  null, // 0
  'maj',  // I
  'min',  // ii
  'min',  // iii
  'maj',  // IV
  'maj',  // V
  'min',  // vi
  'dim'   // vii°
];

// Minor scale chord types (natural minor)
const MINOR_SCALE_CHORDS = [
  null, // 0
  'min',  // i
  'dim',  // ii°
  'maj',  // III
  'min',  // iv
  'min',  // v
  'maj',  // VI
  'maj'   // VII
];

/**
 * Resolve a Roman numeral to a chord name in a given key
 * @param {string} roman - Roman numeral (e.g., 'I', 'iv', 'V7')
 * @param {string} key - The key (e.g., 'C', 'G')
 * @param {boolean} isMinor - Whether the key is minor
 * @returns {string} The chord name
 */
function romanToChord(roman, key, isMinor) {
  // Extract base roman and any suffix (like '7', 'maj7', etc.)
  const suffixMatch = roman.match(/^([ivIV]+°?)(.*)$/);
  if (!suffixMatch) return roman;

  const baseRoman = suffixMatch[1];
  const suffix = suffixMatch[2];

  const degree = ROMAN_TO_DEGREE[baseRoman];
  if (degree === undefined) return roman;

  // Find the root note index
  const keyIndex = ALL_ROOTS.indexOf(key);
  if (keyIndex === -1) return roman;

  // Calculate the chord root
  const scaleChords = isMinor ? MINOR_SCALE_CHORDS : MAJOR_SCALE_CHORDS;
  
  // For degree, map to semitones from tonic
  // Major: I=0, ii=2, iii=4, IV=5, V=7, vi=9, vii°=11
  // Minor: i=0, ii°=2, III=3, iv=5, v=7, VI=8, VII=10
  const majorOffsets = [0, 2, 4, 5, 7, 9, 11];
  const minorOffsets = [0, 2, 3, 5, 7, 8, 10];
  
  const offsets = isMinor ? minorOffsets : majorOffsets;
  const semitoneOffset = offsets[degree - 1];
  
  const chordRootIndex = (keyIndex + semitoneOffset) % 12;
  const chordRoot = ALL_ROOTS[chordRootIndex];

  // Determine base chord type
  const chordType = scaleChords[degree];
  
  // Special case for vii° in major
  const isDiminished = (baseRoman === 'vii°') || (isMinor && baseRoman === 'ii') || (baseRoman === 'ii°');
  const finalType = isDiminished ? 'dim' : (chordType || 'maj');

  // Build chord name
  let chordName = chordRoot;
  if (finalType !== 'maj') {
    chordName += finalType;
  }
  chordName += suffix;

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
      { name: 'i-IV-V', pattern: [1, 4, 5], description: 'Minor blues foundation' },
      { name: 'i-VI-III-VII', pattern: [1, 6, 3, 7], description: 'Dark and mysterious minor progression' },
      { name: 'i-iv-V', pattern: [1, 4, 5], description: 'Natural minor classic' },
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

    // Generate progressions for each pattern in all 12 keys
    for (const pattern of patterns) {
      // Generate for major keys
      for (const key of ALL_ROOTS) {
        const chords = pattern.pattern.map(deg => romanToChord(deg.toString(), key, false));
        const roman = pattern.pattern.map(deg => {
          const romanNums = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
          return romanNums[deg - 1] || deg.toString();
        });
        
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
      for (const key of ALL_ROOTS) {
        const minorKey = key + 'm';
        const chords = pattern.pattern.map(deg => romanToChord(deg.toString(), key, true));
        const roman = pattern.pattern.map(deg => {
          const romanNums = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
          return romanNums[deg - 1] || deg.toString().toLowerCase();
        });
        
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
