// src/core/circadianEvents.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Circadian');

/**
 * Circadian Events - Day/night cycle events
 */
class CircadianEvents {
  constructor(bot) {
    this.bot = bot;
    this.lastDayTime = null;
    this.timeHandler = null;

    // Listen for time changes
    if (this.bot.on) {
      this.timeHandler = () => this.checkTimeEvents();
      this.bot.on('time', this.timeHandler);
    }
  }

  /**
   * Destroy - Clean up event listener
   */
  destroy() {
    if (this.timeHandler && this.bot.off) {
      this.bot.off('time', this.timeHandler);
      this.timeHandler = null;
    }
    logger.debug('[Circadian] Destroyed');
  }

  /**
   * Check for circadian transitions
   */
  checkTimeEvents() {
    const dayTime = this.bot.time?.timeOfDay ?? 0;
    const isDay = this.isDay();

    // First check - no previous time
    if (this.lastDayTime === null) {
      this.lastDayTime = dayTime;
      return;
    }

    const lastIsDay = this.lastDayTime < 12000;

    // Day → Night transition (dusk)
    if (lastIsDay && !isDay) {
      this.onNightfall();
    }

    // Night → Day transition (dawn)
    if (!lastIsDay && isDay) {
      this.onDaybreak();
    }

    // Sunrise (early morning)
    if (this.lastDayTime > 22000 && dayTime < 1000) {
      this.onSunrise();
    }

    // Sunset (late afternoon)
    if (this.lastDayTime < 11000 && dayTime >= 11000 && dayTime < 12000) {
      this.onSunset();
    }

    this.lastDayTime = dayTime;
  }

  /**
   * Check if currently day
   */
  isDay() {
    const dayTime = this.bot.time?.timeOfDay ?? 0;
    return dayTime < 12000;
  }

  /**
   * Nightfall event
   */
  onNightfall() {
    logger.info('[Circadian] Nightfall - initiating safety protocol');

    this.emit('nightfall', {
      message: 'Está anoitecendo. Mobs hostis podem aparecer.',
      priority: 'high',
      suggestedActions: [
        'build_shelter',
        'go_home',
        'light_area'
      ]
    });
  }

  /**
   * Daybreak event
   */
  onDaybreak() {
    logger.info('[Circadian] Daybreak - area safe again');

    this.emit('daybreak', {
      message: 'Está amanhecendo. Mobs hostis vão queimar.',
      priority: 'low',
      suggestedActions: [
        'resume_tasks',
        'collect_drops'
      ]
    });
  }

  /**
   * Sunrise event
   */
  onSunrise() {
    this.emit('sunrise', { priority: 'none' });
  }

  /**
   * Sunset event
   */
  onSunset() {
    logger.info('[Circadian] Sunset - preparing for night');

    this.emit('sunset', {
      priority: 'medium',
      suggestedActions: [
        'check_shelter',
        'gather_torch'
      ]
    });
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (this.bot.emit) {
      this.bot.emit('circadian', { event, ...data });
    }
  }

  /**
   * Get current time info
   */
  getTimeInfo() {
    const dayTime = this.bot.time?.timeOfDay ?? 0;
    const isDay = this.isDay();
    const hours = Math.floor((dayTime / 24000) * 24);
    const minutes = Math.floor(((dayTime / 24000) * 24 * 60) % 60);

    return {
      dayTime,
      isDay,
      hours,
      minutes,
      phase: this.getPhase(dayTime)
    };
  }

  /**
   * Get time phase
   */
  getPhase(dayTime) {
    if (dayTime < 1000) return 'sunrise';
    if (dayTime < 6000) return 'morning';
    if (dayTime < 11000) return 'afternoon';
    if (dayTime < 12000) return 'sunset';
    if (dayTime < 13000) return 'dusk';
    if (dayTime < 18000) return 'night';
    return 'dawn';
  }
}

export { CircadianEvents };