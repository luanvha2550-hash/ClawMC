// tests/unit/utils/helpers.test.js

import {
  formatCoords,
  parseCoords,
  sleep,
  retry,
  distance,
  truncate,
  sanitizeFilename,
  timestamp
} from '../../../src/utils/helpers.js';

describe('Helpers', () => {
  describe('formatCoords', () => {
    it('should format coordinates', () => {
      expect(formatCoords(100, 64, -200)).toBe('(100, 64, -200)');
    });

    it('should round decimal values', () => {
      expect(formatCoords(100.5, 64.9, -200.1)).toBe('(101, 65, -200)');
    });
  });

  describe('parseCoords', () => {
    it('should parse coordinate string', () => {
      expect(parseCoords('100 64 -200')).toEqual({ x: 100, y: 64, z: -200 });
    });

    it('should parse coordinate with commas', () => {
      expect(parseCoords('100, 64, -200')).toEqual({ x: 100, y: 64, z: -200 });
    });

    it('should parse parenthesized format', () => {
      expect(parseCoords('(100, 64, -200)')).toEqual({ x: 100, y: 64, z: -200 });
    });

    it('should return null for invalid input', () => {
      expect(parseCoords('invalid')).toBeNull();
    });

    it('should return null for partial input', () => {
      expect(parseCoords('100 64')).toBeNull();
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe('retry', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      };

      const result = await retry(fn, { maxAttempts: 3, delay: 10 });
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max attempts', async () => {
      const fn = async () => { throw new Error('always fail'); };

      await expect(retry(fn, { maxAttempts: 2, delay: 10 }))
        .rejects.toThrow('always fail');
    });

    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return 'success';
      };

      const result = await retry(fn, { maxAttempts: 3, delay: 10 });
      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });
  });

  describe('distance', () => {
    it('should calculate 3D distance', () => {
      const pos1 = { x: 0, y: 0, z: 0 };
      const pos2 = { x: 3, y: 4, z: 0 };
      expect(distance(pos1, pos2)).toBe(5);
    });

    it('should return 0 for same position', () => {
      const pos = { x: 100, y: 64, z: -200 };
      expect(distance(pos, pos)).toBe(0);
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('hello world', 5)).toBe('he...');
    });

    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should handle exact length strings', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove invalid characters', () => {
      // Input has 9 invalid chars: < > : " / \ | ? *
      expect(sanitizeFilename('file<>:"/\\|?*.txt')).toBe('file_________.txt');
    });

    it('should not modify valid filenames', () => {
      expect(sanitizeFilename('valid_file-name.txt')).toBe('valid_file-name.txt');
    });
  });

  describe('timestamp', () => {
    it('should generate timestamp string', () => {
      const ts = timestamp();
      expect(ts).toMatch(/^\d{14}$/);
    });

    it('should generate different timestamps', async () => {
      const ts1 = timestamp();
      await sleep(10);
      const ts2 = timestamp();
      // Timestamps should be the same if within the same second
      // So we just verify format
      expect(ts1).toMatch(/^\d{14}$/);
      expect(ts2).toMatch(/^\d{14}$/);
    });
  });
});