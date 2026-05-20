import { NEW_PAIR_DEFAULT_FILTERS } from './domain/defaults.js';
import { AntiSpam } from './domain/antiSpam.js';
import {
  actionButtons,
  alertPrefsKeyboard,
  groupSettingsKeyboard,
  mainMenuKeyboard,
  newPairsKeyboard,
  reportKeyboard,
  tokenOptionsKeyboard,
  trendingKeyboard,
  walletOptionsKeyboard
} from './ui/keyboards.js';
import {
  alertPrefsMessage,
  askTokenOptionsMessage,
  askWalletOptionsMessage,
  groupSettingsMessage,
  helpMessage,
  mainMenuMessage,
  marketReportMessage,
  newPairFiltersMessage,
  newPairsMessage,
  portfolioMessage,
  scanMessage,
  tokenWatchedMessage,
  trendingMessage,
  usageMessage,
  walletWatchedMessage,
  watchlistMessage
} from './ui/messages.js';
import { findSolanaAddresses, looksLikeSolanaAddress } from './utils/solana.js';

const COMMANDS = [
  { command: 'start', description: 'Open main menu' },
  { command: 'watchtoken', description: 'Watch a token' },
  { command: 'watchwallet', description: 'Watch a wallet' },
  { command: 'new', description: 'View new pairs' },
  { command: 'trending', description: 'View trending tokens' },
  { command: 'portfolio', description: 'Check wallet summary' },
  { command: 'myalerts', description: 'Manage alerts' },
  { command: 'mywatchlist', description: 'View watchlist' },
  { command: 'groupsettings', description: 'Admin group settings' },
  { command: 'report', description: 'Latest market report' },
  { command: 'help', description: 'Help menu' },
  { command: 'backup', description: 'Owner-only backup' },
  { command: 'restore', description: 'Owner-only restore' },
  { command: 'id', description: 'Show chat and user IDs' }
];

export class RadarBot {
  constructor({ config, store, telegram, provider, alertEngine, backupManager }) {
    this.config = config;
    this.store = store;
    this.telegram = telegram;
    this.provider = provider;
    this.alertEngine = alertEngine;
    this.backupManager = backupManager;
    this.antiSpam = new AntiSpam(store);
    this.stopped = false;
  }

  async start() {
    await this.telegram.setMyCommands(COMMANDS);
    console.log(`[ready] ${this.config.botName} polling Telegram updates.`);

    setInterval(() => {
      this.alertEngine.processWatchedEvents().catch((error) => console.warn('[alert-tick]', error.message));
      this.alertEngine.runScheduledDigests().catch((error) => console.warn('[digest-tick]', error.message));
    }, this.config.alertTickSeconds * 1000);

    await this.pollForever();
  }

  async pollForever() {
    while (!this.stopped) {
      try {
        const updates = await this.telegram.getUpdates({
          offset: this.store.data.meta.offset,
          timeout: this.config.pollTimeoutSeconds,
          allowed_updates: ['message', 'channel_post', 'callback_query']
        });

        for (const update of updates) {
          this.store.setOffset(update.update_id + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        console.warn('[poll]', error.message);
        await sleep(3000);
      }
    }
  }

  async handleUpdate(update) {
    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }

    if (update.channel_post) {
      await this.handleMessage(update.channel_post);
      return;
    }

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    }
  }

  async handleMessage(message) {
    const chat = message.chat;
    const from = message.from;
    const text = message.text ?? message.caption ?? '';

    if (chat.type === 'private' && from) {
      this.store.ensureUser(from, chat.id);
    } else {
      this.store.ensureGroup(chat);
      if (from) this.store.ensureUser(from, from.id);
    }

    if (message.document && isLooseRestoreCommand(text)) {
      await this.commandRestore(message);
      return;
    }

    if (text.trim().startsWith('/')) {
      await this.handleCommand(message, text);
      return;
    }

    if (isLooseBackupCommand(text)) {
      await this.commandBackup(message);
      return;
    }

    if (isLooseRestoreCommand(text)) {
      await this.commandRestore(message);
      return;
    }

    if (chat.type !== 'private') {
      await this.handleGroupAutoScan(message);
    }
  }

  async handleCommand(message, text) {
    const [rawCommand, ...args] = text.trim().split(/\s+/);
    const command = rawCommand.split('@')[0].toLowerCase();

    switch (command) {
      case '/start':
        await this.sendStart(message.chat.id);
        break;
      case '/watchtoken':
        await this.commandWatchToken(message, args);
        break;
      case '/watchwallet':
        await this.commandWatchWallet(message, args);
        break;
      case '/new':
        await this.commandNewPairs(message.chat.id);
        break;
      case '/trending':
        await this.commandTrending(message.chat.id, '5m');
        break;
      case '/portfolio':
        await this.commandPortfolio(message.chat.id, args);
        break;
      case '/myalerts':
        await this.commandMyAlerts(message);
        break;
      case '/mywatchlist':
        await this.commandMyWatchlist(message);
        break;
      case '/groupsettings':
        await this.commandGroupSettings(message);
        break;
      case '/report':
        await this.commandReport(message.chat.id);
        break;
      case '/help':
        await this.telegram.sendMessage(message.chat.id, helpMessage(this.config));
        break;
      case '/backup':
        await this.commandBackup(message);
        break;
      case '/restore':
        await this.commandRestore(message);
        break;
      case '/id':
        await this.commandId(message);
        break;
      case '/demoalert':
        if (this.config.enableDemoCommands) await this.commandDemoAlert(message);
        break;
      default:
        await this.telegram.sendMessage(message.chat.id, helpMessage(this.config));
    }
  }

  async handleCallback(callback) {
    const data = callback.data ?? '';
    const message = callback.message;
    const chatId = message.chat.id;
    const userId = callback.from.id;

    this.store.ensureUser(callback.from, callback.message.chat.type === 'private' ? chatId : userId);
    await this.telegram.answerCallbackQuery(callback.id).catch(() => {});

    if (data === 'menu:start') return this.editMenu(chatId, message.message_id);
    if (data === 'menu:watchtoken') return this.telegram.sendMessage(chatId, usageMessage('/watchtoken CA', '/watchtoken So11111111111111111111111111111111111111112'));
    if (data === 'menu:watchwallet') return this.telegram.sendMessage(chatId, usageMessage('/watchwallet walletaddress', '/watchwallet 7fL4...wallet'));
    if (data === 'menu:new') return this.commandNewPairs(chatId);
    if (data === 'menu:trending') return this.commandTrending(chatId, '5m');
    if (data === 'menu:alerts') return this.commandMyAlerts({ chat: { id: chatId }, from: callback.from });
    if (data === 'menu:watchlist') return this.commandMyWatchlist({ chat: { id: chatId }, from: callback.from });
    if (data === 'menu:groupsettings') return this.commandGroupSettings({ chat: message.chat, from: callback.from });
    if (data === 'menu:report') return this.commandReport(chatId);

    if (data.startsWith('alertmode:')) return this.callbackAlertMode(chatId, message.message_id, userId, data);
    if (data.startsWith('wt:')) return this.callbackWatchToken(chatId, userId, data);
    if (data.startsWith('ww:')) return this.callbackWatchWallet(chatId, userId, data);
    if (data.startsWith('qw:')) return this.callbackQuickWatch(chatId, userId, data);
    if (data.startsWith('mt:')) return this.callbackMuteToken(chatId, userId, data);
    if (data.startsWith('portfolio:')) return this.commandPortfolio(chatId, [data.split(':')[1]]);
    if (data.startsWith('new:')) return this.callbackNewPairs(chatId, data);
    if (data.startsWith('trending:')) return this.commandTrending(chatId, data.split(':')[1] ?? '5m');
    if (data.startsWith('group:')) return this.callbackGroupSetting(callback, data);

    return null;
  }

  async sendStart(chatId) {
    await this.telegram.sendMessage(chatId, mainMenuMessage(this.config), mainMenuKeyboard());
  }

  async editMenu(chatId, messageId) {
    await this.telegram.editMessageText(chatId, messageId, mainMenuMessage(this.config), mainMenuKeyboard());
  }

  async commandWatchToken(message, args) {
    const ca = args[0];
    if (!ca || !looksLikeSolanaAddress(ca)) {
      await this.telegram.sendMessage(message.chat.id, usageMessage('/watchtoken CA', '/watchtoken So11111111111111111111111111111111111111112'));
      return;
    }

    await this.telegram.sendMessage(message.chat.id, askTokenOptionsMessage(ca), tokenOptionsKeyboard(ca));
  }

  async commandWatchWallet(message, args) {
    const wallet = args[0];
    if (!wallet || !looksLikeSolanaAddress(wallet)) {
      await this.telegram.sendMessage(message.chat.id, usageMessage('/watchwallet walletaddress', '/watchwallet So11111111111111111111111111111111111111112'));
      return;
    }

    await this.telegram.sendMessage(message.chat.id, askWalletOptionsMessage(wallet), walletOptionsKeyboard(wallet));
  }

  async commandNewPairs(chatId) {
    const pairs = await this.provider.getNewPairs(NEW_PAIR_DEFAULT_FILTERS);
    await this.telegram.sendMessage(chatId, newPairsMessage(pairs), newPairsKeyboard());
  }

  async commandTrending(chatId, kind) {
    const trending = await this.provider.getTrending(kind);
    await this.telegram.sendMessage(chatId, trendingMessage(trending.tokens, trending.label), trendingKeyboard());
  }

  async commandPortfolio(chatId, args) {
    const wallet = args[0];
    if (!wallet || !looksLikeSolanaAddress(wallet)) {
      await this.telegram.sendMessage(chatId, usageMessage('/portfolio walletaddress', '/portfolio So11111111111111111111111111111111111111112'));
      return;
    }

    const summary = await this.provider.getPortfolio(wallet);
    await this.telegram.sendMessage(chatId, portfolioMessage(summary), {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Track Wallet', callback_data: `ww:${wallet}:important` }, { text: 'Set Alerts', callback_data: 'menu:alerts' }],
          [{ text: 'Refresh', callback_data: `portfolio:${wallet}` }]
        ]
      }
    });
  }

  async commandMyAlerts(message) {
    const user = this.store.ensureUser(message.from, message.chat.id);
    await this.telegram.sendMessage(message.chat.id, alertPrefsMessage(user), alertPrefsKeyboard(user.settings.alertMode));
  }

  async commandMyWatchlist(message) {
    const user = this.store.ensureUser(message.from, message.chat.id);
    await this.telegram.sendMessage(message.chat.id, watchlistMessage(user));
  }

  async commandGroupSettings(message) {
    if (message.chat.type === 'private') {
      await this.telegram.sendMessage(message.chat.id, 'Group settings are available inside a group where you are an admin.');
      return;
    }

    const isAdmin = await this.isMessageFromChatAdmin(message);
    if (!isAdmin) {
      await this.telegram.sendMessage(message.chat.id, 'Only group admins can change group alert settings.');
      return;
    }

    const group = this.store.ensureGroup(message.chat);
    await this.telegram.sendMessage(message.chat.id, groupSettingsMessage(group), groupSettingsKeyboard(group));
  }

  async commandReport(chatId) {
    const report = await this.provider.getMarketReport();
    await this.telegram.sendMessage(chatId, marketReportMessage(report, this.config), reportKeyboard());
  }

  async commandDemoAlert(message) {
    const ca = 'So11111111111111111111111111111111111111112';
    await this.alertEngine.routeEvent(this.provider.demoWalletAlert(ca));
    await this.alertEngine.routeEvent(this.provider.demoGroupSpike(ca));
    await this.telegram.sendMessage(message.chat.id, 'Demo alerts routed through the alert engine.');
  }

  async commandBackup(message) {
    const authorization = await this.canRunBackup(message);
    if (!authorization.ok) {
      await this.telegram.sendMessage(
        message.chat.id,
        'Backup is owner/admin only. In a group or channel, any Telegram admin can run it. In private chat, set ADMIN_USER_IDS or BACKUP_CHAT_ID first.'
      );
      return;
    }

    const targetChatId = this.config.backupChatId || (message.chat.type === 'private' ? message.chat.id : '');
    const result = await this.backupManager.sendBackup(`manual:${authorization.reason}`, {
      force: true,
      chatId: targetChatId
    });
    if (result.skipped) {
      await this.telegram.sendMessage(
        message.chat.id,
        `${result.reason} Send /id to the bot in private chat, then set BACKUP_CHAT_ID to that private chat ID.`
      );
      return;
    }

    await this.telegram.sendMessage(
      message.chat.id,
      [
        '✅ Backup sent to the private backup chat.',
        `File: <code>${result.filename}</code>`,
        `Size: <code>${result.bytes}</code> bytes`
      ].join('\n')
    );
  }

  async commandRestore(message) {
    if (!this.backupManager.isOwner(message.from?.id)) {
      await this.telegram.sendMessage(message.chat.id, 'Owner-only command. Restore is locked to ADMIN_USER_IDS.');
      return;
    }

    if (message.chat.type !== 'private') {
      await this.telegram.sendMessage(message.chat.id, 'Restore only works in a private DM with the bot.');
      return;
    }

    if (!message.document) {
      await this.telegram.sendMessage(message.chat.id, 'Attach a Radar backup JSON file in this private chat with caption /restore.');
      return;
    }

    try {
      const result = await this.backupManager.restoreFromTelegramDocument(message.document);
      await this.telegram.sendMessage(
        message.chat.id,
        [
          '✅ Restore complete.',
          `Users: <code>${result.users}</code>`,
          `Groups: <code>${result.groups}</code>`
        ].join('\n')
      );
    } catch (error) {
      await this.telegram.sendMessage(message.chat.id, `Restore failed: <code>${error.message}</code>`);
    }
  }

  async commandId(message) {
    const status = this.backupManager.status();
    const userId = message.from?.id ? String(message.from.id) : 'not available on channel posts';
    await this.telegram.sendMessage(
      message.chat.id,
      [
        '🪪 <b>Telegram IDs</b>',
        '',
        `Your user ID: <code>${userId}</code>`,
        `This chat ID: <code>${message.chat.id}</code>`,
        `Chat type: <code>${message.chat.type}</code>`,
        '',
        '<b>Backup setup</b>',
        `Configured: <b>${status.configured ? 'Yes' : 'No'}</b>`,
        `Data file: <code>${status.dataFile}</code>`,
        '',
        'For private backups, set BACKUP_CHAT_ID to your private user ID. Group/channel admins can run /backup without being listed in ADMIN_USER_IDS.'
      ].join('\n')
    );
  }

  async callbackAlertMode(chatId, messageId, userId, data) {
    const mode = data.split(':')[1];
    const user = this.store.setUserAlertMode(userId, mode);
    await this.telegram.editMessageText(chatId, messageId, alertPrefsMessage(user), alertPrefsKeyboard(user.settings.alertMode));
  }

  async callbackWatchToken(chatId, userId, data) {
    const [, ca, mode] = data.split(':');
    this.store.addUserTokenWatch(userId, ca, {
      mode,
      types: mode === 'silent' ? [] : [mode]
    });
    await this.telegram.sendMessage(chatId, tokenWatchedMessage(ca, mode), actionButtons(this.config, ca, { watch: false }));
  }

  async callbackWatchWallet(chatId, userId, data) {
    const [, wallet, mode] = data.split(':');
    this.store.addUserWalletWatch(userId, wallet, {
      mode,
      label: 'Watched Wallet'
    });
    await this.telegram.sendMessage(chatId, walletWatchedMessage(wallet, mode));
  }

  async callbackQuickWatch(chatId, userId, data) {
    const ca = data.split(':')[1];
    this.store.addUserTokenWatch(userId, ca, { mode: 'important', types: ['important'] });
    await this.telegram.sendMessage(chatId, tokenWatchedMessage(ca, 'important'), actionButtons(this.config, ca, { watch: false }));
  }

  async callbackMuteToken(chatId, userId, data) {
    const ca = data.split(':')[1];
    this.store.muteUserToken(userId, ca);
    await this.telegram.sendMessage(chatId, `Muted token <code>${ca}</code>.`);
  }

  async callbackNewPairs(chatId, data) {
    const action = data.split(':')[1];
    if (action === 'filters') {
      await this.telegram.sendMessage(chatId, newPairFiltersMessage(), newPairsKeyboard());
      return;
    }
    if (action === 'watch') {
      await this.telegram.sendMessage(chatId, 'New-pair watch mode is ready. Group auto-posting still follows admin settings and cooldowns.');
      return;
    }
    await this.commandNewPairs(chatId);
  }

  async callbackGroupSetting(callback, data) {
    const message = callback.message;
    if (message.chat.type === 'private') return;

    const isAdmin = await this.isGroupAdmin(message.chat.id, callback.from.id);
    if (!isAdmin) {
      await this.telegram.answerCallbackQuery(callback.id, { text: 'Admins only.', show_alert: true }).catch(() => {});
      return;
    }

    const [, action, key] = data.split(':');
    let group = this.store.ensureGroup(message.chat);

    if (action === 'toggle') {
      group = this.store.toggleGroupSetting(message.chat.id, key);
    } else if (action === 'toggleQuiet') {
      group.settings.quietHours.enabled = !group.settings.quietHours.enabled;
      this.store.save();
    } else if (action === 'cooldown') {
      const next = group.settings.cooldownMinutes >= 30 ? 5 : group.settings.cooldownMinutes + 5;
      group = this.store.setGroupCooldown(message.chat.id, next);
    }

    await this.telegram.editMessageText(
      message.chat.id,
      message.message_id,
      groupSettingsMessage(group),
      groupSettingsKeyboard(group)
    );
  }

  async handleGroupAutoScan(message) {
    const group = this.store.ensureGroup(message.chat);
    if (!group.settings.autoCaScan) return;

    const addresses = findSolanaAddresses(message.text ?? message.caption ?? '');
    if (!addresses.length) return;

    const ca = addresses[0];
    if (!this.antiSpam.canAutoScan(group.id, ca, 10)) return;

    const scan = await this.provider.scanToken(ca);
    await this.telegram.sendMessage(message.chat.id, scanMessage(scan, this.config), actionButtons(this.config, ca));
  }

  async isGroupAdmin(chatId, userId) {
    if (!userId) return false;

    try {
      const member = await this.telegram.getChatMember(chatId, userId);
      return ['administrator', 'creator'].includes(member.status);
    } catch (error) {
      console.warn(`[admin-check] ${error.message}`);
      return false;
    }
  }

  async isMessageFromChatAdmin(message) {
    if (message.chat.type === 'channel') {
      return true;
    }

    if (message.sender_chat?.id === message.chat.id && message.chat.type !== 'private') {
      return true;
    }

    return this.isGroupAdmin(message.chat.id, message.from?.id);
  }

  async canRunBackup(message) {
    if (this.backupManager.isOwner(message.from?.id)) {
      return { ok: true, reason: 'owner' };
    }

    if (!this.config.allowChatAdminBackup || message.chat.type === 'private') {
      return { ok: false, reason: 'not-authorized' };
    }

    if (await this.isMessageFromChatAdmin(message)) {
      return { ok: true, reason: `${message.chat.type}-admin` };
    }

    return { ok: false, reason: 'not-chat-admin' };
  }

  stop() {
    this.stopped = true;
    this.backupManager.stop();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLooseBackupCommand(text) {
  const normalized = normalizeLooseCommand(text);
  return [
    'backup',
    'back up',
    'backup now',
    'back up now',
    'run backup',
    'make backup',
    'bot backup',
    'radar backup'
  ].includes(normalized);
}

function isLooseRestoreCommand(text) {
  const normalized = normalizeLooseCommand(text);
  return normalized === 'restore' || normalized === 'run restore';
}

function normalizeLooseCommand(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/@\w+\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
