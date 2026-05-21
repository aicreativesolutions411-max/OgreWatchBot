import { NEW_PAIR_AGE_OPTIONS, NEW_PAIR_DEFAULT_FILTERS } from './domain/defaults.js';
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
  untrackAdminRequiredMessage,
  untrackNotFoundMessage,
  untrackTokenMessage,
  untrackWalletMessage,
  usageMessage,
  walletWatchedMessage,
  watchlistMessage
} from './ui/messages.js';
import { findSolanaAddresses, looksLikeSolanaAddress } from './utils/solana.js';

const PUBLIC_COMMANDS = [
  { command: 'start', description: 'Open main menu' },
  { command: 'watchtoken', description: 'Watch a token' },
  { command: 'watchwallet', description: 'Watch a wallet' },
  { command: 'new', description: 'View new pairs' },
  { command: 'newpairs', description: 'View new pairs' },
  { command: 'untrack', description: 'Untrack token or wallet' },
  { command: 'untrackcoin', description: 'Untrack a coin' },
  { command: 'untracktoken', description: 'Untrack a token' },
  { command: 'untrackwallet', description: 'Untrack a wallet' },
  { command: 'trending', description: 'View trending tokens' },
  { command: 'portfolio', description: 'Check wallet summary' },
  { command: 'myalerts', description: 'Manage alerts' },
  { command: 'mywatchlist', description: 'View watchlist' },
  { command: 'report', description: 'Latest market report' },
  { command: 'help', description: 'Help menu' },
  { command: 'id', description: 'Show chat and user IDs' },
  { command: 'ping', description: 'Test bot status' }
];

const ADMIN_COMMANDS = [
  { command: 'groupsettings', description: 'Admin group settings' },
  { command: 'commands', description: 'Refresh chat commands' }
];

const PRIVATE_CHAT_ADMIN_COMMANDS = [
  ...PUBLIC_COMMANDS,
  ...ADMIN_COMMANDS,
  { command: 'backup', description: 'Private chat backup' }
];

const ALL_ADMIN_COMMANDS = [...PUBLIC_COMMANDS, ...ADMIN_COMMANDS];
const KNOWN_COMMANDS = new Set([
  ...PUBLIC_COMMANDS.map((item) => `/${item.command}`),
  ...ADMIN_COMMANDS.map((item) => `/${item.command}`),
  '/backup',
  '/restore',
  '/demoalert'
]);

export class RadarBot {
  constructor({ config, store, telegram, provider, alertEngine, backupManager }) {
    this.config = config;
    this.store = store;
    this.telegram = telegram;
    this.provider = provider;
    this.alertEngine = alertEngine;
    this.backupManager = backupManager;
    this.antiSpam = new AntiSpam(store);
    this.commandRefreshSeenChatIds = new Set();
    this.stopped = false;
  }

  async start() {
    await this.prepareTelegramPolling();
    this.botUser = await this.telegram.getMe();
    await this.prepareUpdateOffset();
    await this.registerGlobalCommands();
    await this.registerKnownChatCommands();
    console.log(`[ready] ${this.config.botName} polling Telegram updates from offset ${this.store.data.meta.offset}.`);

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
          allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'my_chat_member', 'callback_query']
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

    if (update.edited_message) {
      await this.handleMessage(update.edited_message, { edited: true });
      return;
    }

    if (update.channel_post) {
      await this.handleMessage(update.channel_post);
      return;
    }

    if (update.edited_channel_post) {
      await this.handleMessage(update.edited_channel_post, { edited: true });
      return;
    }

    if (update.my_chat_member) {
      await this.handleMyChatMember(update.my_chat_member);
      return;
    }

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    }
  }

  async handleMessage(message, options = {}) {
    const chat = message.chat;
    const from = message.from;
    const text = message.text ?? message.caption ?? '';

    if (!chat) return;

    this.logIncomingMessage(message, { edited: options.edited });

    if (chat.type === 'private' && from) {
      this.store.ensureUser(from, chat.id);
    } else {
      this.store.ensureGroup(chat);
      if (from) this.store.ensureUser(from, from.id);
    }

    if (text.trim().startsWith('/') && chat.type !== 'private') {
      await this.registerChatCommandsOnce(chat);
    }

    if (message.document && isStrictCommand(text, '/restore')) {
      await this.commandRestore(message);
      return;
    }

    if (text.trim().startsWith('/')) {
      await this.handleCommand(message, text);
      return;
    }

    if (await this.handleLooseTextCommand(message, text)) {
      return;
    }

    if (chat.type !== 'private') {
      if (!options.edited) this.store.incrementChatMessageCount(chat.id);
      await this.handleGroupAutoScan(message);
    }
  }

  logIncomingMessage(message, options = {}) {
    const text = message.text ?? message.caption ?? '';
    if (!text) return;

    const normalized = normalizeLooseCommand(text);
    const shouldLog = message.chat?.type === 'channel' || text.trim().startsWith('/') || isLooseBotCommand(normalized);
    if (!shouldLog) return;

    const edited = options.edited ? ' edited' : '';
    const preview = text.replace(/\s+/g, ' ').slice(0, 80);
    console.log(`[message]${edited} ${message.chat.type}:${message.chat.id} "${preview}"`);
  }

  async handleLooseTextCommand(message, text) {
    void message;
    void text;
    return false;
  }

  async handleCommand(message, text) {
    const [rawCommand, ...args] = text.trim().split(/\s+/);
    const command = rawCommand.split('@')[0].toLowerCase();

    if (!this.isKnownCommand(command)) {
      console.log(`[command] ignored unknown command ${command} in ${message.chat.type}:${message.chat.id}`);
      return;
    }

    const actionGate = this.chatActionGate(message.chat, commandActionKey(command, args));
    if (!actionGate.allowed) {
      console.log(`[gate] ${message.chat.type}:${message.chat.id} ${command} waiting ${actionGate.remaining} messages`);
      return;
    }

    if (command === '/backup') {
      await this.commandBackup(message);
      return;
    }

    if (command === '/restore') {
      await this.commandRestore(message);
      return;
    }

    switch (command) {
      case '/start':
        await this.sendStart(message.chat.id, await this.shouldShowAdminControls(message));
        break;
      case '/watchtoken':
        await this.commandWatchToken(message, args);
        break;
      case '/watchwallet':
        await this.commandWatchWallet(message, args);
        break;
      case '/new':
      case '/newpairs':
        await this.commandNewPairs(message.chat.id);
        break;
      case '/untrack':
        await this.commandUntrack(message, args, 'any');
        break;
      case '/untrackcoin':
      case '/untracktoken':
        await this.commandUntrack(message, args, 'token');
        break;
      case '/untrackwallet':
        await this.commandUntrack(message, args, 'wallet');
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
      case '/ping':
        await this.commandPing(message);
        break;
      case '/commands':
        await this.commandRefreshCommands(message);
        break;
      case '/demoalert':
        if (this.config.enableDemoCommands) await this.commandDemoAlert(message);
        break;
      default:
        console.log(`[command] ${command} is registered but disabled in ${message.chat.type}:${message.chat.id}`);
    }
  }

  async handleCallback(callback) {
    const data = callback.data ?? '';
    const message = callback.message;
    const chatId = message.chat.id;
    const userId = callback.from.id;

    this.store.ensureUser(callback.from, callback.message.chat.type === 'private' ? chatId : userId);
    const actionGate = this.chatActionGate(message.chat, callbackActionKey(data));
    if (!actionGate.allowed) {
      await this.telegram.answerCallbackQuery(callback.id, {
        text: `Wait for ${actionGate.remaining} more chat messages before repeating this.`,
        show_alert: false
      }).catch(() => {});
      return null;
    }

    await this.telegram.answerCallbackQuery(callback.id).catch(() => {});

    if (data === 'menu:start') {
      return this.editMenu(chatId, message.message_id, await this.shouldShowAdminControls({
        chat: message.chat,
        from: callback.from
      }));
    }
    if (data === 'menu:watchtoken') return this.telegram.sendMessage(chatId, usageMessage('/watchtoken CA', '/watchtoken So11111111111111111111111111111111111111112'));
    if (data === 'menu:watchwallet') return this.telegram.sendMessage(chatId, usageMessage('/watchwallet walletaddress', '/watchwallet 7fL4...wallet'));
    if (data === 'menu:new') return this.commandNewPairs(chatId);
    if (data === 'menu:trending') return this.commandTrending(chatId, '5m');
    if (data === 'menu:alerts') return this.commandMyAlerts({ chat: { id: chatId }, from: callback.from });
    if (data === 'menu:watchlist') return this.commandMyWatchlist({ chat: { id: chatId }, from: callback.from });
    if (data === 'menu:groupsettings') return this.commandGroupSettings({ chat: message.chat, from: callback.from });
    if (data === 'menu:report') return this.commandReport(chatId);

    if (data.startsWith('alertmode:')) return this.callbackAlertMode(chatId, message.message_id, userId, data);
    if (data.startsWith('wt:')) return this.callbackWatchToken(message.chat, userId, data);
    if (data.startsWith('ww:')) return this.callbackWatchWallet(message.chat, userId, data);
    if (data.startsWith('qw:')) return this.callbackQuickWatch(message.chat, userId, data);
    if (data.startsWith('mt:')) return this.callbackMuteToken(chatId, userId, data);
    if (data.startsWith('portfolio:')) return this.commandPortfolio(chatId, [data.split(':')[1]]);
    if (data.startsWith('new:')) return this.callbackNewPairs(chatId, data);
    if (data.startsWith('trending:')) return this.commandTrending(chatId, data.split(':')[1] ?? '5m');
    if (data.startsWith('group:')) return this.callbackGroupSetting(callback, data);

    return null;
  }

  async sendStart(chatId, showAdmin = false) {
    await this.telegram.sendMessage(chatId, mainMenuMessage(this.config), mainMenuKeyboard({ showAdmin }));
  }

  async editMenu(chatId, messageId, showAdmin = false) {
    await this.telegram.editMessageText(chatId, messageId, mainMenuMessage(this.config), mainMenuKeyboard({ showAdmin }));
  }

  async commandWatchToken(message, args) {
    const ca = args[0];
    if (!ca || !looksLikeSolanaAddress(ca)) {
      await this.telegram.sendMessage(message.chat.id, usageMessage('/watchtoken CA', '/watchtoken So11111111111111111111111111111111111111112'));
      return;
    }

    await this.telegram.sendMessage(message.chat.id, askTokenOptionsMessage(ca, this.config), tokenOptionsKeyboard(ca));
  }

  async commandWatchWallet(message, args) {
    const wallet = args[0];
    if (!wallet || !looksLikeSolanaAddress(wallet)) {
      await this.telegram.sendMessage(message.chat.id, usageMessage('/watchwallet walletaddress', '/watchwallet So11111111111111111111111111111111111111112'));
      return;
    }

    await this.telegram.sendMessage(message.chat.id, askWalletOptionsMessage(wallet, this.config), walletOptionsKeyboard(wallet));
  }

  async commandUntrack(message, args, kind = 'any') {
    const query = args[0]?.trim();
    if (!query) {
      const usage = kind === 'wallet'
        ? usageMessage('/untrackwallet walletaddress', '/untrackwallet So11111111111111111111111111111111111111112')
        : usageMessage(kind === 'token' ? '/untrackcoin CA_OR_TICKER' : '/untrack CA_OR_TICKER_OR_WALLET', kind === 'token' ? '/untrackcoin $OGRE' : '/untrack $OGRE');
      await this.telegram.sendMessage(message.chat.id, usage);
      return;
    }

    const context = {
      user: message.from ? this.store.ensureUser(message.from, message.chat.type === 'private' ? message.chat.id : message.from.id) : null,
      isGroupChat: message.chat.type !== 'private',
      isGroupAdmin: message.chat.type !== 'private' ? await this.isMessageFromChatAdmin(message) : false
    };

    if (kind === 'wallet') {
      await this.commandUntrackWallet(message, query, context);
      return;
    }

    if (kind === 'token' || !looksLikeSolanaAddress(query)) {
      await this.commandUntrackToken(message, query, context);
      return;
    }

    const tokenResult = await this.untrackTokenByQuery(message, query, context);
    const walletResult = await this.untrackWalletByAddress(message, query, context);

    if (tokenResult.removed) await this.sendUntrackTokenResult(message.chat.id, tokenResult);
    if (walletResult.removed) await this.sendUntrackWalletResult(message.chat.id, walletResult);

    if (!tokenResult.removed && !walletResult.removed) {
      if (tokenResult.adminBlocked || walletResult.adminBlocked) {
        await this.telegram.sendMessage(message.chat.id, untrackAdminRequiredMessage(query));
        return;
      }
      await this.telegram.sendMessage(message.chat.id, untrackNotFoundMessage(query, 'watch'));
    }
  }

  async commandUntrackToken(message, query, context) {
    const result = await this.untrackTokenByQuery(message, query, context);
    if (result.removed) {
      await this.sendUntrackTokenResult(message.chat.id, result);
      return;
    }

    await this.telegram.sendMessage(
      message.chat.id,
      result.adminBlocked ? untrackAdminRequiredMessage(query) : untrackNotFoundMessage(query, 'coin watch')
    );
  }

  async commandUntrackWallet(message, wallet, context) {
    if (!looksLikeSolanaAddress(wallet)) {
      await this.telegram.sendMessage(message.chat.id, usageMessage('/untrackwallet walletaddress', '/untrackwallet So11111111111111111111111111111111111111112'));
      return;
    }

    const result = await this.untrackWalletByAddress(message, wallet, context);
    if (result.removed) {
      await this.sendUntrackWalletResult(message.chat.id, result);
      return;
    }

    await this.telegram.sendMessage(
      message.chat.id,
      result.adminBlocked ? untrackAdminRequiredMessage(wallet) : untrackNotFoundMessage(wallet, 'wallet watch')
    );
  }

  async untrackTokenByQuery(message, query, context) {
    const resolved = await this.resolveWatchedToken(message, query);
    if (!resolved) {
      return { removed: false, adminBlocked: false };
    }

    const removedFrom = [];
    if (context.user && this.store.removeUserTokenWatch(context.user.id, resolved.ca)) {
      removedFrom.push('your alerts');
    }

    const group = context.isGroupChat ? this.store.getGroup(message.chat.id) : null;
    const groupTracked = Boolean(group?.watchTokens?.[resolved.ca]);
    if (groupTracked && context.isGroupAdmin && this.store.removeGroupTokenWatch(message.chat.id, resolved.ca)) {
      removedFrom.push('this group');
    }

    return {
      removed: removedFrom.length > 0,
      adminBlocked: groupTracked && !context.isGroupAdmin && removedFrom.length === 0,
      ca: resolved.ca,
      symbol: resolved.symbol,
      removedFrom
    };
  }

  async untrackWalletByAddress(message, wallet, context) {
    const removedFrom = [];
    let label = 'Watched Wallet';

    const userWatch = context.user?.watchWallets?.[wallet];
    if (userWatch?.label) label = userWatch.label;
    if (context.user && this.store.removeUserWalletWatch(context.user.id, wallet)) {
      removedFrom.push('your alerts');
    }

    const group = context.isGroupChat ? this.store.getGroup(message.chat.id) : null;
    const groupWatch = group?.watchWallets?.[wallet];
    if (groupWatch?.label) label = groupWatch.label;
    const groupTracked = Boolean(groupWatch);
    if (groupTracked && context.isGroupAdmin && this.store.removeGroupWalletWatch(message.chat.id, wallet)) {
      removedFrom.push('this group');
    }

    return {
      removed: removedFrom.length > 0,
      adminBlocked: groupTracked && !context.isGroupAdmin && removedFrom.length === 0,
      wallet,
      label,
      removedFrom
    };
  }

  async sendUntrackTokenResult(chatId, result) {
    await this.telegram.sendMessage(chatId, untrackTokenMessage({
      ca: result.ca,
      symbol: result.symbol,
      removedFrom: result.removedFrom,
      config: this.config
    }));
  }

  async sendUntrackWalletResult(chatId, result) {
    await this.telegram.sendMessage(chatId, untrackWalletMessage({
      wallet: result.wallet,
      label: result.label,
      removedFrom: result.removedFrom,
      config: this.config
    }));
  }

  async resolveWatchedToken(message, query) {
    const value = String(query ?? '').trim();
    if (!value) return null;

    if (looksLikeSolanaAddress(value)) {
      const symbol = await this.lookupTokenSymbol(value);
      return { ca: value, symbol };
    }

    const targetTicker = normalizeTicker(value);
    if (!targetTicker) return null;

    for (const ca of this.watchedTokenCandidates(message)) {
      const symbol = await this.lookupTokenSymbol(ca);
      if (normalizeTicker(symbol) === targetTicker) {
        return { ca, symbol };
      }
    }

    return null;
  }

  watchedTokenCandidates(message) {
    const candidates = new Set();
    if (message.from) {
      const user = this.store.getUser(message.from.id);
      Object.keys(user?.watchTokens ?? {}).forEach((ca) => candidates.add(ca));
    }

    if (message.chat.type !== 'private') {
      const group = this.store.getGroup(message.chat.id);
      Object.keys(group?.watchTokens ?? {}).forEach((ca) => candidates.add(ca));
    }

    return [...candidates];
  }

  async lookupTokenSymbol(ca) {
    try {
      const scan = await this.provider.scanToken(ca);
      return scan?.symbol ?? '';
    } catch (error) {
      console.warn(`[untrack-symbol] ${ca} ${error.message}`);
      return '';
    }
  }

  async commandNewPairs(chatId, options = {}) {
    const maxAgeMinutes = normalizeNewPairAge(options.maxAgeMinutes ?? this.config.newPairDefaultAgeMinutes ?? NEW_PAIR_DEFAULT_FILTERS.maxAgeMinutes);
    const filters = {
      ...NEW_PAIR_DEFAULT_FILTERS,
      freshMinLiquidityUsd: this.config.newPairFreshMinLiquidityUsd ?? NEW_PAIR_DEFAULT_FILTERS.freshMinLiquidityUsd,
      freshMinVolumeUsd: this.config.newPairFreshMinVolumeUsd ?? NEW_PAIR_DEFAULT_FILTERS.freshMinVolumeUsd,
      maxAgeMinutes
    };
    const pairs = await this.provider.getNewPairs(filters);
    await this.telegram.sendMessage(
      chatId,
      newPairsMessage(pairs, this.config, this.provider.marketStatus?.(), filters),
      newPairsKeyboard(maxAgeMinutes)
    );
  }

  async commandTrending(chatId, kind) {
    const trending = await this.provider.getTrending(kind);
    await this.telegram.sendMessage(chatId, trendingMessage(trending.tokens, trending.label, this.config, this.provider.marketStatus?.()), trendingKeyboard());
  }

  async commandPortfolio(chatId, args) {
    const wallet = args[0];
    if (!wallet || !looksLikeSolanaAddress(wallet)) {
      await this.telegram.sendMessage(chatId, usageMessage('/portfolio walletaddress', '/portfolio So11111111111111111111111111111111111111112'));
      return;
    }

    const summary = await this.provider.getPortfolio(wallet);
    await this.telegram.sendMessage(chatId, portfolioMessage(summary, this.config), {
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
    await this.telegram.sendMessage(message.chat.id, watchlistMessage(user, this.config));
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
    await this.telegram.sendMessage(message.chat.id, groupSettingsMessage(group, this.config), groupSettingsKeyboard(group));
  }

  async commandReport(chatId) {
    const report = await this.provider.getMarketReport();
    await this.telegram.sendMessage(chatId, marketReportMessage(report, this.config, this.provider.marketStatus?.()), reportKeyboard());
  }

  async commandPing(message) {
    await this.telegram.sendMessage(
      message.chat.id,
      [
        'Pong. Bot is online.',
        `Chat type: <code>${message.chat.type}</code>`,
        `Chat ID: <code>${message.chat.id}</code>`
      ].join('\n')
    );
  }

  async commandRefreshCommands(message) {
    if (message.chat.type !== 'private' && !(await this.isMessageFromChatAdmin(message))) {
      await this.telegram.sendMessage(message.chat.id, 'Only chat admins can refresh commands here.');
      return;
    }

    const result = await this.registerChatCommands(message.chat);
    await this.telegram.sendMessage(message.chat.id, result.message);
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
      const reason = authorization.reason === 'public-chat'
        ? 'Backups only work in private channels/groups. This chat is public, so no backup was created.'
        : 'Backup is owner/private-admin only. Add the bot as admin in a private channel/group, or use an owner private chat.';
      await this.telegram.sendMessage(
        message.chat.id,
        reason
      );
      return;
    }

    const targetChatId = this.config.backupChatId || message.chat.id;
    const result = await this.backupManager.sendBackup(`manual:${authorization.reason}`, {
      force: true,
      chatId: targetChatId
    });
    if (result.skipped) {
      await this.telegram.sendMessage(
        message.chat.id,
        `${result.reason} Add BACKUP_CHAT_ID if you want backups sent to a private DM instead.`
      );
      return;
    }

    console.log(`[backup] sent ${result.filename} to chat ${targetChatId}`);
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

  async callbackWatchToken(chat, userId, data) {
    const [, ca, mode] = data.split(':');
    this.store.addUserTokenWatch(userId, ca, {
      mode,
      types: mode === 'silent' ? [] : [mode]
    });
    if (chat.type !== 'private') {
      this.store.addGroupTokenWatch(chat.id, ca, { mode });
    }
    await this.telegram.sendMessage(chat.id, tokenWatchedMessage(ca, mode, this.config), actionButtons(this.config, ca, { watch: false }));
  }

  async callbackWatchWallet(chat, userId, data) {
    const [, wallet, mode] = data.split(':');
    this.store.addUserWalletWatch(userId, wallet, {
      mode,
      label: 'Watched Wallet'
    });
    if (chat.type !== 'private') {
      this.store.addGroupWalletWatch(chat.id, wallet, { mode, label: 'Watched Wallet' });
    }
    await this.telegram.sendMessage(chat.id, walletWatchedMessage(wallet, mode, this.config));
  }

  async callbackQuickWatch(chat, userId, data) {
    const ca = data.split(':')[1];
    this.store.addUserTokenWatch(userId, ca, { mode: 'important', types: ['important'] });
    if (chat.type !== 'private') {
      this.store.addGroupTokenWatch(chat.id, ca, { mode: 'important' });
    }
    await this.telegram.sendMessage(chat.id, tokenWatchedMessage(ca, 'important', this.config), actionButtons(this.config, ca, { watch: false }));
  }

  async callbackMuteToken(chatId, userId, data) {
    const ca = data.split(':')[1];
    this.store.muteUserToken(userId, ca);
    await this.telegram.sendMessage(chatId, `Muted token <code>${ca}</code>.`);
  }

  async callbackNewPairs(chatId, data) {
    const [, action, rawValue] = data.split(':');
    if (action === 'filters') {
      const maxAgeMinutes = normalizeNewPairAge(this.config.newPairDefaultAgeMinutes ?? NEW_PAIR_DEFAULT_FILTERS.maxAgeMinutes);
      await this.telegram.sendMessage(chatId, newPairFiltersMessage(), newPairsKeyboard(maxAgeMinutes));
      return;
    }
    if (action === 'watch') {
      await this.telegram.sendMessage(chatId, 'New-pair watch mode is ready. Group auto-posting still follows admin settings and cooldowns.');
      return;
    }
    if (action === 'age') {
      await this.commandNewPairs(chatId, { maxAgeMinutes: rawValue });
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
      groupSettingsMessage(group, this.config),
      groupSettingsKeyboard(group)
    );
  }

  async handleGroupAutoScan(message) {
    if (!this.config.enableAutoCaScan) return;
    const group = this.store.ensureGroup(message.chat);
    if (!group.settings.autoCaScan) return;

    const addresses = findSolanaAddresses(message.text ?? message.caption ?? '');
    if (!addresses.length) return;

    const ca = addresses[0];
    if (!this.antiSpam.canAutoScan(group.id, ca, 10)) return;

    const scan = await this.provider.scanToken(ca);
    await this.telegram.sendMessage(message.chat.id, scanMessage(scan, this.config), actionButtons(this.config, ca));
  }

  isKnownCommand(command) {
    if (command === '/demoalert' && !this.config.enableDemoCommands) return false;
    return KNOWN_COMMANDS.has(command);
  }

  chatActionGate(chat, actionKey) {
    if (!chat || chat.type === 'private' || this.config.commandGateMessages <= 0) {
      return { allowed: true, remaining: 0 };
    }

    const currentCount = this.store.getChatMessageCount(chat.id);
    const lastCount = this.store.getChatActionGate(chat.id, actionKey);
    const gap = currentCount - (lastCount ?? 0);
    if (lastCount != null && gap < this.config.commandGateMessages) {
      return {
        allowed: false,
        remaining: this.config.commandGateMessages - gap
      };
    }

    this.store.setChatActionGate(chat.id, actionKey, currentCount);
    return { allowed: true, remaining: 0 };
  }

  async handleMyChatMember(update) {
    const chat = update.chat;
    const status = update.new_chat_member?.status;

    if (!chat || chat.type === 'private') return;
    this.store.ensureGroup(chat);

    if (['administrator', 'creator'].includes(status)) {
      const result = await this.registerChatCommands(chat);
      console.log(`[commands] ${chat.type}:${chat.id} ${result.status}`);
    }
  }

  async prepareTelegramPolling() {
    if (!this.config.deleteWebhookOnStart) return;

    await this.telegram.deleteWebhook({
      drop_pending_updates: this.config.dropPendingUpdatesOnStart
    }).catch((error) => {
      console.warn(`[webhook] deleteWebhook failed: ${error.message}`);
    });

    await this.telegram.getWebhookInfo().then((info) => {
      if (info.url) {
        console.warn(`[webhook] still configured: ${info.url}`);
      } else {
        console.log('[webhook] cleared; long polling enabled');
      }
    }).catch((error) => {
      console.warn(`[webhook] getWebhookInfo failed: ${error.message}`);
    });
  }

  async prepareUpdateOffset() {
    const meta = this.store.data.meta;
    const botId = String(this.botUser?.id ?? '');
    const botUsername = this.botUser?.username ?? '';
    const previousBotId = String(meta.telegramBotId ?? '');
    const shouldReset = this.config.resetTelegramOffsetOnStart || (previousBotId && previousBotId !== botId);

    if (shouldReset && meta.offset !== 0) {
      console.log(`[telegram] resetting stored update offset from ${meta.offset} to 0`);
      meta.offset = 0;
    }

    meta.telegramBotId = botId;
    meta.telegramBotUsername = botUsername;
    this.store.save();

    const handle = botUsername ? `@${botUsername}` : botId;
    console.log(`[telegram] logged in as ${handle}`);
  }

  async registerGlobalCommands() {
    const publicScopes = [
      { type: 'default' },
      { type: 'all_private_chats' },
      { type: 'all_group_chats' }
    ];

    for (const scope of publicScopes) {
      await this.telegram.setMyCommands(PUBLIC_COMMANDS, { scope }).catch((error) => {
        console.warn(`[commands] global scope ${scope.type} failed: ${error.message}`);
      });
    }

    await this.telegram.setMyCommands(ALL_ADMIN_COMMANDS, {
      scope: { type: 'all_chat_administrators' }
    }).catch((error) => {
      console.warn(`[commands] global scope all_chat_administrators failed: ${error.message}`);
    });
  }

  async registerKnownChatCommands() {
    for (const group of Object.values(this.store.data.groups)) {
      const chat = {
        id: group.id,
        type: group.type ?? 'supergroup',
        title: group.title,
        username: group.username
      };

      if (!(await this.botIsAdminInChat(chat.id))) continue;
      const result = await this.registerChatCommands(chat);
      this.commandRefreshSeenChatIds.add(String(chat.id));
      console.log(`[commands] startup ${chat.type}:${chat.id} ${result.status}`);
    }
  }

  async registerChatCommandsOnce(chat) {
    const chatId = String(chat.id);
    if (this.commandRefreshSeenChatIds.has(chatId)) return;
    this.commandRefreshSeenChatIds.add(chatId);

    if (!(await this.botIsAdminInChat(chat.id))) return;
    const result = await this.registerChatCommands(chat);
    console.log(`[commands] seen ${chat.type}:${chat.id} ${result.status}`);
  }

  async registerChatCommands(chat) {
    try {
      if (chat.type === 'channel') {
        await this.telegram.setMyCommands(isPublicTelegramChat(chat) ? ALL_ADMIN_COMMANDS : PRIVATE_CHAT_ADMIN_COMMANDS, {
          scope: {
            type: 'chat',
            chat_id: chat.id
          }
        });

        return {
          status: 'registered-channel',
          message: 'Commands refreshed for this channel. If Telegram does not show a menu here, typed commands like /ping and ping still work.'
        };
      }

      await this.telegram.setMyCommands(PUBLIC_COMMANDS, {
        scope: {
          type: 'chat',
          chat_id: chat.id
        }
      });

      const adminCommands = isPublicTelegramChat(chat) ? ALL_ADMIN_COMMANDS : PRIVATE_CHAT_ADMIN_COMMANDS;
      await this.telegram.setMyCommands(adminCommands, {
        scope: {
          type: 'chat_administrators',
          chat_id: chat.id
        }
      });

      return {
        status: 'registered',
        message: 'Commands refreshed for this chat.'
      };
    } catch (error) {
      console.warn(`[commands] chat ${chat.id} failed: ${error.message}`);
      return {
        status: 'failed',
        message: `Command refresh failed: ${error.message}`
      };
    }
  }

  async botIsAdminInChat(chatId) {
    if (!this.botUser?.id) return false;
    return this.isGroupAdmin(chatId, this.botUser.id);
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

    if (!this.config.backupAllowPublicChats && isPublicTelegramChat(message.chat)) {
      return { ok: false, reason: 'public-chat' };
    }

    if (await this.isMessageFromChatAdmin(message)) {
      return { ok: true, reason: `${message.chat.type}-admin` };
    }

    return { ok: false, reason: 'not-chat-admin' };
  }

  async shouldShowAdminControls(message) {
    if (message.chat.type === 'private') {
      return this.backupManager.isOwner(message.from?.id);
    }

    return this.isMessageFromChatAdmin(message);
  }

  stop() {
    this.stopped = true;
    this.backupManager.stop();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPublicTelegramChat(chat) {
  return chat?.type !== 'private' && !!chat?.username;
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

function isLooseBotCommand(normalized) {
  return Boolean(looseTextCommand(normalized));
}

function isStrictCommand(text, expectedCommand) {
  const [rawCommand] = String(text ?? '').trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  return command === expectedCommand;
}

function commandActionKey(command, args = []) {
  const firstArg = args[0] ?? '';
  const secondArg = args[1] ?? '';
  const keys = {
    '/start': 'menu:start',
    '/new': 'market:new',
    '/newpairs': 'market:new',
    '/trending': 'market:trending:5m',
    '/report': 'market:report',
    '/myalerts': 'menu:alerts',
    '/mywatchlist': 'menu:watchlist',
    '/groupsettings': 'group:settings',
    '/commands': 'group:commands',
    '/help': 'help',
    '/id': 'id',
    '/ping': 'ping',
    '/backup': 'backup',
    '/restore': 'restore'
  };

  if (command === '/portfolio') return `portfolio:${firstArg}`;
  if (command === '/watchtoken') return `watchtoken:${firstArg}:${secondArg}`;
  if (command === '/watchwallet') return `watchwallet:${firstArg}:${secondArg}`;
  if (command === '/untrack' || command === '/untrackcoin' || command === '/untracktoken' || command === '/untrackwallet') return `untrack:${command}:${firstArg}`;
  return keys[command] ?? `command:${command}:${args.slice(0, 2).join(':')}`;
}

function callbackActionKey(data = '') {
  if (data === 'menu:start') return 'menu:start';
  if (data === 'menu:new') return 'market:new';
  if (data.startsWith('new:age:')) return `market:${data}`;
  if (data.startsWith('new:')) return data === 'new:filters' ? 'market:new:filters' : 'market:new';
  if (data === 'menu:trending') return 'market:trending:5m';
  if (data.startsWith('trending:')) return `market:trending:${data.split(':')[1] ?? '5m'}`;
  if (data === 'menu:report') return 'market:report';
  if (data === 'menu:alerts') return 'menu:alerts';
  if (data === 'menu:watchlist') return 'menu:watchlist';
  if (data === 'menu:groupsettings') return 'group:settings';
  if (data.startsWith('portfolio:')) return `portfolio:${data.split(':')[1] ?? ''}`;
  return `callback:${data}`;
}

function looseTextCommand(text) {
  const normalized = normalizeLooseCommand(text);
  const aliases = {
    start: 'start',
    menu: 'start',
    help: 'help',
    ping: 'ping',
    id: 'id',
    new: 'new',
    pairs: 'new',
    'new pairs': 'new',
    trending: 'trending',
    report: 'report',
    commands: 'commands',
    settings: 'groupsettings',
    'group settings': 'groupsettings',
    groupsettings: 'groupsettings',
    backup: 'backup',
    'back up': 'backup',
    'backup now': 'backup',
    'back up now': 'backup',
    restore: 'restore'
  };

  return aliases[normalized] ?? '';
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

function normalizeTicker(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\$/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeNewPairAge(value) {
  const minutes = Number(value);
  const allowed = NEW_PAIR_AGE_OPTIONS.map((option) => option.minutes);
  return allowed.includes(minutes) ? minutes : NEW_PAIR_DEFAULT_FILTERS.maxAgeMinutes;
}
