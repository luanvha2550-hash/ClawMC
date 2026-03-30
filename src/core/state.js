import { EventEmitter } from 'events';

/**
 * StateManager
 *
 * Manages bot state including:
 * - Current task with timeout
 * - Bot position, vitals, inventory
 * - Following state
 * - Death recovery (pending task)
 * - Checkpoint export/import
 *
 * Extends EventEmitter for state change notifications.
 */
class StateManager extends EventEmitter {
  constructor(bot) {
    super();

    this.bot = bot;

    // Current task
    this.currentTask = null;
    this.taskTimeout = null;
    this.taskStartedAt = null;

    // Bot state
    this.following = null;
    this.lastPosition = null;
    this.lastInventory = [];

    // Curriculum state
    this.curriculumPhase = 'survival';
    this.learnedSkills = new Set();

    // Death recovery
    this.pendingTask = null;
    this.deathPosition = null;

    // Flags
    this.acceptingCommands = true;
  }

  /**
   * Set current task with timeout
   * @param {Object} task - Task object with type and args
   * @param {number} timeout - Timeout in milliseconds (default: 30 minutes)
   * @returns {boolean} - True if task was set
   */
  setTask(task, timeout = 1800000) {
    // Clear existing task
    if (this.currentTask) {
      this.clearTask();
    }

    this.currentTask = {
      ...task,
      timeout: timeout,
      started: Date.now()
    };
    this.taskStartedAt = Date.now();

    // Set timeout
    this.taskTimeout = setTimeout(() => {
      this.emit('timeout', this.currentTask);
      this.clearTask();
    }, timeout);

    this.emit('taskStarted', this.currentTask);
    return true;
  }

  /**
   * Clear current task
   */
  clearTask() {
    if (this.taskTimeout) {
      clearTimeout(this.taskTimeout);
      this.taskTimeout = null;
    }

    const previousTask = this.currentTask;
    this.currentTask = null;
    this.taskStartedAt = null;

    if (previousTask) {
      this.emit('taskCleared', previousTask);
    }
  }

  /**
   * Check if bot is busy
   * @returns {boolean} - True if bot has an active task
   */
  isBusy() {
    return this.currentTask !== null;
  }

  /**
   * Check task timeout
   * @returns {boolean} - True if timeout was exceeded
   */
  checkTimeout() {
    if (!this.currentTask || !this.taskStartedAt) return false;

    const elapsed = Date.now() - this.taskStartedAt;
    const timeout = this.currentTask.timeout || 1800000;

    if (elapsed > timeout) {
      this.emit('timeout', this.currentTask);
      this.clearTask();
      return true;
    }

    return false;
  }

  /**
   * Get inventory items
   * @returns {Array} - Array of inventory items
   */
  getInventory() {
    if (!this.bot?.inventory?.items) return [];
    return this.bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
      slot: item.slot
    }));
  }

  /**
   * Get current position
   * @returns {Object|null} - Position object or null
   */
  getPosition() {
    if (!this.bot?.entity?.position) return null;
    const pos = this.bot.entity.position;
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  /**
   * Get health and food
   * @returns {Object} - Vitals object with health and food
   */
  getVitals() {
    return {
      health: this.bot?.health ?? 20,
      food: this.bot?.food ?? 20
    };
  }

  /**
   * Update last known position
   */
  updatePosition() {
    this.lastPosition = this.getPosition();
  }

  /**
   * Update last known inventory
   */
  updateInventory() {
    this.lastInventory = this.getInventory();
  }

  /**
   * Set following target
   * @param {string} username - Username to follow
   */
  setFollowing(username) {
    this.following = username;
    this.emit('following', username);
  }

  /**
   * Clear following
   */
  clearFollowing() {
    this.following = null;
    this.emit('stoppedFollowing');
  }

  /**
   * Handle death
   */
  handleDeath() {
    // Save task for potential resume
    if (this.currentTask) {
      this.pendingTask = { ...this.currentTask };
    }

    // Clear current state
    this.clearTask();
    this.following = null;

    this.emit('death', {
      pendingTask: this.pendingTask,
      lastPosition: this.lastPosition
    });
  }

  /**
   * Export state for checkpoint
   * @returns {Object} - State object for serialization
   */
  export() {
    return {
      currentTask: this.currentTask,
      following: this.following,
      lastPosition: this.lastPosition,
      curriculumPhase: this.curriculumPhase,
      learnedSkills: Array.from(this.learnedSkills),
      position: this.getPosition(),
      vitals: this.getVitals(),
      inventory: this.getInventory()
    };
  }

  /**
   * Import state from checkpoint
   * @param {Object} data - State object to import
   */
  import(data) {
    if (data.currentTask) {
      this.pendingTask = data.currentTask;
    }
    if (data.following) {
      this.following = data.following;
    }
    if (data.lastPosition) {
      this.lastPosition = data.lastPosition;
    }
    if (data.curriculumPhase) {
      this.curriculumPhase = data.curriculumPhase;
    }
    if (data.learnedSkills) {
      this.learnedSkills = new Set(data.learnedSkills);
    }
  }
}

export { StateManager };