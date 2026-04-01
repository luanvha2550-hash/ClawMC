// src/robustness/stateMachine.js

import { EventEmitter } from 'events';
import { getLogger } from '../utils/logger.js';

/**
 * Operation states
 */
export const OperationState = {
  IDLE: 'idle',
  CHECKPOINTING: 'checkpointing',
  RECOVERING: 'recovering',
  SHUTTING_DOWN: 'shutting_down'
};

/**
 * State priorities (higher = more important)
 */
const StatePriority = {
  [OperationState.IDLE]: 0,
  [OperationState.CHECKPOINTING]: 1,
  [OperationState.RECOVERING]: 2,
  [OperationState.SHUTTING_DOWN]: 3
};

/**
 * OperationStateMachine - Manages operation states with priority
 *
 * Features:
 * - Priority-based state transitions
 * - FIFO queue for waiting operations
 * - Lock acquisition for critical operations
 * - Force shutdown capability
 */
export class OperationStateMachine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.logger = config.logger || getLogger();
    this.log = this.logger.module('stateMachine');

    // Current state
    this.currentState = OperationState.IDLE;

    // Current operation info
    this.currentOperation = null;
    this.currentOwner = null;
    this.startedAt = null;

    // FIFO queue for waiting operations
    this.queue = [];

    // State change callbacks
    this.stateCallbacks = new Map();
  }

  /**
   * Check if a state transition is allowed based on priority
   * @param {string} targetState - Target state
   * @returns {boolean} True if transition is allowed
   */
  canTransitionTo(targetState) {
    const currentPriority = StatePriority[this.currentState];
    const targetPriority = StatePriority[targetState];

    // Can always transition to higher priority
    if (targetPriority > currentPriority) {
      return true;
    }

    // Can transition to same priority only if no operation is running
    if (targetPriority === currentPriority && !this.currentOperation) {
      return true;
    }

    // Lower priority only allowed when idle
    if (targetPriority < currentPriority && this.currentState === OperationState.IDLE) {
      return true;
    }

    return false;
  }

  /**
   * Check if an operation can execute based on current state
   * @param {string} operationType - Type of operation
   * @returns {boolean} True if operation can execute
   */
  canExecute(operationType) {
    // Map operation types to states
    const operationStates = {
      checkpoint: OperationState.CHECKPOINTING,
      recovery: OperationState.RECOVERING,
      shutdown: OperationState.SHUTTING_DOWN
    };

    const requiredState = operationStates[operationType];
    if (!requiredState) return true; // Unknown operations allowed

    // Can execute if:
    // 1. No operation is running
    // 2. Current state allows this operation
    if (!this.currentOperation && this.currentState === OperationState.IDLE) {
      return true;
    }

    // Check priority
    return this.canTransitionTo(requiredState);
  }

  /**
   * Acquire the state machine for an operation
   * @param {string} operationType - Type of operation
   * @param {string} owner - Owner identifier
   * @param {object} options - Options (timeout, priority)
   * @returns {Promise<object>} Acquisition result
   */
  async acquire(operationType, owner = 'unknown', options = {}) {
    const timeout = options.timeout || 30000; // 30 second default timeout

    // Map operation types to states
    const operationStates = {
      checkpoint: OperationState.CHECKPOINTING,
      recovery: OperationState.RECOVERING,
      shutdown: OperationState.SHUTTING_DOWN
    };

    const targetState = operationStates[operationType] || OperationState.IDLE;

    // Check if we can acquire immediately
    if (this.canTransitionTo(targetState) && !this.currentOperation) {
      return this._acquireNow(operationType, targetState, owner);
    }

    // Need to wait
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue
        const index = this.queue.findIndex(q => q.owner === owner);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error(`Acquire timeout for ${operationType}`));
      }, timeout);

      this.queue.push({
        operationType,
        targetState,
        owner,
        resolve,
        reject,
        timer
      });

      this.log.debug(`Queued operation: ${operationType} by ${owner}`, {
        queueSize: this.queue.length
      });
    });
  }

  /**
   * Acquire immediately without queuing
   * @private
   */
  _acquireNow(operationType, targetState, owner) {
    const previousState = this.currentState;

    this.currentState = targetState;
    this.currentOperation = operationType;
    this.currentOwner = owner;
    this.startedAt = Date.now();

    this.log.info(`State transition: ${previousState} -> ${targetState}`, {
      operation: operationType,
      owner
    });

    this.emit('stateChange', {
      from: previousState,
      to: targetState,
      operation: operationType,
      owner
    });

    return {
      acquired: true,
      state: targetState,
      previousState
    };
  }

  /**
   * Release the state machine from current operation
   * @param {string} owner - Owner that acquired the lock
   * @param {object} result - Operation result
   */
  release(owner, result = {}) {
    // Verify ownership
    if (this.currentOwner !== owner) {
      this.log.warn(`Release attempted by non-owner: ${owner} (current: ${this.currentOwner})`);
      return false;
    }

    const duration = Date.now() - this.startedAt;
    const previousState = this.currentState;

    this.log.info(`Releasing operation: ${this.currentOperation}`, {
      owner,
      duration,
      result: result.success ? 'success' : 'failed'
    });

    // Reset to idle
    this.currentState = OperationState.IDLE;
    this.currentOperation = null;
    this.currentOwner = null;
    this.startedAt = null;

    this.emit('release', {
      operation: this.currentOperation,
      owner,
      duration,
      result,
      previousState
    });

    // Process next in queue
    this._processQueue();

    return true;
  }

  /**
   * Process the waiting queue
   * @private
   */
  _processQueue() {
    // Sort queue by priority (highest first)
    this.queue.sort((a, b) => {
      const priorityA = StatePriority[a.targetState] || 0;
      const priorityB = StatePriority[b.targetState] || 0;
      return priorityB - priorityA; // Higher priority first
    });

    while (this.queue.length > 0 && !this.currentOperation) {
      const next = this.queue[0];

      // Check if this operation can now execute
      if (this.canTransitionTo(next.targetState)) {
        this.queue.shift();
        clearTimeout(next.timer);

        try {
          const result = this._acquireNow(next.operationType, next.targetState, next.owner);
          next.resolve(result);
        } catch (e) {
          next.reject(e);
        }
      } else {
        // Can't execute this or any following operations
        break;
      }
    }
  }

  /**
   * Force shutdown - transitions to shutting_down state immediately
   * Clears queue and rejects waiting operations
   * @param {string} reason - Reason for force shutdown
   */
  forceShutdown(reason = 'manual') {
    this.log.warn('Force shutdown initiated', { reason });

    // Reject all waiting operations
    for (const queued of this.queue) {
      clearTimeout(queued.timer);
      queued.reject(new Error(`Operation cancelled: ${reason}`));
    }
    this.queue = [];

    // Force state change
    const previousState = this.currentState;
    this.currentState = OperationState.SHUTTING_DOWN;
    this.currentOperation = 'forced_shutdown';
    this.currentOwner = 'system';
    this.startedAt = Date.now();

    this.emit('stateChange', {
      from: previousState,
      to: OperationState.SHUTTING_DOWN,
      operation: 'forced_shutdown',
      owner: 'system',
      reason
    });

    this.emit('shutdown', { reason });

    return {
      previousState,
      currentState: this.currentState
    };
  }

  /**
   * Get current state info
   * @returns {object} State information
   */
  getState() {
    return {
      state: this.currentState,
      operation: this.currentOperation,
      owner: this.currentOwner,
      startedAt: this.startedAt,
      duration: this.startedAt ? Date.now() - this.startedAt : 0,
      queueLength: this.queue.length
    };
  }

  /**
   * Check if currently in a specific state
   * @param {string} state - State to check
   * @returns {boolean} True if in that state
   */
  isInState(state) {
    return this.currentState === state;
  }

  /**
   * Check if an operation is currently running
   * @returns {boolean} True if operation is running
   */
  isBusy() {
    return this.currentOperation !== null;
  }

  /**
   * Register a callback for state changes
   * @param {string} state - State to watch
   * @param {Function} callback - Callback function
   */
  onState(state, callback) {
    if (!this.stateCallbacks.has(state)) {
      this.stateCallbacks.set(state, []);
    }
    this.stateCallbacks.get(state).push(callback);

    // Also listen to stateChange event
    this.on('stateChange', ({ to, ...data }) => {
      if (to === state) {
        callback(data);
      }
    });
  }

  /**
   * Reset to idle state (use with caution)
   */
  reset() {
    this.currentState = OperationState.IDLE;
    this.currentOperation = null;
    this.currentOwner = null;
    this.startedAt = null;

    // Clear queue
    for (const queued of this.queue) {
      clearTimeout(queued.timer);
      queued.reject(new Error('State machine reset'));
    }
    this.queue = [];

    this.emit('reset');
    this.log.info('State machine reset');
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new OperationStateMachine instance
 * @param {object} config - Configuration options
 * @returns {OperationStateMachine} New OperationStateMachine instance
 */
export function createOperationStateMachine(config) {
  instance = new OperationStateMachine(config);
  return instance;
}

/**
 * Get the singleton OperationStateMachine instance
 * @returns {OperationStateMachine} OperationStateMachine instance
 */
export function getOperationStateMachine() {
  if (!instance) {
    instance = new OperationStateMachine();
  }
  return instance;
}

export default OperationStateMachine;