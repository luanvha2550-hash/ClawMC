import { jest } from '@jest/globals';
import { OperationStateMachine, OperationState, createOperationStateMachine, getOperationStateMachine } from '../../../src/robustness/stateMachine.js';

describe('OperationStateMachine', () => {
  let stateMachine;

  beforeEach(() => {
    stateMachine = new OperationStateMachine();
  });

  afterEach(() => {
    stateMachine.removeAllListeners();
  });

  describe('Constructor', () => {
    it('should initialize in IDLE state', () => {
      expect(stateMachine.currentState).toBe(OperationState.IDLE);
    });

    it('should have empty queue', () => {
      expect(stateMachine.queue).toHaveLength(0);
    });

    it('should have no current operation', () => {
      expect(stateMachine.currentOperation).toBeNull();
      expect(stateMachine.currentOwner).toBeNull();
    });
  });

  describe('OperationState enum', () => {
    it('should have correct states', () => {
      expect(OperationState.IDLE).toBe('idle');
      expect(OperationState.CHECKPOINTING).toBe('checkpointing');
      expect(OperationState.RECOVERING).toBe('recovering');
      expect(OperationState.SHUTTING_DOWN).toBe('shutting_down');
    });
  });

  describe('canTransitionTo()', () => {
    it('should allow transition to higher priority', () => {
      expect(stateMachine.canTransitionTo(OperationState.CHECKPOINTING)).toBe(true);
    });

    it('should allow transition from IDLE to any state', () => {
      expect(stateMachine.canTransitionTo(OperationState.CHECKPOINTING)).toBe(true);
      expect(stateMachine.canTransitionTo(OperationState.RECOVERING)).toBe(true);
      expect(stateMachine.canTransitionTo(OperationState.SHUTTING_DOWN)).toBe(true);
    });

    it('should not allow transition to lower priority when busy', async () => {
      await stateMachine.acquire('shutdown', 'test');
      expect(stateMachine.canTransitionTo(OperationState.CHECKPOINTING)).toBe(false);
      stateMachine.release('test');
    });
  });

  describe('canExecute()', () => {
    it('should return true when idle', () => {
      expect(stateMachine.canExecute('checkpoint')).toBe(true);
      expect(stateMachine.canExecute('recovery')).toBe(true);
      expect(stateMachine.canExecute('shutdown')).toBe(true);
    });

    it('should return false when higher priority operation running', async () => {
      await stateMachine.acquire('shutdown', 'test');
      expect(stateMachine.canExecute('checkpoint')).toBe(false);
      stateMachine.release('test');
    });
  });

  describe('acquire()', () => {
    it('should acquire immediately when idle', async () => {
      const result = await stateMachine.acquire('checkpoint', 'test-owner');

      expect(result.acquired).toBe(true);
      expect(result.state).toBe(OperationState.CHECKPOINTING);
      expect(stateMachine.currentOwner).toBe('test-owner');
    });

    it('should emit stateChange event', (done) => {
      stateMachine.on('stateChange', (data) => {
        expect(data.from).toBe(OperationState.IDLE);
        expect(data.to).toBe(OperationState.CHECKPOINTING);
        expect(data.operation).toBe('checkpoint');
        done();
      });

      stateMachine.acquire('checkpoint', 'test');
    });

    it('should queue when busy', async () => {
      await stateMachine.acquire('checkpoint', 'owner1', { timeout: 500 });

      // Second acquire should queue
      const acquirePromise = stateMachine.acquire('recovery', 'owner2', { timeout: 100 });

      expect(stateMachine.queue).toHaveLength(1);
      expect(stateMachine.queue[0].owner).toBe('owner2');

      // Release first to process queue
      stateMachine.release('owner1');

      // Second should now be acquired
      const result = await acquirePromise;
      expect(result.acquired).toBe(true);
      expect(stateMachine.currentOwner).toBe('owner2');

      stateMachine.release('owner2');
    });

    it('should timeout if not acquired in time', async () => {
      await stateMachine.acquire('shutdown', 'owner1', { timeout: 5000 });

      await expect(
        stateMachine.acquire('checkpoint', 'owner2', { timeout: 100 })
      ).rejects.toThrow('Acquire timeout');

      stateMachine.release('owner1');
    });
  });

  describe('release()', () => {
    it('should release operation and return to idle', async () => {
      await stateMachine.acquire('checkpoint', 'test-owner');
      stateMachine.release('test-owner');

      expect(stateMachine.currentState).toBe(OperationState.IDLE);
      expect(stateMachine.currentOperation).toBeNull();
    });

    it('should emit release event', (done) => {
      stateMachine.on('release', (data) => {
        expect(data.owner).toBe('test-owner');
        done();
      });

      stateMachine.acquire('checkpoint', 'test-owner').then(() => {
        stateMachine.release('test-owner');
      });
    });

    it('should reject release from non-owner', async () => {
      await stateMachine.acquire('checkpoint', 'owner1');
      const result = stateMachine.release('wrong-owner');

      expect(result).toBe(false);
      expect(stateMachine.currentOwner).toBe('owner1');

      stateMachine.release('owner1');
    });

    it('should process queue after release', async () => {
      await stateMachine.acquire('checkpoint', 'owner1', { timeout: 5000 });

      const acquirePromise = stateMachine.acquire('checkpoint', 'owner2', { timeout: 500 });
      stateMachine.release('owner1');

      await acquirePromise;
      expect(stateMachine.currentOwner).toBe('owner2');

      stateMachine.release('owner2');
    });
  });

  describe('forceShutdown()', () => {
    it('should transition to shutting_down state', () => {
      stateMachine.forceShutdown('test');

      expect(stateMachine.currentState).toBe(OperationState.SHUTTING_DOWN);
      expect(stateMachine.currentOperation).toBe('forced_shutdown');
    });

    it('should clear queue and reject waiting operations', async () => {
      await stateMachine.acquire('checkpoint', 'owner1', { timeout: 5000 });

      const acquirePromise = stateMachine.acquire('checkpoint', 'owner2', { timeout: 500 });
      stateMachine.forceShutdown('test');

      await expect(acquirePromise).rejects.toThrow('Operation cancelled');
      expect(stateMachine.queue).toHaveLength(0);
    });

    it('should emit shutdown event', (done) => {
      stateMachine.on('shutdown', (data) => {
        expect(data.reason).toBe('manual');
        done();
      });

      stateMachine.forceShutdown('manual');
    });
  });

  describe('getState()', () => {
    it('should return current state info', () => {
      const state = stateMachine.getState();

      expect(state.state).toBe(OperationState.IDLE);
      expect(state.operation).toBeNull();
      expect(state.owner).toBeNull();
      expect(state.queueLength).toBe(0);
    });

    it('should include duration when operation running', async () => {
      await stateMachine.acquire('checkpoint', 'test');

      // Small delay to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const state = stateMachine.getState();
      expect(state.duration).toBeGreaterThan(0);

      stateMachine.release('test');
    });
  });

  describe('isInState()', () => {
    it('should return true when in specified state', () => {
      expect(stateMachine.isInState(OperationState.IDLE)).toBe(true);
    });

    it('should return false when not in specified state', async () => {
      await stateMachine.acquire('checkpoint', 'test');
      expect(stateMachine.isInState(OperationState.IDLE)).toBe(false);
      stateMachine.release('test');
    });
  });

  describe('isBusy()', () => {
    it('should return false when idle', () => {
      expect(stateMachine.isBusy()).toBe(false);
    });

    it('should return true when operation running', async () => {
      await stateMachine.acquire('checkpoint', 'test');
      expect(stateMachine.isBusy()).toBe(true);
      stateMachine.release('test');
    });
  });

  describe('onState()', () => {
    it('should register callback for specific state', (done) => {
      stateMachine.onState(OperationState.CHECKPOINTING, (data) => {
        expect(data.operation).toBe('checkpoint');
        done();
      });

      stateMachine.acquire('checkpoint', 'test').then(() => {
        stateMachine.release('test');
      });
    });
  });

  describe('Priority ordering', () => {
    it('should sort queue by priority', async () => {
      await stateMachine.acquire('checkpoint', 'owner1', { timeout: 5000 });

      // Queue multiple operations
      const checkpointPromise = stateMachine.acquire('checkpoint', 'owner2', { timeout: 500 });
      const recoveryPromise = stateMachine.acquire('recovery', 'owner3', { timeout: 500 });
      const shutdownPromise = stateMachine.acquire('shutdown', 'owner4', { timeout: 500 });

      // Catch all promises to avoid unhandled rejections
      checkpointPromise.catch(() => {});
      recoveryPromise.catch(() => {});
      shutdownPromise.catch(() => {});

      // Verify queue has 3 items
      expect(stateMachine.queue).toHaveLength(3);

      // Release should process queue
      stateMachine.release('owner1');

      // After release, shutdown (highest priority) should be current
      expect(stateMachine.currentState).toBe(OperationState.SHUTTING_DOWN);
      expect(stateMachine.currentOwner).toBe('owner4');

      stateMachine.release('owner4');
    });
  });

  describe('reset()', () => {
    it('should reset to idle state', async () => {
      await stateMachine.acquire('checkpoint', 'test');
      stateMachine.reset();

      expect(stateMachine.currentState).toBe(OperationState.IDLE);
      expect(stateMachine.currentOperation).toBeNull();
    });

    it('should clear queue', async () => {
      await stateMachine.acquire('checkpoint', 'owner1', { timeout: 5000 });

      // Create a promise that will be rejected when reset is called
      const queuedPromise = stateMachine.acquire('checkpoint', 'owner2', { timeout: 500 });

      // Catch the rejection to avoid unhandled rejection
      queuedPromise.catch(() => {});

      stateMachine.reset();

      expect(stateMachine.queue).toHaveLength(0);
    });

    it('should emit reset event', (done) => {
      stateMachine.on('reset', done);
      stateMachine.reset();
    });
  });

  describe('Singleton functions', () => {
    it('should create singleton with createOperationStateMachine', () => {
      const instance1 = createOperationStateMachine();
      const instance2 = getOperationStateMachine();
      expect(instance1).toBe(instance2);
    });
  });
});