// Mock for mineflayer-pathfinder
import { jest } from '@jest/globals';

const GoalBlock = jest.fn().mockImplementation((x, y, z) => ({
  type: 'GoalBlock',
  x: Math.floor(x),
  y: Math.floor(y),
  z: Math.floor(z)
}));

const GoalNear = jest.fn().mockImplementation((x, y, z, range) => ({
  type: 'GoalNear',
  x: Math.floor(x),
  y: Math.floor(y),
  z: Math.floor(z),
  range
}));

const GoalXZ = jest.fn().mockImplementation((x, z) => ({
  type: 'GoalXZ',
  x: Math.floor(x),
  z: Math.floor(z)
}));

const GoalY = jest.fn().mockImplementation((y) => ({
  type: 'GoalY',
  y: Math.floor(y)
}));

const GoalGetToBlock = jest.fn().mockImplementation((x, y, z) => ({
  type: 'GoalGetToBlock',
  x: Math.floor(x),
  y: Math.floor(y),
  z: Math.floor(z)
}));

const GoalFollow = jest.fn().mockImplementation((entity, range) => ({
  type: 'GoalFollow',
  entity,
  range
}));

const GoalBreakBlock = jest.fn().mockImplementation((x, y, z) => ({
  type: 'GoalBreakBlock',
  x,
  y,
  z
}));

export {
  GoalBlock,
  GoalNear,
  GoalXZ,
  GoalY,
  GoalGetToBlock,
  GoalFollow,
  GoalBreakBlock
};

export default {
  GoalBlock,
  GoalNear,
  GoalXZ,
  GoalY,
  GoalGetToBlock,
  GoalFollow,
  GoalBreakBlock
};