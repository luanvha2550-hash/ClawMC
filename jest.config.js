export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs', 'json'],
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapper: {
    '^mineflayer-pathfinder$': '<rootDir>/tests/__mocks__/mineflayer-pathfinder.js'
  }
};