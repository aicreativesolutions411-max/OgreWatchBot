import { AntiSpam } from './antiSpam.js';
import { NEW_PAIR_DEFAULT_FILTERS } from './defaults.js';
import { actionButtons, reportKeyboard } from '../ui/keyboards.js';
import {
  digestMessage,
  groupActivitySpikeMessage,
  hourlyGroupUpdateMessage,
  liquidityAlertMessage,
  tokenMilestoneMessage,
  walletAlertMessage
} from '../ui/messages.js';

export class AlertEngine {
  constructor({ config, store, telegram, provider }) {
    this.config = config;
    this.store = store;
    this.telegram = telegram;
    this.provider = provider;
    this.antiSpam = new AntiSpam(store);
  }

  async processWatchedEvents() {
    const events = await this.provider.pollWatchedEvents(this.store.watchedContext());
    for (const event of events) {
      await this.routeEvent(event);
    }
  }

  async routeEvent(event) {
    if (event.type === 'wallet_trade') {
      await this.routeWalletTrade(event);
      return;
    }

    if (event.type === 'multi_wallet') {
      await this.routeGroupSpike(event);
      return;
    }

    if (event.type === 'milestone') {
      await this.routeTokenMilestone(event);
      return;
    }

    if (event.type === 'liquidity') {
      await this.routeLiquidityAlert(event);
    }
  }

  async routeWalletTrade(alert) {
    const users = this.store.usersWatchingWallet(alert.wallet);
    for (const user of users) {
      const watch = user.watchWallets[alert.wallet];
      if (!walletWatchAllows(watch, alert)) continue;

      await this.sendOrQueueUserAlert(user, {
        title: `${alert.walletLabel} ${alert.side} ${alert.symbol}`,
        summary: `${alert.solAmount} SOL at ${alert.marketCapUsd} MC`,
        importance: alert.importance ?? 'important',
        ca: alert.ca,
        symbol: alert.symbol,
        wallet: alert.wallet,
        walletLabel: alert.walletLabel,
        text: walletAlertMessage(alert, this.config)
      });
    }
  }

  async routeGroupSpike(alert) {
    if (!this.config.enableImmediateGroupAlerts) return;

    for (const group of Object.values(this.store.data.groups)) {
      if (!group.settings.whaleAlerts) continue;
      if (this.antiSpam.isQuietNow(group.settings)) continue;
      if (!this.antiSpam.canSendGroupTokenAlert(group.id, alert.ca, group.settings.cooldownMinutes)) continue;

      await this.telegram.sendMessage(
        group.id,
        groupActivitySpikeMessage(alert, this.config),
        actionButtons(this.config, alert.ca)
      );
    }
  }

  async routeTokenMilestone(alert) {
    const users = this.store.usersWatchingToken(alert.ca);
    for (const user of users) {
      const watch = user.watchTokens[alert.ca];
      if (!tokenWatchAllows(watch, 'price')) continue;

      await this.sendOrQueueUserAlert(user, {
        title: `${alert.symbol} milestone`,
        summary: `${alert.movePercent}% move to ${alert.marketCapUsd} MC`,
        importance: 'important',
        ca: alert.ca,
        symbol: alert.symbol,
        text: tokenMilestoneMessage(alert, this.config)
      });
    }

    if (!this.config.enableImmediateGroupAlerts) return;

    for (const group of Object.values(this.store.data.groups)) {
      if (this.antiSpam.isQuietNow(group.settings)) continue;
      if (!this.antiSpam.canSendMilestone(`group:${group.id}`, alert.ca, alert.movePercent)) continue;
      await this.telegram.sendMessage(
        group.id,
        tokenMilestoneMessage(alert, this.config),
        actionButtons(this.config, alert.ca)
      );
    }
  }

  async routeLiquidityAlert(alert) {
    const users = this.store.usersWatchingToken(alert.ca);
    for (const user of users) {
      const watch = user.watchTokens[alert.ca];
      if (!tokenWatchAllows(watch, 'liquidity')) continue;

      await this.sendOrQueueUserAlert(user, {
        title: `${alert.symbol} liquidity changed`,
        summary: `${alert.changePercent}% liquidity move`,
        importance: 'important',
        ca: alert.ca,
        symbol: alert.symbol,
        text: liquidityAlertMessage(alert, this.config)
      });
    }
  }

  async sendOrQueueUserAlert(user, alert) {
    if (this.antiSpam.isQuietNow(user.settings)) {
      this.store.queueUserAlert(user.id, alert);
      return;
    }

    const mode = user.settings.alertMode;
    if (mode === 'silent') return;

    if (mode === 'hourly' || mode === 'daily') {
      this.store.queueUserAlert(user.id, alert);
      return;
    }

    if (mode === 'important' && alert.importance !== 'important' && alert.importance !== 'major') {
      this.store.queueUserAlert(user.id, alert);
      return;
    }

    try {
      await this.telegram.sendMessage(user.chatId, alert.text, actionButtons(this.config, alert.ca));
      this.store.setUserDmStatus(user.id, true);
    } catch (error) {
      this.store.setUserDmStatus(user.id, false);
      this.store.queueUserAlert(user.id, alert);
      console.warn(`[dm-failed] user=${user.id} ${error.message}`);
    }
  }

  async runScheduledDigests() {
    await this.runGroupDigests();
    await this.runUserDigests();
  }

  async runGroupDigests() {
    const now = Date.now();
    const intervalMs = this.config.groupDigestMinutes * 60 * 1000;

    for (const group of Object.values(this.store.data.groups)) {
      if (!group.settings.trendingDigest) continue;
      if (this.antiSpam.isQuietNow(group.settings)) continue;

      const lastSent = this.store.data.meta.lastGroupDigestAt[group.id] ?? 0;
      if (now - lastSent < intervalMs) continue;

      const update = await this.buildHourlyGroupUpdate(group);
      this.store.recordTokenCalls(update.topPicks, 'Hourly pick');
      this.store.recordTokenCalls(update.newPairs, 'Hourly fresh pair');
      await this.telegram.sendMessage(
        group.id,
        hourlyGroupUpdateMessage(update, this.config, this.provider.marketStatus?.()),
        reportKeyboard()
      );
      this.store.data.meta.lastGroupDigestAt[group.id] = now;
      this.store.save();
    }
  }

  async buildHourlyGroupUpdate(group) {
    const [trending, highVolume, newPairs, trackedTokens] = await Promise.all([
      this.provider.getTrending('5m'),
      this.provider.getTrending('24h'),
      this.provider.getNewPairs({
        ...NEW_PAIR_DEFAULT_FILTERS,
        minLiquidityUsd: this.config.newPairMinLiquidityUsd ?? NEW_PAIR_DEFAULT_FILTERS.minLiquidityUsd,
        freshMinLiquidityUsd: this.config.newPairFreshMinLiquidityUsd ?? NEW_PAIR_DEFAULT_FILTERS.freshMinLiquidityUsd,
        freshMinVolumeUsd: this.config.newPairFreshMinVolumeUsd ?? NEW_PAIR_DEFAULT_FILTERS.freshMinVolumeUsd,
        maxAgeMinutes: 60
      }),
      this.scanTrackedGroupTokens(group)
    ]);

    const trendingTokens = trending.tokens.slice(0, 8);
    const momentumTokens = highVolume.tokens.slice(0, 8);
    const freshPairs = newPairs.slice(0, 8);
    const topPicks = buildTopPicks({
      trending: trendingTokens,
      momentum: momentumTokens,
      newPairs: freshPairs
    });
    const topPickKeys = new Set(topPicks.map((pick) => pick.ca || pick.symbol).filter(Boolean));

    return {
      topPicks,
      trending: trendingTokens,
      highVolume: momentumTokens,
      newPairs: freshPairs.filter((pair) => !topPickKeys.has(pair.ca || pair.symbol)),
      trackedTokens,
      trackedWallets: Object.values(group.watchWallets ?? {}).slice(0, 5)
    };
  }

  async scanTrackedGroupTokens(group) {
    const tokenCas = Object.keys(group.watchTokens ?? {}).slice(0, 5);
    const scans = [];
    for (const ca of tokenCas) {
      try {
        scans.push(await this.provider.scanToken(ca));
      } catch (error) {
        console.warn(`[group-digest-scan] ${ca} ${error.message}`);
      }
    }
    return scans;
  }

  async runUserDigests() {
    const now = Date.now();
    const hourlyMs = this.config.userHourlyDigestMinutes * 60 * 1000;
    const currentHour = new Date().getHours();

    for (const user of Object.values(this.store.data.users)) {
      const queue = user.alertQueue ?? [];
      if (!queue.length || user.settings.alertMode === 'silent') continue;

      const lastSent = this.store.data.meta.lastUserDigestAt[user.id] ?? 0;
      const dueHourly = user.settings.alertMode === 'hourly' && now - lastSent >= hourlyMs;
      const dueDaily = user.settings.alertMode === 'daily' && currentHour >= this.config.userDailyDigestHour && now - lastSent >= 20 * 60 * 60 * 1000;

      if (!dueHourly && !dueDaily) continue;

      const alerts = this.store.clearUserAlertQueue(user.id);
      if (!alerts.length) continue;

      try {
        await this.telegram.sendMessage(user.chatId, digestMessage(alerts, this.config), reportKeyboard());
        this.store.data.meta.lastUserDigestAt[user.id] = now;
        this.store.setUserDmStatus(user.id, true);
        this.store.save();
      } catch (error) {
        for (const alert of alerts) this.store.queueUserAlert(user.id, alert);
        this.store.setUserDmStatus(user.id, false);
        console.warn(`[digest-failed] user=${user.id} ${error.message}`);
      }
    }
  }
}

function walletWatchAllows(watch, alert) {
  if (!watch || watch.mode === 'silent') return false;
  if (watch.mode === 'all') return true;
  if (watch.mode === 'buys') return alert.side === 'bought';
  if (watch.mode === 'sells') return alert.side === 'sold' || alert.side === 'sold out';
  return alert.importance === 'important' || alert.importance === 'major';
}

function tokenWatchAllows(watch, eventType) {
  if (!watch || watch.mode === 'silent') return false;
  if (watch.mode === 'important') return true;
  return watch.mode === eventType || watch.types?.includes(eventType);
}

function buildTopPicks({ trending = [], momentum = [], newPairs = [] }) {
  const picks = new Map();

  for (const token of trending) addPick(picks, token, 'Momentum');
  for (const token of momentum) addPick(picks, token, '24h setup');
  for (const pair of newPairs) addPick(picks, pair, 'Fresh pair');

  return [...picks.values()]
    .sort((a, b) => pickRank(b) - pickRank(a))
    .slice(0, 8);
}

function addPick(picks, item, source) {
  const key = item.ca || item.symbol;
  if (!key) return;

  const existing = picks.get(key);
  const next = {
    ...existing,
    ...item,
    source: mergeSources(existing?.source, source),
    movePercent: item.movePercent ?? existing?.movePercent
  };

  picks.set(key, next);
}

function mergeSources(current, next) {
  if (!current) return next;
  if (current.split(' + ').includes(next)) return current;
  return `${current} + ${next}`;
}

function pickRank(item) {
  const quality = Number(item.qualityScore) || 0;
  const move = Math.max(0, Number(item.movePercent) || 0);
  const freshness = Number.isFinite(Number(item.ageMinutes)) ? Math.max(0, 60 - Number(item.ageMinutes)) / 2 : 0;
  const freshBoost = String(item.source ?? '').includes('Fresh pair') ? 10 : 0;
  return quality * 2 + Math.min(move, 120) + freshness + freshBoost;
}
