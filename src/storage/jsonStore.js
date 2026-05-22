import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_GROUP_SETTINGS, DEFAULT_USER_SETTINGS } from '../domain/defaults.js';
import { nowIso } from '../utils/format.js';

const EMPTY_DATA = {
  meta: {
    offset: 0,
    lastGroupDigestAt: {},
    lastUserDigestAt: {},
    lastDailyReportAt: {},
    chatMessageCounts: {},
    chatActionGates: {},
    chatPanels: {}
  },
  users: {},
  groups: {},
  calls: {},
  cooldowns: {}
};

export class JsonStore {
  constructor(filePath, options = {}) {
    this.requestedFilePath = filePath;
    this.filePath = filePath;
    this.fallbackFilePath = options.fallbackFilePath ?? path.join(os.tmpdir(), 'yourcoin-radar', 'radar-store.json');
    this.usingFallback = false;
    this.data = this.#load();
  }

  #load() {
    const paths = [this.filePath, this.fallbackFilePath].filter(Boolean);
    for (const filePath of [...new Set(paths)]) {
      try {
        if (!fs.existsSync(filePath)) continue;

        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.filePath = filePath;
        this.usingFallback = filePath !== this.requestedFilePath;
        if (this.usingFallback) {
          console.warn(`[store] using fallback data file ${filePath}`);
        }
        return {
          ...structuredClone(EMPTY_DATA),
          ...parsed,
          meta: {
            ...structuredClone(EMPTY_DATA.meta),
            ...(parsed.meta ?? {})
          }
        };
      } catch (error) {
        if (!isRecoverableFileError(error)) throw error;
        console.warn(`[store] cannot read ${filePath}: ${error.message}`);
      }
    }

    return structuredClone(EMPTY_DATA);
  }

  save() {
    try {
      this.#write(this.filePath);
    } catch (error) {
      if (!this.fallbackFilePath || this.filePath === this.fallbackFilePath || !isRecoverableFileError(error)) {
        throw error;
      }

      console.warn(`[store] cannot write ${this.filePath}: ${error.message}`);
      console.warn(`[store] switching to fallback data file ${this.fallbackFilePath}`);
      this.filePath = this.fallbackFilePath;
      this.usingFallback = true;
      this.#write(this.filePath);
    }
  }

  #write(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempFile = `${filePath}.tmp`;
    fs.writeFileSync(tempFile, `${JSON.stringify(this.data, null, 2)}\n`);
    fs.renameSync(tempFile, filePath);
  }

  replaceData(nextData) {
    this.data = normalizeStoreData(nextData);
    this.save();
  }

  setOffset(offset) {
    this.data.meta.offset = offset;
    this.save();
  }

  incrementChatMessageCount(chatId) {
    const id = String(chatId);
    this.data.meta.chatMessageCounts ??= {};
    this.data.meta.chatMessageCounts[id] = (this.data.meta.chatMessageCounts[id] ?? 0) + 1;
    this.save();
    return this.data.meta.chatMessageCounts[id];
  }

  getChatMessageCount(chatId) {
    this.data.meta.chatMessageCounts ??= {};
    return this.data.meta.chatMessageCounts[String(chatId)] ?? 0;
  }

  getChatActionGate(chatId, actionKey) {
    this.data.meta.chatActionGates ??= {};
    return this.data.meta.chatActionGates[`${chatId}:${actionKey}`];
  }

  setChatActionGate(chatId, actionKey, messageCount) {
    this.data.meta.chatActionGates ??= {};
    this.data.meta.chatActionGates[`${chatId}:${actionKey}`] = messageCount;
    this.save();
  }

  getChatPanel(chatId) {
    this.data.meta.chatPanels ??= {};
    return this.data.meta.chatPanels[String(chatId)] ?? null;
  }

  setChatPanel(chatId, messageId) {
    this.data.meta.chatPanels ??= {};
    this.data.meta.chatPanels[String(chatId)] = {
      messageId,
      updatedAtMs: Date.now()
    };
    this.save();
  }

  clearChatPanel(chatId) {
    this.data.meta.chatPanels ??= {};
    delete this.data.meta.chatPanels[String(chatId)];
    this.save();
  }

  ensureUser(from, chatId = from?.id) {
    const id = String(from?.id ?? chatId);
    if (!id) return null;

    if (!this.data.users[id]) {
      this.data.users[id] = {
        id,
        chatId: String(chatId ?? id),
        username: from?.username ?? '',
        firstName: from?.first_name ?? '',
        settings: structuredClone(DEFAULT_USER_SETTINGS),
        watchTokens: {},
        watchWallets: {},
        mutedTokens: {},
        mutedWallets: {},
        alertQueue: [],
        canDm: true,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.save();
    }

    const user = this.data.users[id];
    user.chatId = String(chatId ?? user.chatId ?? id);
    user.username = from?.username ?? user.username;
    user.firstName = from?.first_name ?? user.firstName;
    user.updatedAt = nowIso();
    this.save();
    return user;
  }

  ensureGroup(chat) {
    const id = String(chat.id);
    if (!this.data.groups[id]) {
      this.data.groups[id] = {
        id,
        title: chat.title ?? chat.username ?? 'Group',
        type: chat.type ?? 'group',
        username: chat.username ?? '',
        settings: structuredClone(DEFAULT_GROUP_SETTINGS),
        watchTokens: {},
        watchWallets: {},
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.save();
    }

    const group = this.data.groups[id];
    group.title = chat.title ?? group.title;
    group.type = chat.type ?? group.type ?? 'group';
    group.username = chat.username ?? group.username ?? '';
    group.updatedAt = nowIso();
    this.save();
    return group;
  }

  getUser(userId) {
    return this.data.users[String(userId)];
  }

  getGroup(chatId) {
    return this.data.groups[String(chatId)];
  }

  setUserAlertMode(userId, mode) {
    const user = this.getUser(userId);
    if (!user) return null;
    user.settings.alertMode = mode;
    user.updatedAt = nowIso();
    this.save();
    return user;
  }

  setUserDmStatus(userId, canDm) {
    const user = this.getUser(userId);
    if (!user) return;
    user.canDm = canDm;
    user.updatedAt = nowIso();
    this.save();
  }

  addUserTokenWatch(userId, ca, options = {}) {
    const user = this.getUser(userId);
    if (!user) return null;

    user.watchTokens[ca] = {
      ca,
      mode: options.mode ?? 'important',
      types: options.types ?? ['important'],
      createdAt: user.watchTokens[ca]?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    delete user.mutedTokens[ca];
    user.updatedAt = nowIso();
    this.save();
    return user.watchTokens[ca];
  }

  addUserWalletWatch(userId, wallet, options = {}) {
    const user = this.getUser(userId);
    if (!user) return null;

    user.watchWallets[wallet] = {
      wallet,
      label: options.label ?? user.watchWallets[wallet]?.label ?? 'Watched Wallet',
      mode: options.mode ?? 'important',
      tokenOnly: options.tokenOnly ?? '',
      createdAt: user.watchWallets[wallet]?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    delete user.mutedWallets[wallet];
    user.updatedAt = nowIso();
    this.save();
    return user.watchWallets[wallet];
  }

  muteUserToken(userId, ca) {
    const user = this.getUser(userId);
    if (!user) return;
    user.mutedTokens[ca] = nowIso();
    delete user.watchTokens[ca];
    user.updatedAt = nowIso();
    this.save();
  }

  muteUserWallet(userId, wallet) {
    const user = this.getUser(userId);
    if (!user) return;
    user.mutedWallets[wallet] = nowIso();
    delete user.watchWallets[wallet];
    user.updatedAt = nowIso();
    this.save();
  }

  removeUserTokenWatch(userId, ca) {
    const user = this.getUser(userId);
    if (!user?.watchTokens?.[ca]) return false;

    delete user.watchTokens[ca];
    delete user.mutedTokens?.[ca];
    user.updatedAt = nowIso();
    this.save();
    return true;
  }

  removeUserWalletWatch(userId, wallet) {
    const user = this.getUser(userId);
    if (!user?.watchWallets?.[wallet]) return false;

    delete user.watchWallets[wallet];
    delete user.mutedWallets?.[wallet];
    user.updatedAt = nowIso();
    this.save();
    return true;
  }

  toggleGroupSetting(chatId, key) {
    const group = this.getGroup(chatId);
    if (!group || !(key in group.settings)) return null;
    if (typeof group.settings[key] !== 'boolean') return null;
    group.settings[key] = !group.settings[key];
    group.updatedAt = nowIso();
    this.save();
    return group;
  }

  setGroupCooldown(chatId, minutes) {
    const group = this.getGroup(chatId);
    if (!group) return null;
    group.settings.cooldownMinutes = minutes;
    group.updatedAt = nowIso();
    this.save();
    return group;
  }

  addGroupTokenWatch(chatId, ca, options = {}) {
    const group = this.getGroup(chatId);
    if (!group) return null;

    group.watchTokens ??= {};
    group.watchTokens[ca] = {
      ca,
      mode: options.mode ?? 'important',
      createdAt: group.watchTokens[ca]?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    group.updatedAt = nowIso();
    this.save();
    return group.watchTokens[ca];
  }

  addGroupWalletWatch(chatId, wallet, options = {}) {
    const group = this.getGroup(chatId);
    if (!group) return null;

    group.watchWallets ??= {};
    group.watchWallets[wallet] = {
      wallet,
      label: options.label ?? group.watchWallets[wallet]?.label ?? 'Watched Wallet',
      mode: options.mode ?? 'important',
      createdAt: group.watchWallets[wallet]?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    group.updatedAt = nowIso();
    this.save();
    return group.watchWallets[wallet];
  }

  removeGroupTokenWatch(chatId, ca) {
    const group = this.getGroup(chatId);
    if (!group?.watchTokens?.[ca]) return false;

    delete group.watchTokens[ca];
    group.updatedAt = nowIso();
    this.save();
    return true;
  }

  removeGroupWalletWatch(chatId, wallet) {
    const group = this.getGroup(chatId);
    if (!group?.watchWallets?.[wallet]) return false;

    delete group.watchWallets[wallet];
    group.updatedAt = nowIso();
    this.save();
    return true;
  }

  queueUserAlert(userId, alert) {
    const user = this.getUser(userId);
    if (!user) return;
    user.alertQueue.push({ ...alert, queuedAt: nowIso() });
    user.updatedAt = nowIso();
    this.save();
  }

  clearUserAlertQueue(userId) {
    const user = this.getUser(userId);
    if (!user) return [];
    const alerts = user.alertQueue;
    user.alertQueue = [];
    user.updatedAt = nowIso();
    this.save();
    return alerts;
  }

  usersWatchingToken(ca) {
    return Object.values(this.data.users).filter((user) => user.watchTokens[ca] && !user.mutedTokens[ca]);
  }

  usersWatchingWallet(wallet) {
    return Object.values(this.data.users).filter((user) => user.watchWallets[wallet] && !user.mutedWallets[wallet]);
  }

  watchedContext() {
    return {
      tokens: [...new Set(Object.values(this.data.users).flatMap((user) => Object.keys(user.watchTokens)))],
      wallets: [...new Set(Object.values(this.data.users).flatMap((user) => Object.keys(user.watchWallets)))]
    };
  }

  recordTokenCalls(items = [], source = 'Alpha pick', options = {}) {
    this.data.calls ??= {};
    const now = nowIso();
    const countCall = options.countCall !== false;
    let changed = false;

    for (const item of items) {
      const ca = String(item?.ca ?? '').trim();
      if (!ca) continue;

      const existing = this.data.calls[ca] ?? {
        ca,
        symbol: item.symbol ?? '',
        firstCalledAt: now,
        firstMarketCapUsd: numberValue(item.marketCapUsd),
        firstLiquidityUsd: numberValue(item.liquidityUsd),
        bestMarketCapUsd: numberValue(item.marketCapUsd),
        sources: [],
        callCount: 0
      };

      const marketCapUsd = numberValue(item.marketCapUsd);
      const liquidityUsd = numberValue(item.liquidityUsd);

      existing.symbol = item.symbol ?? existing.symbol ?? '';
      existing.latestMarketCapUsd = marketCapUsd || existing.latestMarketCapUsd || existing.firstMarketCapUsd || 0;
      existing.latestLiquidityUsd = liquidityUsd || existing.latestLiquidityUsd || existing.firstLiquidityUsd || 0;
      existing.bestMarketCapUsd = Math.max(numberValue(existing.bestMarketCapUsd), marketCapUsd, numberValue(existing.latestMarketCapUsd));
      existing.qualityScore = numberValue(item.qualityScore) || existing.qualityScore || null;
      existing.qualityTier = item.qualityTier ?? existing.qualityTier ?? '';
      existing.qualityRiskLevel = item.qualityRiskLevel ?? existing.qualityRiskLevel ?? '';
      existing.lastSeenAt = now;

      if (countCall) {
        existing.lastCalledAt = now;
        existing.lastSource = source;
        existing.callCount = numberValue(existing.callCount) + 1;
        existing.sources = unique([...(existing.sources ?? []), source]).slice(0, 8);
      }

      this.data.calls[ca] = existing;
      changed = true;
    }

    if (changed) {
      this.pruneTokenCalls();
      this.save();
    }
  }

  getTokenCallsSince(sinceMs, limit = 50) {
    this.data.calls ??= {};
    return Object.values(this.data.calls)
      .filter((call) => Date.parse(call.firstCalledAt) >= sinceMs)
      .sort((a, b) => Date.parse(b.lastCalledAt ?? b.firstCalledAt) - Date.parse(a.lastCalledAt ?? a.firstCalledAt))
      .slice(0, limit);
  }

  getTopTokenCallsSince(sinceMs, limit = 10) {
    return this.getTokenCallsSince(sinceMs, 500)
      .map(enrichCallPerformance)
      .sort((a, b) => b.movePercent - a.movePercent || b.bestMovePercent - a.bestMovePercent || b.callCount - a.callCount)
      .slice(0, limit);
  }

  pruneTokenCalls(maxCalls = 500) {
    this.data.calls ??= {};
    const calls = Object.values(this.data.calls);
    if (calls.length <= maxCalls) return;

    const keep = new Set(calls
      .sort((a, b) => Date.parse(b.lastCalledAt ?? b.firstCalledAt) - Date.parse(a.lastCalledAt ?? a.firstCalledAt))
      .slice(0, maxCalls)
      .map((call) => call.ca));

    for (const ca of Object.keys(this.data.calls)) {
      if (!keep.has(ca)) delete this.data.calls[ca];
    }
  }
}

function isRecoverableFileError(error) {
  return ['EACCES', 'EPERM', 'EROFS', 'ENOENT'].includes(error?.code);
}

function normalizeStoreData(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Backup did not contain a JSON object.');
  }

  const data = value.data && typeof value.data === 'object' ? value.data : value;
  for (const key of ['meta', 'users', 'groups', 'cooldowns']) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) {
      throw new Error(`Backup is missing required object: ${key}`);
    }
  }

  return {
    ...structuredClone(EMPTY_DATA),
    ...data,
    meta: {
      ...structuredClone(EMPTY_DATA.meta),
      ...(data.meta ?? {})
    }
  };
}

function enrichCallPerformance(call) {
  const firstMarketCapUsd = numberValue(call.firstMarketCapUsd);
  const latestMarketCapUsd = numberValue(call.latestMarketCapUsd);
  const bestMarketCapUsd = numberValue(call.bestMarketCapUsd);
  return {
    ...call,
    movePercent: firstMarketCapUsd > 0 ? ((latestMarketCapUsd - firstMarketCapUsd) / firstMarketCapUsd) * 100 : 0,
    bestMovePercent: firstMarketCapUsd > 0 ? ((bestMarketCapUsd - firstMarketCapUsd) / firstMarketCapUsd) * 100 : 0
  };
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
