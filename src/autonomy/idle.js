// src/autonomy/idle.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('IdleLoop');

/**
 * Idle Loop - Manages autonomous behavior when bot is not busy
 */
class IdleLoop {
  constructor(curriculum, scheduler, survival, state, config = {}) {
    this.curriculum = curriculum;
    this.scheduler = scheduler;
    this.survival = survival;
    this.state = state;

    this.idleTimeout = config.idleTimeout || 30000; // 30 seconds
    this.lastActivity = Date.now();
    this.isRunning = false;
    this.intervalId = null;
    this.isTicking = false; // Mutex to prevent concurrent tick() calls
  }

  /**
   * Main tick - called periodically
   */
  async tick() {
    // Prevent concurrent execution
    if (this.isTicking) {
      return;
    }
    this.isTicking = true;

    try {
      // Don't act if busy
      if (this.state.isBusy()) {
        this.lastActivity = Date.now();
        return;
      }

      // Check if idle time met
      if (!this.shouldAct()) {
        return;
      }

      // Priority 1: Survival needs
      const survivalGoal = await this.survival.check();
      if (survivalGoal) {
        logger.info(`[Idle] Survival: ${survivalGoal.skill}`);
        await this.executeGoal(survivalGoal);
        return;
      }

      // Priority 2: Scheduled tasks
      const scheduledTask = this.scheduler.getNextTask();
      if (scheduledTask) {
        logger.info(`[Idle] Scheduled: ${scheduledTask.name}`);
        await this.executeGoal(scheduledTask);
        return;
      }

      // Priority 3: Curriculum goals
      const curriculumGoal = this.curriculum.getNextGoal();
      if (curriculumGoal) {
        logger.info(`[Idle] Curriculum: ${curriculumGoal.skill}`);
        await this.executeGoal(curriculumGoal);
        return;
      }

      // Nothing to do
      logger.debug('[Idle] No autonomous goal');
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Check if should act
   */
  shouldAct() {
    if (this.state.isBusy()) {
      return false;
    }

    const idleTime = Date.now() - this.lastActivity;
    return idleTime >= this.idleTimeout;
  }

  /**
   * Execute autonomous goal
   */
  async executeGoal(goal) {
    try {
      this.state.setTask({
        type: goal.skill,
        source: 'autonomous',
        params: goal.params || {},
        started: Date.now()
      });

      // Find or generate skill
      const skill = await this.findOrGenerateSkill(goal);

      if (skill) {
        await skill.execute(this.state.bot, goal.params);
        this.curriculum.markLearned(goal.skill);
      }

    } catch (error) {
      logger.error(`[Idle] Failed to execute ${goal.skill}:`, error.message);
    } finally {
      this.state.clearTask();
      this.lastActivity = Date.now();
    }
  }

  /**
   * Find existing skill or generate new one
   */
  async findOrGenerateSkill(goal) {
    // This would integrate with the skills layer
    // For now, return null - implemented in integration
    logger.debug(`[Idle] Looking for skill: ${goal.skill}`);
    return null;
  }

  /**
   * Start idle loop
   */
  start(interval = 5000) {
    if (this.isRunning) {
      logger.warn('[Idle] Already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(async () => {
      try {
        await this.tick();
      } catch (error) {
        logger.error(`[Idle] tick() error: ${error.message}`);
      }
    }, interval);
    logger.info(`[Idle] Started with ${interval}ms interval`);
  }

  /**
   * Stop idle loop
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('[Idle] Stopped');
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      idleTime: Date.now() - this.lastActivity,
      idleTimeout: this.idleTimeout,
      shouldAct: this.shouldAct()
    };
  }
}

export { IdleLoop };