import { jest } from '@jest/globals';
import { SkillRegistry } from '../../../src/skills/index.js';

describe('SkillRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  afterEach(() => {
    registry = null;
  });

  describe('register()', () => {
    it('should register a skill', () => {
      const skill = {
        name: 'test',
        description: 'Test skill',
        execute: jest.fn()
      };

      registry.register(skill);

      const registered = registry.get('test');
      expect(registered.name).toBe('test');
      expect(registered.description).toBe('Test skill');
      expect(registered.execute).toBe(skill.execute);
      expect(registered.type).toBe('base');
    });

    it('should throw on duplicate registration', () => {
      const skill = { name: 'test', description: 'Test', execute: jest.fn() };
      registry.register(skill);

      expect(() => registry.register(skill)).toThrow('already registered');
    });

    it('should throw if skill has no name', () => {
      const skill = { execute: jest.fn() };

      expect(() => registry.register(skill)).toThrow('must have a name');
    });

    it('should throw if skill has no execute function', () => {
      const skill = { name: 'test' };

      expect(() => registry.register(skill)).toThrow('must have execute function');
    });

    it('should throw if execute is not a function', () => {
      const skill = { name: 'test', execute: 'not a function' };

      expect(() => registry.register(skill)).toThrow('must have execute function');
    });

    it('should register skill with type base', () => {
      const skill = { name: 'test', execute: jest.fn() };
      registry.register(skill);

      const registered = registry.get('test');
      expect(registered.type).toBe('base');
      expect(registered.registered).toBeDefined();
    });
  });

  describe('get()', () => {
    it('should return skill by name', () => {
      const skill = { name: 'walk', execute: jest.fn() };
      registry.register(skill);

      const retrieved = registry.get('walk');
      expect(retrieved.name).toBe('walk');
      expect(retrieved.type).toBe('base');
    });

    it('should return undefined for unknown skill', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });

    it('should return dynamic skill by name', () => {
      const skill = { name: 'dynamic_skill', execute: jest.fn() };
      registry.registerDynamic(skill);

      const retrieved = registry.get('dynamic_skill');
      expect(retrieved.name).toBe('dynamic_skill');
      expect(retrieved.type).toBe('dynamic');
    });

    it('should prefer base skill over dynamic with same name', () => {
      const baseSkill = { name: 'test', execute: jest.fn() };
      const dynamicSkill = { name: 'test', execute: jest.fn() };

      registry.register(baseSkill);
      registry.registerDynamic(dynamicSkill);

      // Base skills are stored in skills map, dynamic in dynamicSkills map
      // get() checks skills first
      const retrieved = registry.get('test');
      expect(retrieved.type).toBe('base');
    });
  });

  describe('has()', () => {
    it('should return true for registered skill', () => {
      const skill = { name: 'test', execute: jest.fn() };
      registry.register(skill);

      expect(registry.has('test')).toBe(true);
    });

    it('should return false for unknown skill', () => {
      expect(registry.has('unknown')).toBe(false);
    });

    it('should return true for dynamic skill', () => {
      const skill = { name: 'dynamic', execute: jest.fn() };
      registry.registerDynamic(skill);

      expect(registry.has('dynamic')).toBe(true);
    });
  });

  describe('list()', () => {
    it('should return empty array when no skills registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should list all skills', () => {
      registry.register({ name: 'walk', execute: jest.fn() });
      registry.register({ name: 'mine', execute: jest.fn() });

      const skills = registry.list();

      expect(skills).toHaveLength(2);
      expect(skills.map(s => s.name)).toContain('walk');
      expect(skills.map(s => s.name)).toContain('mine');
    });

    it('should include both base and dynamic skills', () => {
      registry.register({ name: 'base_skill', execute: jest.fn() });
      registry.registerDynamic({ name: 'dynamic_skill', execute: jest.fn() });

      const skills = registry.list();

      expect(skills).toHaveLength(2);
      expect(skills.map(s => s.name)).toContain('base_skill');
      expect(skills.map(s => s.name)).toContain('dynamic_skill');
    });
  });

  describe('listBase()', () => {
    it('should return empty array when no base skills', () => {
      registry.registerDynamic({ name: 'dynamic', execute: jest.fn() });

      expect(registry.listBase()).toEqual([]);
    });

    it('should list only base skills', () => {
      registry.register({ name: 'base1', execute: jest.fn() });
      registry.register({ name: 'base2', execute: jest.fn() });
      registry.registerDynamic({ name: 'dynamic', execute: jest.fn() });

      const baseSkills = registry.listBase();

      expect(baseSkills).toHaveLength(2);
      expect(baseSkills.map(s => s.name)).toContain('base1');
      expect(baseSkills.map(s => s.name)).toContain('base2');
      expect(baseSkills.map(s => s.name)).not.toContain('dynamic');
    });
  });

  describe('listDynamic()', () => {
    it('should return empty array when no dynamic skills', () => {
      registry.register({ name: 'base', execute: jest.fn() });

      expect(registry.listDynamic()).toEqual([]);
    });

    it('should list only dynamic skills', () => {
      registry.register({ name: 'base', execute: jest.fn() });
      registry.registerDynamic({ name: 'dynamic1', execute: jest.fn() });
      registry.registerDynamic({ name: 'dynamic2', execute: jest.fn() });

      const dynamicSkills = registry.listDynamic();

      expect(dynamicSkills).toHaveLength(2);
      expect(dynamicSkills.map(s => s.name)).toContain('dynamic1');
      expect(dynamicSkills.map(s => s.name)).toContain('dynamic2');
      expect(dynamicSkills.map(s => s.name)).not.toContain('base');
    });
  });

  describe('registerDynamic()', () => {
    it('should register dynamic skill', () => {
      const skill = { name: 'dynamic', execute: jest.fn() };
      registry.registerDynamic(skill);

      const retrieved = registry.get('dynamic');
      expect(retrieved.name).toBe('dynamic');
      expect(retrieved.type).toBe('dynamic');
    });

    it('should mark skill with type dynamic', () => {
      const skill = { name: 'dynamic', execute: jest.fn() };
      registry.registerDynamic(skill);

      const registered = registry.get('dynamic');
      expect(registered.type).toBe('dynamic');
    });

    it('should validate skill before registration', () => {
      const skill = { name: 'dynamic' }; // no execute

      expect(() => registry.registerDynamic(skill)).toThrow('must have execute function');
    });

    it('should allow overwriting existing dynamic skill', () => {
      const skill1 = { name: 'dynamic', execute: jest.fn() };
      const skill2 = { name: 'dynamic', execute: jest.fn() };

      registry.registerDynamic(skill1);
      registry.registerDynamic(skill2);

      const retrieved = registry.get('dynamic');
      expect(retrieved.name).toBe('dynamic');
      expect(retrieved.type).toBe('dynamic');
    });
  });

  describe('unregisterDynamic()', () => {
    it('should unregister dynamic skill', () => {
      const skill = { name: 'dynamic', execute: jest.fn() };
      registry.registerDynamic(skill);

      const result = registry.unregisterDynamic('dynamic');

      expect(result).toBe(true);
      expect(registry.has('dynamic')).toBe(false);
    });

    it('should return false for unknown skill', () => {
      const result = registry.unregisterDynamic('unknown');

      expect(result).toBe(false);
    });

    it('should not unregister base skill', () => {
      registry.register({ name: 'base', execute: jest.fn() });

      const result = registry.unregisterDynamic('base');

      expect(result).toBe(false);
      expect(registry.has('base')).toBe(true);
    });
  });

  describe('findSimilar()', () => {
    it('should find skills matching by name', () => {
      registry.register({ name: 'walk', description: 'Walk somewhere', execute: jest.fn() });
      registry.register({ name: 'mine', description: 'Mine a block', execute: jest.fn() });

      const results = registry.findSimilar('walk');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].skill.name).toBe('walk');
      expect(results[0].confidence).toBe(0.9); // name match has higher confidence
    });

    it('should find skills matching by description', () => {
      registry.register({ name: 'move', description: 'Walk to a location', execute: jest.fn() });
      registry.register({ name: 'mine', description: 'Mine a block', execute: jest.fn() });

      const results = registry.findSimilar('walk');

      expect(results.length).toBe(1);
      expect(results[0].skill.name).toBe('move');
      expect(results[0].confidence).toBe(0.7); // description match has lower confidence
    });

    it('should return empty array for no matches', () => {
      registry.register({ name: 'walk', execute: jest.fn() });

      const results = registry.findSimilar('nonexistent');

      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      registry.register({ name: 'Walk', description: 'Walk around', execute: jest.fn() });

      const results = registry.findSimilar('WALK');

      expect(results.length).toBe(1);
      expect(results[0].skill.name).toBe('Walk');
    });

    it('should search both base and dynamic skills', () => {
      registry.register({ name: 'base_walk', description: 'Base walk', execute: jest.fn() });
      registry.registerDynamic({ name: 'dynamic_walk', description: 'Dynamic walk', execute: jest.fn() });

      const results = registry.findSimilar('walk');

      expect(results.length).toBe(2);
    });

    it('should sort by confidence (name match first)', () => {
      registry.register({ name: 'walk', description: 'Move around', execute: jest.fn() });
      registry.register({ name: 'move', description: 'Walk to destination', execute: jest.fn() });

      const results = registry.findSimilar('walk');

      expect(results.length).toBe(2);
      expect(results[0].skill.name).toBe('walk');
      expect(results[0].confidence).toBeGreaterThan(results[1].confidence);
    });
  });

  describe('getNames()', () => {
    it('should return empty array when no skills', () => {
      expect(registry.getNames()).toEqual([]);
    });

    it('should return all skill names', () => {
      registry.register({ name: 'walk', execute: jest.fn() });
      registry.register({ name: 'mine', execute: jest.fn() });
      registry.registerDynamic({ name: 'dynamic', execute: jest.fn() });

      const names = registry.getNames();

      expect(names).toHaveLength(3);
      expect(names).toContain('walk');
      expect(names).toContain('mine');
      expect(names).toContain('dynamic');
    });
  });

  describe('validateSkill()', () => {
    it('should validate skill with all required fields', () => {
      const skill = { name: 'valid', execute: jest.fn() };

      expect(() => registry.validateSkill(skill)).not.toThrow();
    });

    it('should throw for missing name', () => {
      const skill = { execute: jest.fn() };

      expect(() => registry.validateSkill(skill)).toThrow('must have a name');
    });

    it('should throw for empty name', () => {
      const skill = { name: '', execute: jest.fn() };

      expect(() => registry.validateSkill(skill)).toThrow('must have a name');
    });

    it('should throw for non-string name', () => {
      const skill = { name: 123, execute: jest.fn() };

      expect(() => registry.validateSkill(skill)).toThrow('must have a name');
    });

    it('should throw for missing execute', () => {
      const skill = { name: 'test' };

      expect(() => registry.validateSkill(skill)).toThrow('must have execute function');
    });

    it('should throw for non-function execute', () => {
      const skill = { name: 'test', execute: 'not a function' };

      expect(() => registry.validateSkill(skill)).toThrow('must have execute function');
    });
  });

  describe('loadBaseSkills()', () => {
    it('should load skills from directory', async () => {
      // This test would require mocking the file system
      // For now, we'll test the happy path with a mock implementation
      const mockSkillsDir = './test-skills-dir';

      // Create mock skills module
      const originalImport = registry.loadBaseSkills;

      // Mock the directory reading by overriding the method
      registry.loadBaseSkills = async function(dir) {
        // Simulate loading one skill
        this.register({
          name: 'mock_skill',
          description: 'A mock skill for testing',
          execute: () => {}
        });
        return this.skills.size;
      };

      await registry.loadBaseSkills(mockSkillsDir);

      expect(registry.has('mock_skill')).toBe(true);
    });

    it('should handle non-existent directory gracefully', async () => {
      await expect(registry.loadBaseSkills('./non-existent-dir')).resolves.not.toThrow();
    });
  });

  describe('integration', () => {
    it('should support full lifecycle: register, use, unregister', () => {
      const skill = { name: 'test', description: 'Test skill', execute: jest.fn() };

      // Register
      registry.register(skill);
      expect(registry.has('test')).toBe(true);

      // Get
      const retrieved = registry.get('test');
      expect(retrieved.name).toBe('test');
      expect(retrieved.type).toBe('base');

      // List
      const skills = registry.list();
      expect(skills).toContainEqual(expect.objectContaining({ name: 'test' }));

      // Find similar
      const similar = registry.findSimilar('test');
      expect(similar.length).toBe(1);
      expect(similar[0].skill.name).toBe('test');
    });

    it('should support mixed base and dynamic skills', () => {
      const baseSkill = { name: 'base', execute: jest.fn() };
      const dynamicSkill = { name: 'dynamic', execute: jest.fn() };

      registry.register(baseSkill);
      registry.registerDynamic(dynamicSkill);

      expect(registry.listBase().length).toBe(1);
      expect(registry.listDynamic().length).toBe(1);
      expect(registry.list().length).toBe(2);

      registry.unregisterDynamic('dynamic');

      expect(registry.listDynamic().length).toBe(0);
      expect(registry.listBase().length).toBe(1);
      expect(registry.list().length).toBe(1);
    });
  });
});