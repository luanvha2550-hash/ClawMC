// src/utils/helpers.js

/**
 * Format coordinates as string
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {string} Formatted coordinates
 */
export function formatCoords(x, y, z) {
  return `(${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)})`;
}

/**
 * Parse coordinates from string
 * Supports: "100 64 -200", "100, 64, -200", "(100, 64, -200)"
 * @param {string} str - String to parse
 * @returns {{x: number, y: number, z: number}|null} Parsed coordinates or null
 */
export function parseCoords(str) {
  if (!str || typeof str !== 'string') return null;

  const cleaned = str.replace(/[()]/g, '').trim();
  const parts = cleaned.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

  if (parts.length >= 3) {
    return { x: parts[0], y: parts[1], z: parts[2] };
  }

  return null;
}

/**
 * Async sleep
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum attempts (default: 3)
 * @param {number} options.delay - Initial delay in ms (default: 1000)
 * @param {number} options.backoff - Backoff multiplier (default: 2)
 * @returns {Promise<*>} Result of the function
 */
export async function retry(fn, options = {}) {
  const { maxAttempts = 3, delay = 1000, backoff = 2 } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
}

/**
 * Calculate 3D distance between two positions
 * @param {{x: number, y: number, z: number}} pos1 - First position
 * @param {{x: number, y: number, z: number}} pos2 - Second position
 * @returns {number} Distance between positions
 */
export function distance(pos1, pos2) {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Truncate string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
export function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Sanitize filename by removing invalid characters
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Generate timestamp string (YYYYMMDDHHmmss)
 * @returns {string} Timestamp string
 */
export function timestamp() {
  const now = new Date();
  return now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
}

/**
 * Get inventory items as array
 * @param {Object} bot - Mineflayer bot instance
 * @returns {Array<{name: string, count: number, slot: number}>} Items array
 */
export function getInventoryItems(bot) {
  if (!bot?.inventory?.items) return [];
  return bot.inventory.items().map(item => ({
    name: item.name,
    count: item.count,
    slot: item.slot
  }));
}

/**
 * Find item in inventory by name
 * @param {Object} bot - Mineflayer bot instance
 * @param {string} itemName - Item name to find
 * @returns {Object|null} Found item or null
 */
export function findItem(bot, itemName) {
  if (!bot?.inventory) return null;
  return bot.inventory.items().find(item =>
    item.name.toLowerCase().includes(itemName.toLowerCase())
  );
}