// src/autonomy/scheduler.js

import cron from 'node-cron';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Scheduler');

/**
 * Default scheduled tasks
 */
const DEFAULT_SCHEDULED_TASKS = [
  { name: 'patrol_base', cron: '*/5 * * * *', enabled: true },
  { name: 'check_chests', cron: '*/30 * * * *', enabled: true },
  { name: 'organize_inventory', cron: '*/10 * * * *', enabled: true }
];

/**
 * Task Scheduler - OpenClaw-style scheduled tasks
 */
class TaskScheduler {
  constructor(state, config = {}) {
    this.state = state;
    this.config = config;
    this.scheduledJobs = new Map();
    this.tasks = [];
    this.pendingTasks = [];
  }

  /**
   * Load tasks from config
   */
  loadFromConfig(config) {
    this.tasks = config.autonomy?.scheduledTasks || DEFAULT_SCHEDULED_TASKS;
    logger.info(`[Scheduler] Loaded ${this.tasks.length} scheduled tasks`);
  }

  /**
   * Start all scheduled tasks
   */
  start() {
    for (const task of this.tasks) {
      if (task.enabled) {
        this.schedule(task);
      }
    }
    logger.info(`[Scheduler] Started ${this.scheduledJobs.size} scheduled tasks`);
  }

  /**
   * Schedule a task
   */
  schedule(task) {
    if (!task.enabled && task.enabled !== undefined) {
      logger.debug(`[Scheduler] Task ${task.name} is disabled`);
      return;
    }

    const job = cron.schedule(task.cron, async () => {
      // Only execute if bot is idle
      if (!this.state.isBusy()) {
        logger.info(`[Scheduler] Executing: ${task.name}`);
        this.pendingTasks.push({
          ...task,
          scheduledAt: Date.now()
        });
      }
    });

    this.scheduledJobs.set(task.name, job);
    logger.debug(`[Scheduler] Scheduled: ${task.name} (${task.cron})`);
  }

  /**
   * Get next pending task
   */
  getNextTask() {
    if (this.pendingTasks.length === 0) {
      return null;
    }

    return this.pendingTasks.shift();
  }

  /**
   * Stop a specific task
   */
  stop(taskName) {
    const job = this.scheduledJobs.get(taskName);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(taskName);
      logger.info(`[Scheduler] Stopped: ${taskName}`);
    }
  }

  /**
   * Stop all tasks
   */
  stopAll() {
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();
    this.pendingTasks = [];
    logger.info('[Scheduler] Stopped all tasks');
  }

  /**
   * Add ad-hoc task
   */
  addTask(task) {
    this.pendingTasks.push({
      ...task,
      addedAt: Date.now()
    });
    logger.debug(`[Scheduler] Added ad-hoc task: ${task.name}`);
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks() {
    return Array.from(this.scheduledJobs.keys());
  }

  /**
   * Get pending tasks
   */
  getPendingTasks() {
    return [...this.pendingTasks];
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      scheduledCount: this.scheduledJobs.size,
      pendingCount: this.pendingTasks.length,
      tasks: this.getScheduledTasks()
    };
  }
}

export { TaskScheduler, DEFAULT_SCHEDULED_TASKS };