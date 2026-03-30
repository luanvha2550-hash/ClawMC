// src/utils/config.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateConfig } from './configValidation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let configCache = null;

/**
 * Recursively transform config values after env var substitution
 * - Converts empty strings to undefined for optional fields
 * - Converts string numbers to actual numbers
 * - Normalizes case for enum fields
 * @param {any} obj - Object to transform
 * @returns {any} Transformed object
 */
function transformConfig(obj) {
  if (obj === null || typeof obj !== 'object') {
    // Handle primitive values
    if (typeof obj === 'string') {
      // Try to parse as number if it looks like one
      if (/^-?\d+$/.test(obj)) {
        return parseInt(obj, 10);
      }
      if (/^-?\d+\.\d+$/.test(obj)) {
        return parseFloat(obj);
      }
      // Normalize case for known enum fields (to lowercase)
      const upperVal = obj.toUpperCase();
      const lowerVal = obj.toLowerCase();
      if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(upperVal)) {
        return lowerVal;
      }
      if (['OFFLINE', 'MICROSOFT', 'MOJANG'].includes(upperVal)) {
        return lowerVal;
      }
      if (['LOCAL', 'API'].includes(upperVal)) {
        return lowerVal;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(transformConfig);
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = transformConfig(value);
  }
  return result;
}

/**
 * Load and parse configuration from a JSON file
 * Supports environment variable substitution with ${VAR} syntax
 * @param {string} configPath - Path to config file (default: ./config.json)
 * @returns {object} Parsed and validated configuration object
 */
export function loadConfig(configPath = './config.json') {
  const absolutePath = path.resolve(configPath);

  let content;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  // Substitute environment variables
  content = content.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
    const value = process.env[envVar];
    if (value === undefined) {
      console.warn(`Environment variable ${envVar} not set, using empty string`);
      return '';
    }
    return value;
  });

  let parsedConfig;
  try {
    parsedConfig = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON in config file: ${e.message}`);
  }

  // Transform and validate
  const transformedConfig = transformConfig(parsedConfig);
  return validateConfig(transformedConfig);
}

/**
 * Get cached config or load it if not cached
 * @param {string} configPath - Path to config file (default: ./config.json)
 * @returns {object} Configuration object
 */
export function getConfig(configPath = './config.json') {
  if (!configCache) {
    configCache = loadConfig(configPath);
  }
  return configCache;
}

/**
 * Clear the config cache (useful for testing)
 */
export function clearConfigCache() {
  configCache = null;
}

/**
 * Get a nested value from a config object using dot notation
 * @param {object} configObj - Configuration object
 * @param {string} pathStr - Dot-notation path (e.g., 'server.host')
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Value at path or default value
 */
export function get(configObj, pathStr, defaultValue = undefined) {
  const keys = pathStr.split('.');
  let current = configObj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    if (typeof current !== 'object') {
      return defaultValue;
    }
    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
}

/**
 * Set a nested value in a config object using dot notation
 * @param {object} configObj - Configuration object
 * @param {string} pathStr - Dot-notation path (e.g., 'server.host')
 * @param {*} value - Value to set
 * @returns {object} Modified config object
 */
export function set(configObj, pathStr, value) {
  const keys = pathStr.split('.');
  let current = configObj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return configObj;
}

export { configCache as config };
export { validateConfig } from './configValidation.js';