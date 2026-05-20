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
    lastDailyReportAt: {}
  },
  users: {},
  groups: {},
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
