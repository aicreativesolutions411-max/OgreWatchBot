import { MARKET_CAP_MILESTONES } from './defaults.js';

export class AntiSpam {
  constructor(store) {
    this.store = store;
  }

  canSend(key, cooldownMinutes) {
    const now = Date.now();
    const lastSentAt = this.store.data.cooldowns[key] ?? 0;
    const cooldownMs = cooldownMinutes * 60 * 1000;

    if (now - lastSentAt < cooldownMs) {
      return false;
    }

    this.store.data.cooldowns[key] = now;
    this.store.save();
    return true;
  }

  canSendGroupTokenAlert(groupId, ca, cooldownMinutes) {
    return this.canSend(`group:${groupId}:token:${ca}`, cooldownMinutes);
  }

  canAutoScan(groupId, ca, cooldownMinutes = 10) {
    return this.canSend(`group:${groupId}:autoscan:${ca}`, cooldownMinutes);
  }

  canSendMilestone(scope, ca, movePercent) {
    const milestone = MARKET_CAP_MILESTONES.filter((value) => movePercent >= value).at(-1);
    if (!milestone) return false;
    return this.canSend(`${scope}:milestone:${ca}:${milestone}`, 60 * 24 * 365);
  }

  isQuietNow(settings) {
    if (!settings?.quietHours?.enabled) return false;

    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const start = parseTime(settings.quietHours.start);
    const end = parseTime(settings.quietHours.end);

    if (start === end) return false;
    if (start < end) return current >= start && current < end;
    return current >= start || current < end;
  }
}

function parseTime(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes));
}
