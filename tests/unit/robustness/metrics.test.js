import { jest } from '@jest/globals';
import { MetricsCollector, createMetricsCollector, getMetricsCollector } from '../../../src/robustness/metrics.js';

describe('MetricsCollector', () => {
  let metrics;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  describe('Constructor', () => {
    it('should initialize with default counters', () => {
      expect(metrics.counters).toBeDefined();
      expect(metrics.counters.llmCalls).toBe(0);
      expect(metrics.counters.llmTokensUsed).toBe(0);
      expect(metrics.counters.llmErrors).toBe(0);
      expect(metrics.counters.skillExecutions).toBe(0);
      expect(metrics.counters.skillSuccesses).toBe(0);
      expect(metrics.counters.skillFailures).toBe(0);
      expect(metrics.counters.messagesReceived).toBe(0);
      expect(metrics.counters.messagesSent).toBe(0);
      expect(metrics.counters.deaths).toBe(0);
      expect(metrics.counters.disconnects).toBe(0);
      expect(metrics.counters.reconnects).toBe(0);
    });

    it('should initialize with default gauges', () => {
      expect(metrics.gauges).toBeDefined();
      expect(metrics.gauges.heapUsedMB).toBe(0);
      expect(metrics.gauges.heapTotalMB).toBe(0);
      expect(metrics.gauges.activeTasks).toBe(0);
      expect(metrics.gauges.dbSizeMB).toBe(0);
    });

    it('should initialize empty histories', () => {
      expect(metrics.responseTimeHistory).toEqual([]);
      expect(metrics.taskDurationHistory).toEqual([]);
    });

    it('should accept custom config', () => {
      const customMetrics = new MetricsCollector({
        maxResponseTimeHistory: 50,
        maxTaskDurationHistory: 25
      });
      expect(customMetrics.maxResponseTimeHistory).toBe(50);
      expect(customMetrics.maxTaskDurationHistory).toBe(25);
    });
  });

  describe('increment()', () => {
    it('should increment a counter by 1', () => {
      metrics.increment('llmCalls');
      expect(metrics.counters.llmCalls).toBe(1);
    });

    it('should increment a counter by specified amount', () => {
      metrics.increment('llmTokensUsed', 100);
      expect(metrics.counters.llmTokensUsed).toBe(100);
    });

    it('should emit counter event', (done) => {
      metrics.on('counter', (data) => {
        expect(data.name).toBe('llmCalls');
        expect(data.value).toBe(1);
        expect(data.delta).toBe(1);
        done();
      });
      metrics.increment('llmCalls');
    });

    it('should ignore unknown counters', () => {
      const warnSpy = jest.spyOn(metrics.log, 'warn');
      metrics.increment('unknownCounter');
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('setGauge()', () => {
    it('should set a gauge value', () => {
      metrics.setGauge('heapUsedMB', 256.5);
      expect(metrics.gauges.heapUsedMB).toBe(256.5);
    });

    it('should emit gauge event', (done) => {
      metrics.on('gauge', (data) => {
        expect(data.name).toBe('activeTasks');
        expect(data.value).toBe(5);
        expect(data.oldValue).toBe(0);
        done();
      });
      metrics.setGauge('activeTasks', 5);
    });

    it('should ignore unknown gauges', () => {
      const warnSpy = jest.spyOn(metrics.log, 'warn');
      metrics.setGauge('unknownGauge', 100);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('recordResponseTime()', () => {
    it('should record response time', () => {
      metrics.recordResponseTime(150);
      expect(metrics.responseTimeHistory).toHaveLength(1);
      expect(metrics.responseTimeHistory[0].time).toBe(150);
      expect(metrics.responseTimeHistory[0].type).toBe('llm');
    });

    it('should record response time with type', () => {
      metrics.recordResponseTime(200, 'api');
      expect(metrics.responseTimeHistory[0].type).toBe('api');
    });

    it('should emit responseTime event', (done) => {
      metrics.on('responseTime', (data) => {
        expect(data.time).toBe(100);
        done();
      });
      metrics.recordResponseTime(100);
    });

    it('should enforce max history size', () => {
      const smallMetrics = new MetricsCollector({ maxResponseTimeHistory: 5 });

      for (let i = 0; i < 10; i++) {
        smallMetrics.recordResponseTime(i);
      }

      expect(smallMetrics.responseTimeHistory).toHaveLength(5);
      expect(smallMetrics.responseTimeHistory[0].time).toBe(5);
      expect(smallMetrics.responseTimeHistory[4].time).toBe(9);
    });
  });

  describe('recordTaskDuration()', () => {
    it('should record task duration', () => {
      metrics.recordTaskDuration(500, 'harvest_wood');
      expect(metrics.taskDurationHistory).toHaveLength(1);
      expect(metrics.taskDurationHistory[0].duration).toBe(500);
      expect(metrics.taskDurationHistory[0].taskName).toBe('harvest_wood');
      expect(metrics.taskDurationHistory[0].success).toBe(true);
    });

    it('should record failed task', () => {
      metrics.recordTaskDuration(300, 'craft_item', false);
      expect(metrics.taskDurationHistory[0].success).toBe(false);
    });

    it('should enforce max history size', () => {
      const smallMetrics = new MetricsCollector({ maxTaskDurationHistory: 3 });

      for (let i = 0; i < 5; i++) {
        smallMetrics.recordTaskDuration(i * 100, `task_${i}`);
      }

      expect(smallMetrics.taskDurationHistory).toHaveLength(3);
    });
  });

  describe('updateMemoryMetrics()', () => {
    it('should update memory gauges', () => {
      metrics.updateMemoryMetrics();

      expect(metrics.gauges.heapUsedMB).toBeGreaterThan(0);
      expect(metrics.gauges.heapTotalMB).toBeGreaterThan(0);
    });
  });

  describe('getStats()', () => {
    beforeEach(() => {
      metrics.increment('llmCalls', 10);
      metrics.increment('llmErrors', 2);
      metrics.increment('skillSuccesses', 8);
      metrics.increment('skillFailures', 2);

      metrics.recordResponseTime(100);
      metrics.recordResponseTime(200);
      metrics.recordResponseTime(300);

      metrics.recordTaskDuration(1000, 'task1');
      metrics.recordTaskDuration(2000, 'task2');
    });

    it('should return uptime', () => {
      const stats = metrics.getStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return counters copy', () => {
      const stats = metrics.getStats();
      expect(stats.counters.llmCalls).toBe(10);
      expect(stats.counters.llmErrors).toBe(2);
    });

    it('should return gauges copy', () => {
      const stats = metrics.getStats();
      expect(stats.gauges).toBeDefined();
    });

    it('should calculate success rates', () => {
      const stats = metrics.getStats();
      expect(stats.rates.skillSuccessRate).toBe(80); // 8/10 = 80%
      expect(stats.rates.llmErrorRate).toBe(20); // 2/10 = 20%
    });

    it('should return response time stats', () => {
      const stats = metrics.getStats();
      expect(stats.responseTime.min).toBe(100);
      expect(stats.responseTime.max).toBe(300);
      expect(stats.responseTime.avg).toBe(200);
      expect(stats.responseTime.count).toBe(3);
    });

    it('should return task duration stats', () => {
      const stats = metrics.getStats();
      expect(stats.taskDuration.count).toBe(2);
    });
  });

  describe('export()', () => {
    it('should return exportable metrics', () => {
      metrics.increment('llmCalls', 5);
      const exported = metrics.export();

      expect(exported.timestamp).toBeDefined();
      expect(exported.counters.llmCalls).toBe(5);
    });
  });

  describe('reset()', () => {
    it('should reset all counters', () => {
      metrics.increment('llmCalls', 100);
      metrics.increment('deaths', 5);
      metrics.reset();

      expect(metrics.counters.llmCalls).toBe(0);
      expect(metrics.counters.deaths).toBe(0);
    });

    it('should reset all gauges', () => {
      metrics.setGauge('heapUsedMB', 500);
      metrics.reset();

      expect(metrics.gauges.heapUsedMB).toBe(0);
    });

    it('should clear histories', () => {
      metrics.recordResponseTime(100);
      metrics.recordTaskDuration(500, 'test');
      metrics.reset();

      expect(metrics.responseTimeHistory).toHaveLength(0);
      expect(metrics.taskDurationHistory).toHaveLength(0);
    });

    it('should emit reset event', (done) => {
      metrics.on('reset', done);
      metrics.reset();
    });
  });

  describe('Singleton functions', () => {
    it('should create singleton with createMetricsCollector', () => {
      const instance1 = createMetricsCollector();
      const instance2 = getMetricsCollector();
      expect(instance1).toBe(instance2);
    });
  });
});