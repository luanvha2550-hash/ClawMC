// src/skills/utils/navigation.js
// Navigation utility functions

/**
 * Wraps a promise with a timeout, rejecting if timeout is reached first.
 *
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [errorMessage] - Custom error message (default: "Operation timed out after {timeoutMs}ms")
 * @returns {Promise} The original promise result or rejection on timeout
 */
export async function withTimeout(promise, timeoutMs, errorMessage) {
  const message = errorMessage || `Operation timed out after ${timeoutMs}ms`;

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
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
  createNavigationTimeoutError
};