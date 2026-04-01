// src/skills/utils/navigation.js
// Navigation utility functions

/**
 * Wraps a promise with a timeout, rejecting if timeout is reached first.
 * Properly clears the timeout to prevent memory leaks.
 *
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [errorMessage] - Custom error message (default: "Operation timed out after {timeoutMs}ms")
 * @returns {Promise} The original promise result or rejection on timeout
 */
export async function withTimeout(promise, timeoutMs, errorMessage) {
  const message = errorMessage || `Operation timed out after ${timeoutMs}ms`;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Calculate the Euclidean distance between two positions.
 *
 * @param {Object} pos1 - First position with x, y, z properties
 * @param {Object} pos2 - Second position with x, y, z properties
 * @returns {number} The distance between the two positions
 */
export function distanceBetween(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Creates a timeout error for navigation operations.
 *
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Error} Timeout error with descriptive message
 */
export function createNavigationTimeoutError(timeoutMs) {
  return new Error(`Navigation timeout after ${timeoutMs}ms`);
}

export default {
  withTimeout,
  distanceBetween,
  createNavigationTimeoutError
};