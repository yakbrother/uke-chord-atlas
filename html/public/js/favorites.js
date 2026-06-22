// ═══════════════════════════════════════════════════════════
// FAVORITES MODULE
// Manages favorited chord voicings in localStorage
// ═══════════════════════════════════════════════════════════

const FAVORITES_STORAGE_KEY = 'uca-favorites';

/**
 * Get all favorites from localStorage
 * @returns {Array} Array of favorite entries: { root, type, frets }
 */
function getFavorites() {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Save favorites to localStorage
 * @param {Array} favorites - Array of favorite entries
 */
function saveFavorites(favorites) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch (e) {
    // localStorage may be unavailable, silently fail
  }
}

/**
 * Check if a specific voicing is favorited
 * @param {number} root - The root note (0-11)
 * @param {string} type - The chord type id
 * @param {Array} frets - The fret positions
 * @returns {boolean} True if favorited
 */
function isFavorite(root, type, frets) {
  const favorites = getFavorites();
  const fretKey = frets.join(',');
  return favorites.some(f => 
    f.root === root && f.type === type && f.frets === fretKey
  );
}

/**
 * Toggle favorite status for a voicing
 * @param {number} root - The root note (0-11)
 * @param {string} type - The chord type id
 * @param {Array} frets - The fret positions
 * @returns {boolean} New favorite status (true = favorited, false = unfavorited)
 */
function toggleFavorite(root, type, frets) {
  const favorites = getFavorites();
  const fretKey = frets.join(',');
  const existingIndex = favorites.findIndex(f => 
    f.root === root && f.type === type && f.frets === fretKey
  );

  if (existingIndex > -1) {
    favorites.splice(existingIndex, 1);
    saveFavorites(favorites);
    return false;
  } else {
    favorites.push({ root, type, frets: fretKey });
    saveFavorites(favorites);
    return true;
  }
}

/**
 * Get SVG star icon for favorite button
 * @param {boolean} isFavorited - Current favorite status
 * @returns {string} SVG star icon
 */
function getStarIcon(isFavorited) {
  const fill = isFavorited ? '#daa520' : 'none';
  const stroke = isFavorited ? '#daa520' : 'currentColor';
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>`;
}
