import { jest } from '@jest/globals';
import { AlertSystem, AlertSeverity, AlertState, createAlertSystem, getAlertSystem } from '../../../src/robustness/alerts.js';

describe('AlertSystem', () => {
  let alerts;

  beforeEach(() => {
    alerts = new AlertSystem({
      raiseAfter: 2,
      resolveAfter: 1,
      cooldown: 100 // Short cooldown for testing
    });
  });

  afterEach(() => {
    alerts.removeAllListeners();
  });

  describe('Constructor', () => {
    it('should initialize with default thresholds', () => {
      expect(alerts.thresholds.memoryHigh).toBe(85);
      expect(alerts.thresholds.memoryCritical).toBe(91);
      expect(alerts.thresholds.llmErrorRate).toBe(20);
      expect(alerts.thresholds.skillFailureRate).toBe(30);
    });

    it('should accept custom thresholds', () => {
      const customAlerts = new AlertSystem({
        memoryHigh: 80,
        memoryCritical: 95,
        llmErrorRate: 10
      });
      expect(customAlerts.thresholds.memoryHigh).toBe(80);
      expect(customAlerts.thresholds.memoryCritical).toBe(95);
      expect(customAlerts.thresholds.llmErrorRate).toBe(10);
    });

    it('should initialize default alert definitions', () => {
      expect(alerts.alertDefs.has('memory_high')).toBe(true);
      expect(alerts.alertDefs.has('memory_critical')).toBe(true);
      expect(alerts.alertDefs.has('llm_error_rate')).toBe(true);
      expect(alerts.alertDefs.has('skill_failure_rate')).toBe(true);
    });
  });

  describe('defineAlert()', () => {
    it('should define a new alert', () => {
      alerts.defineAlert('custom_alert', {
        check: () => true,
        severity: AlertSeverity.WARNING,
        message: 'Custom alert triggered'
      });

      expect(alerts.alertDefs.has('custom_alert')).toBe(true);
      expect(alerts.alertStates.has('custom_alert')).toBe(true);
    });
  });

  describe('registerAction()', () => {
    it('should register an action for an alert', () => {
      const action = jest.fn();
      alerts.registerAction('memory_high', action);

      expect(alerts.actions.get('memory_high')).toContain(action);
    });

    it('should support multiple actions per alert', () => {
      const action1 = jest.fn();
      const action2 = jest.fn();
      alerts.registerAction('memory_high', action1);
      alerts.registerAction('memory_high', action2);

      expect(alerts.actions.get('memory_high')).toHaveLength(2);
    });
  });

  describe('Hysteresis logic', () => {
    it('should require raiseAfter checks to raise alert', () => {
      const checkMock = jest.fn().mockReturnValue(true);

      alerts.defineAlert('test_alert', {
        check: checkMock,
        severity: AlertSeverity.WARNING,
        message: 'Test alert',
        raiseAfter: 3,
        resolveAfter: 1
      });

      // First check - should be RAISING
      let result = alerts.check();
      expect(result.test_alert.state).toBe(AlertState.RAISING);
      expect(result.test_alert.counter).toBe(1);

      // Second check - still RAISING
      result = alerts.check();
      expect(result.test_alert.state).toBe(AlertState.RAISING);
      expect(result.test_alert.counter).toBe(2);

      // Third check - should be ACTIVE
      result = alerts.check();
      expect(result.test_alert.state).toBe(AlertState.ACTIVE);
    });

    it('should require resolveAfter checks to resolve alert', () => {
      const checkMock = jest.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false);

      alerts.defineAlert('test_alert', {
        check: checkMock,
        severity: AlertSeverity.WARNING,
        message: 'Test alert',
        raiseAfter: 2,
        resolveAfter: 2
      });

      // Raise the alert
      alerts.check();
      alerts.check();
      let result = alerts.check();
      expect(result.test_alert.state).toBe(AlertState.ACTIVE);

      // Condition clears - should be RESOLVING
      result = alerts.check();
      expect(result.test_alert.state).toBe(AlertState.RESOLVING);
      expect(result.test_alert.counter).toBe(1);

      // Second resolve check - should be RESOLVED
      result = alerts.check();
      expect(result.test_alert.state).toBe(AlertState.RESOLVED);
    });

    it('should go back to ACTIVE if condition returns during RESOLVING', () => {
      let condition = false;
      alerts.defineAlert('test_alert', {
        check: () => condition,
        severity: AlertSeverity.WARNING,
        message: 'Test alert',
        raiseAfter: 1,
        resolveAfter: 3
      });

      // Raise alert
      condition = true;
      alerts.check();
      let state = alerts.alertStates.get('test_alert');
      expect(state.state).toBe(AlertState.ACTIVE);

      // Start resolving
      condition = false;
      alerts.check();
      state = alerts.alertStates.get('test_alert');
      expect(state.state).toBe(AlertState.RESOLVING);

      // Condition returns
      condition = true;
      alerts.check();
      state = alerts.alertStates.get('test_alert');
      expect(state.state).toBe(AlertState.ACTIVE);
    });
  });

  describe('check()', () => {
    it('should check all defined alerts', () => {
      const results = alerts.check();
      expect(results.memory_high).toBeDefined();
      expect(results.memory_critical).toBeDefined();
      expect(results.llm_error_rate).toBeDefined();
      expect(results.skill_failure_rate).toBeDefined();
    });

    it('should emit alert event when alert raised', (done) => {
      alerts.defineAlert('instant_alert', {
        check: () => true,
        severity: AlertSeverity.WARNING,
        message: 'Instant alert',
        raiseAfter: 1
      });

      alerts.on('alert', (data) => {
        expect(data.name).toBe('instant_alert');
        expect(data.severity).toBe(AlertSeverity.WARNING);
        done();
      });

      alerts.check();
    });

    it('should execute registered actions', (done) => {
      alerts.defineAlert('action_alert', {
        check: () => true,
        severity: AlertSeverity.WARNING,
        message: 'Action alert',
        raiseAfter: 1
      });

      alerts.registerAction('action_alert', (data) => {
        expect(data.name).toBe('action_alert');
        done();
      });

      alerts.check();
    });
  });

  describe('checkMemory()', () => {
    it('should return true when memory exceeds threshold', () => {
      // High threshold always returns false for test
      const result = alerts.checkMemory(0); // 0% threshold, always true
      expect(result).toBe(true);
    });

    it('should return false when memory below threshold', () => {
      // 200% threshold, impossible to reach
      const result = alerts.checkMemory(200);
      expect(result).toBe(false);
    });
  });

  describe('checkLLMErrorRate()', () => {
    it('should return false with insufficient samples', () => {
      const metrics = {
        counters: { llmCalls: 2, llmErrors: 1 }
      };
      expect(alerts.checkLLMErrorRate(metrics, 10)).toBe(false);
    });

    it('should return true when error rate exceeds threshold', () => {
      const metrics = {
        counters: { llmCalls: 10, llmErrors: 5 }
      };
      expect(alerts.checkLLMErrorRate(metrics, 40)).toBe(true); // 50% > 40%
    });

    it('should return false when error rate below threshold', () => {
      const metrics = {
        counters: { llmCalls: 10, llmErrors: 1 }
      };
      expect(alerts.checkLLMErrorRate(metrics, 50)).toBe(false); // 10% < 50%
    });
  });

  describe('checkSkillFailureRate()', () => {
    it('should return false with insufficient samples', () => {
      const metrics = {
        counters: { skillSuccesses: 2, skillFailures: 1 }
      };
      expect(alerts.checkSkillFailureRate(metrics, 10)).toBe(false);
    });

    it('should return true when failure rate exceeds threshold', () => {
      const metrics = {
        counters: { skillSuccesses: 5, skillFailures: 5 }
      };
      expect(alerts.checkSkillFailureRate(metrics, 40)).toBe(true); // 50% > 40%
    });
  });

  describe('processAlert() and resolveAlert()', () => {
    it('should manually process an alert', () => {
      alerts.processAlert('memory_high');
      const active = alerts.getActiveAlerts();
      expect(active.find(a => a.name === 'memory_high')).toBeDefined();
    });

    it('should manually resolve an alert', () => {
      alerts.processAlert('memory_high');
      alerts.resolveAlert('memory_high');
      const active = alerts.getActiveAlerts();
      expect(active.find(a => a.name === 'memory_high')).toBeUndefined();
    });

    it('should emit resolved event', (done) => {
      alerts.processAlert('memory_high');
      alerts.on('resolved', (data) => {
        expect(data.name).toBe('memory_high');
        done();
      });
      alerts.resolveAlert('memory_high');
    });
  });

  describe('getActiveAlerts()', () => {
    it('should return empty array when no alerts active', () => {
      expect(alerts.getActiveAlerts()).toHaveLength(0);
    });

    it('should return active alerts', () => {
      alerts.processAlert('memory_high');
      alerts.processAlert('memory_critical');

      const active = alerts.getActiveAlerts();
      expect(active).toHaveLength(2);
    });
  });

  describe('reset()', () => {
    it('should reset all alert states', () => {
      alerts.processAlert('memory_high');
      alerts.reset();

      expect(alerts.getActiveAlerts()).toHaveLength(0);
    });

    it('should emit reset event', (done) => {
      alerts.on('reset', done);
      alerts.reset();
    });
  });

  describe('Cooldown', () => {
    it('should skip alert during cooldown after resolve', () => {
      // Process alert to make it ACTIVE
      alerts.processAlert('memory_high');
      expect(alerts.alertStates.get('memory_high').state).toBe(AlertState.ACTIVE);

      // Manually resolve the alert
      alerts.resolveAlert('memory_high');
      expect(alerts.alertStates.get('memory_high').state).toBe(AlertState.RESOLVED);

      // Immediate check should be skipped due to cooldown
      const results = alerts.check();
      expect(results.memory_high.skipped).toBe(true);
    });

    it('should not skip alert when not in cooldown', async () => {
      // Define an alert with short cooldown for testing
      alerts.defineAlert('short_cooldown_alert', {
        check: () => false,
        severity: AlertSeverity.WARNING,
        message: 'Short cooldown alert',
        raiseAfter: 1,
        resolveAfter: 1,
        cooldown: 50 // 50ms cooldown
      });

      alerts.processAlert('short_cooldown_alert');
      alerts.resolveAlert('short_cooldown_alert');

      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check should not be skipped
      const results = alerts.check();
      expect(results.short_cooldown_alert.skipped).toBeUndefined();
    });
  });

  describe('Singleton functions', () => {
    it('should create singleton with createAlertSystem', () => {
      const instance1 = createAlertSystem();
      const instance2 = getAlertSystem();
      expect(instance1).toBe(instance2);
    });
  });
});