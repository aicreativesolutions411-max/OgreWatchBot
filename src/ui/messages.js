import { ALERT_MODES, NEW_PAIR_DEFAULT_FILTERS, TOKEN_ALERT_OPTIONS, WALLET_ALERT_OPTIONS } from '../domain/defaults.js';
import { compactAddress, escapeHtml, linkFromTemplate, minutesAgo, percent, sol, usd } from '../utils/format.js';

export function mainMenuMessage(config) {
  return [
    `🛰 <b>${escapeHtml(config.botName)}</b>`,
    '',
    'Track wallets, tokens, new pairs, and Solana market movement without chat spam.'
  ].join('\n');
}

export function helpMessage(config) {
  return [
    `🛰 <b>${escapeHtml(config.botName)}</b>`,
    '',
    '<b>User commands</b>',
    '/start - Open main menu',
    '/watchtoken CA - Watch a token',
    '/watchwallet walletaddress - Watch a wallet',
    '/new - View new Solana pairs',
    '/newpairs - View new Solana pairs',
    '/untrack CA_OR_TICKER_OR_WALLET - Remove a watch',
    '/untrackcoin CA_OR_TICKER - Remove a watched coin',
    '/untracktoken CA_OR_TICKER - Remove a watched token',
    '/untrackwallet walletaddress - Remove a watched wallet',
    '/trending - View market movement',
    '/portfolio walletaddress - Check wallet summary',
    '/myalerts - Manage DM alerts',
    '/mywatchlist - View watched tokens and wallets',
    '/report - Latest market report',
    '/help - Help menu',
    '/id - Show chat and user IDs',
    '/ping - Test bot status',
    '',
    '<b>Admin commands</b>',
    '/groupsettings - Group alert settings',
    '/backup - Admin backup',
    '/restore - Owner-only restore',
    '/commands - Refresh command menu',
    '',
    'DMs carry detailed updates. Groups get filtered highlights and digests.'
  ].join('\n');
}

export function alertPrefsMessage(user) {
  const mode = user.settings.alertMode;
  return [
    '🔔 <b>My Alerts</b>',
    '',
    `Current mode: <b>${escapeHtml(ALERT_MODES[mode]?.label ?? mode)}</b>`,
    '',
    'Choose how you want personal DM updates delivered.'
  ].join('\n');
}

export function askTokenOptionsMessage(ca, config = {}) {
  return [
    '🛰 <b>Watch Token</b>',
    '',
    `Token: ${tokenAddressLink(ca, config)}`,
    '',
    'What do you want to know about this token?'
  ].join('\n');
}

export function tokenWatchedMessage(ca, mode, config = {}) {
  const label = TOKEN_ALERT_OPTIONS[mode] ?? ALERT_MODES[mode]?.label ?? mode;
  return [
    '✅ <b>Token Watch Added</b>',
    '',
    `Token: ${tokenAddressLink(ca, config)}`,
    `Mode: <b>${escapeHtml(label)}</b>`,
    '',
    'Important events will route to DM unless your alert mode is silent or digest-only.'
  ].join('\n');
}

export function askWalletOptionsMessage(wallet, config = {}) {
  return [
    '🐋 <b>Watch Wallet</b>',
    '',
    `Wallet: ${walletAddressLink(wallet, config)}`,
    '',
    'How should trades from this wallet be handled?'
  ].join('\n');
}

export function walletWatchedMessage(wallet, mode, config = {}) {
  const label = WALLET_ALERT_OPTIONS[mode] ?? ALERT_MODES[mode]?.label ?? mode;
  return [
    '✅ <b>Wallet Watch Added</b>',
    '',
    `Wallet: ${walletAddressLink(wallet, config)}`,
    `Mode: <b>${escapeHtml(label)}</b>`,
    '',
    'Large trades, first buys, repeated buys, and multi-wallet activity are treated as important.'
  ].join('\n');
}

export function untrackTokenMessage({ ca, symbol = '', removedFrom = [], config = {} }) {
  return [
    '<b>Coin Untracked</b>',
    '',
    `Coin: ${symbol ? tokenLink(symbol, ca, config) : tokenAddressLink(ca, config)}`,
    `Removed from: <b>${escapeHtml(removedFrom.join(', '))}</b>`
  ].join('\n');
}

export function untrackWalletMessage({ wallet, label = 'Watched Wallet', removedFrom = [], config = {} }) {
  return [
    '<b>Wallet Untracked</b>',
    '',
    `Wallet: ${walletLink(label, wallet, config)} - ${walletAddressLink(wallet, config, 6, 6)}`,
    `Removed from: <b>${escapeHtml(removedFrom.join(', '))}</b>`
  ].join('\n');
}

export function untrackNotFoundMessage(query, kind = 'watch') {
  return [
    '<b>Nothing Untracked</b>',
    '',
    `I could not find <code>${escapeHtml(query)}</code> in this ${escapeHtml(kind)} list.`
  ].join('\n');
}

export function untrackAdminRequiredMessage(query) {
  return [
    '<b>Admin Needed</b>',
    '',
    `This group is tracking <code>${escapeHtml(query)}</code>, but only group admins can remove group-tracked coins or wallets.`
  ].join('\n');
}

export function watchlistMessage(user, config = {}) {
  const tokens = Object.keys(user.watchTokens);
  const wallets = Object.values(user.watchWallets);

  const lines = ['📌 <b>My Watchlist</b>', ''];
  lines.push('<b>Tokens</b>');
  lines.push(tokens.length ? tokens.map((ca, index) => `${index + 1}. ${tokenAddressLink(ca, config, 6, 6)} - ${escapeHtml(user.watchTokens[ca].mode)}`).join('\n') : 'None yet.');
  lines.push('');
  lines.push('<b>Wallets</b>');
  lines.push(wallets.length ? wallets.map((watch, index) => `${index + 1}. ${walletLink(watch.label, watch.wallet, config)} - ${walletAddressLink(watch.wallet, config, 6, 6)} - ${escapeHtml(watch.mode)}`).join('\n') : 'None yet.');

  return lines.join('\n');
}

export function groupSettingsMessage(group, config = {}) {
  const s = group.settings;
  const autoCaScan = config.enableAutoCaScan ? s.autoCaScan : false;
  return [
    '⚙️ <b>Group Alert Settings</b>',
    '',
    `Auto CA Scan: <b>${onOff(autoCaScan)}</b>`,
    `New Pair Alerts: <b>${onOff(s.newPairAlerts)}</b>`,
    `Whale Alerts: <b>${onOff(s.whaleAlerts)}</b>`,
    `Trending Digest: <b>${onOff(s.trendingDigest)}</b>`,
    `Daily Report: <b>${onOff(s.dailyReport)}</b>`,
    `Cooldown: <b>${s.cooldownMinutes} minutes</b>`,
    `Alert Mode: <b>${escapeHtml(s.alertMode)}</b>`,
    `Quiet Hours: <b>${onOff(s.quietHours.enabled)}</b>`
  ].join('\n');
}

export function scanMessage(scan, config) {
  return [
    `🔎 <b>${tokenLink(scan.symbol, scan.ca, config)} Scan</b>`,
    '',
    `Market Cap: <b>${usd(scan.marketCapUsd)}</b>`,
    `Liquidity: <b>${usd(scan.liquidityUsd)}</b>`,
    `Volume 5m: <b>${usd(scan.volume5mUsd)}</b>`,
    `Holders: <b>${numberOrUnknown(scan.holders)}</b>`,
    `Risk: <b>${escapeHtml(scan.risk)}</b>`,
    '',
    `Mint disabled: <b>${yesNoUnknown(scan.mintDisabled)}</b>`,
    `Freeze disabled: <b>${yesNoUnknown(scan.freezeDisabled)}</b>`,
  ].join('\n');
}

export function newPairsMessage(pairs, config = {}, status = null) {
  const lines = ['🆕 <b>New Solana Pairs</b>', ''];
  lines.push(...marketStatusLines(status));
  if (status) lines.push('');
  pairs.forEach((pair, index) => {
    lines.push(`${index + 1}. <b>${tokenLink(pair.symbol, pair.ca, config)}</b> - ${minutesAgo(pair.ageMinutes)} - ${usd(pair.marketCapUsd)} MC - ${usd(pair.liquidityUsd)} liq`);
  });
  lines.push('');
  lines.push('Filters: liq over $10K, volume over $20K, market cap range.');
  return lines.join('\n');
}

export function newPairFiltersMessage() {
  const f = NEW_PAIR_DEFAULT_FILTERS;
  return [
    '🧪 <b>New Pair Filters</b>',
    '',
    `Minimum liquidity: <b>${usd(f.minLiquidityUsd)}</b>`,
    `Minimum volume: <b>${usd(f.minVolumeUsd)}</b>`,
    `Market cap range: <b>${usd(f.minMarketCapUsd)}-${usd(f.maxMarketCapUsd)}</b>`,
    'Mint disabled: <b>Unknown on DexScreener source</b>',
    'Freeze disabled: <b>Unknown on DexScreener source</b>',
    'Cooldown: <b>10 minutes</b>'
  ].join('\n');
}

export function trendingMessage(tokens, label = 'Trending', config = {}, status = null) {
  const lines = [`🔥 <b>${escapeHtml(label)}</b>`, ''];
  lines.push(...marketStatusLines(status));
  if (status) lines.push('');
  tokens.forEach((token, index) => {
    lines.push(`${index + 1}. <b>${tokenLink(token.symbol, token.ca, config)}</b> ${percent(token.movePercent)} - ${escapeHtml(token.reason)}`);
  });
  return lines.join('\n');
}

export function portfolioMessage(summary, config = {}) {
  return [
    '👛 <b>Wallet Summary</b>',
    '',
    `Wallet: ${walletAddressLink(summary.wallet, config, 8, 8)}`,
    `SOL balance: <b>${sol(summary.solBalance)}</b>`,
    `Tokens held: <b>${summary.tokensHeld}</b>`,
    `Estimated value: <b>${usd(summary.estimatedValueUsd)}</b>`,
    '',
    `Recent buys: <b>${summary.recentBuys}</b>`,
    `Recent sells: <b>${summary.recentSells}</b>`,
    `Biggest current bag: <b>${tokenLink(summary.biggestBag, summary.biggestBagCa, config)}</b>`,
    `Best recent trade: <b>${tradeText(summary.bestRecentTrade, summary.bestRecentTradeSymbol, summary.bestRecentTradeCa, config)}</b>`,
    `Worst recent trade: <b>${tradeText(summary.worstRecentTrade, summary.worstRecentTradeSymbol, summary.worstRecentTradeCa, config)}</b>`
  ].join('\n');
}

export function marketReportMessage(report, config, status = null) {
  const lines = [`🛰 <b>Solana Radar Update by ${escapeHtml(config.brand)}</b>`, ''];
  lines.push(...marketStatusLines(status));
  if (status) lines.push('');
  lines.push('<b>Top watched tokens</b>');
  report.topTokens.forEach((token, index) => {
    lines.push(`${index + 1}. <b>${tokenLink(token.symbol, token.ca, config)}</b> ${percent(token.movePercent)} - ${escapeHtml(token.reason)}`);
  });
  lines.push('');
  lines.push('<b>New pairs worth watching</b>');
  report.newPairs.forEach((pair, index) => {
    lines.push(`${index + 1}. <b>${tokenLink(pair.symbol, pair.ca, config)}</b> - ${usd(pair.liquidityUsd)} liq - ${minutesAgo(pair.ageMinutes)}`);
  });
  return lines.join('\n');
}

export function hourlyGroupUpdateMessage(update, config, status = null) {
  const lines = [`ðŸ›° <b>Hourly Radar Update by ${escapeHtml(config.brand)}</b>`, ''];
  lines.push(...marketStatusLines(status));
  if (status) lines.push('');

  lines.push('<b>Trending coins</b>');
  pushTokenRows(lines, update.trending, config, (token) => `${percent(token.movePercent)} - ${escapeHtml(token.reason)}`);
  lines.push('');

  lines.push('<b>Group tracked coins</b>');
  if (update.trackedTokens?.length) {
    update.trackedTokens.slice(0, 5).forEach((scan, index) => {
      lines.push(`${index + 1}. <b>${tokenLink(scan.symbol, scan.ca, config)}</b> - ${usd(scan.marketCapUsd)} MC - ${usd(scan.liquidityUsd)} liq`);
    });
  } else {
    lines.push('None tracked yet.');
  }
  lines.push('');

  lines.push('<b>Wallet updates</b>');
  if (update.trackedWallets?.length) {
    update.trackedWallets.slice(0, 5).forEach((watch, index) => {
      lines.push(`${index + 1}. ${walletLink(watch.label, watch.wallet, config)} - ${escapeHtml(watch.mode)} watch`);
    });
  } else {
    lines.push('No tracked wallets yet.');
  }
  lines.push('');

  lines.push('<b>New pairs</b>');
  pushPairRows(lines, update.newPairs, config);
  lines.push('');

  lines.push('<b>High volume</b>');
  pushTokenRows(lines, update.highVolume, config, (token) => escapeHtml(token.reason));

  return lines.join('\n');
}

export function walletAlertMessage(alert, config) {
  return [
    '🐋 <b>Wallet Alert</b>',
    '',
    `${walletLink(alert.walletLabel, alert.wallet, config)} ${escapeHtml(alert.side)} <b>${tokenLink(alert.symbol, alert.ca, config)}</b>`,
    `Amount: <b>${sol(alert.solAmount)}</b>`,
    `Market Cap: <b>${usd(alert.marketCapUsd)}</b>`,
    `Liquidity: <b>${usd(alert.liquidityUsd)}</b>`,
    '',
    `Reason sent: ${escapeHtml(alert.reason)}`,
  ].join('\n');
}

export function groupActivitySpikeMessage(alert, config) {
  return [
    `🚨 <b>${tokenLink(alert.symbol, alert.ca, config)} Activity Spike</b>`,
    '',
    `${alert.walletCount} watched wallets bought in ${alert.timeframeMinutes} minutes`,
    `Total: <b>${sol(alert.totalSol)}</b>`,
    `MC: <b>${usd(alert.marketCapBeforeUsd)} → ${usd(alert.marketCapAfterUsd)}</b>`,
    `Volume 5m: <b>${usd(alert.volume5mUsd)}</b>`,
  ].join('\n');
}

export function tokenMilestoneMessage(alert, config) {
  return [
    `📈 <b>${tokenLink(alert.symbol, alert.ca, config)} Milestone</b>`,
    '',
    `Market Cap hit <b>${usd(alert.marketCapUsd)}</b>`,
    `Move: <b>${percent(alert.movePercent)}</b> in ${alert.window}`,
    `Volume: <b>${usd(alert.volumeUsd)}</b>`,
    `Holders: <b>${alert.holders.toLocaleString('en-US')}</b>`,
  ].join('\n');
}

export function liquidityAlertMessage(alert, config) {
  return [
    `⚠️ <b>Liquidity Alert</b>`,
    '',
    `<b>${tokenLink(alert.symbol, alert.ca, config)}</b> liquidity changed`,
    `Before: <b>${usd(alert.beforeUsd)}</b>`,
    `Now: <b>${usd(alert.afterUsd)}</b>`,
    `Change: <b>${percent(alert.changePercent)}</b>`,
  ].join('\n');
}

export function digestMessage(alerts, config) {
  const lines = [`🛰 <b>${escapeHtml(config.botName)} Summary</b>`, ''];
  alerts.slice(0, 10).forEach((alert, index) => {
    lines.push(`${index + 1}. <b>${linkKnownEntities(alert.title, config, alert)}</b> - ${linkKnownEntities(alert.summary, config, alert)}`);
  });
  if (alerts.length > 10) lines.push(`...and ${alerts.length - 10} more.`);
  return lines.join('\n');
}

export function usageMessage(command, example) {
  return [
    `Usage: <code>${escapeHtml(command)}</code>`,
    `Example: <code>${escapeHtml(example)}</code>`
  ].join('\n');
}

function onOff(value) {
  return value ? 'ON' : 'OFF';
}

function yesNoUnknown(value) {
  if (value == null) return 'Unknown';
  return value ? 'Yes' : 'No';
}

function numberOrUnknown(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Unknown';
  return number.toLocaleString('en-US');
}

function pushTokenRows(lines, tokens = [], config = {}, detailBuilder = () => '') {
  if (!tokens.length) {
    lines.push('None yet.');
    return;
  }

  tokens.slice(0, 5).forEach((token, index) => {
    const detail = detailBuilder(token);
    lines.push(`${index + 1}. <b>${tokenLink(token.symbol, token.ca, config)}</b>${detail ? ` - ${detail}` : ''}`);
  });
}

function pushPairRows(lines, pairs = [], config = {}) {
  if (!pairs.length) {
    lines.push('None yet.');
    return;
  }

  pairs.slice(0, 5).forEach((pair, index) => {
    lines.push(`${index + 1}. <b>${tokenLink(pair.symbol, pair.ca, config)}</b> - ${minutesAgo(pair.ageMinutes)} - ${usd(pair.liquidityUsd)} liq`);
  });
}

function marketStatusLines(status) {
  if (!status) return [];
  const lines = [`Data: <b>${escapeHtml(status.source ?? 'Market')}</b> - updated <b>${escapeHtml(ageLabel(status.refreshedAt))}</b>`];
  if (status.error) lines.push(`Last refresh error: <code>${escapeHtml(status.error)}</code>`);
  return lines;
}

function tradeText(text, symbol, ca, config = {}) {
  return linkKnownEntities(text, config, {
    ca,
    symbol
  });
}

function linkKnownEntities(text, config = {}, entity = {}) {
  let output = escapeHtml(text);
  if (!output) return output;

  if (entity.wallet) {
    output = replaceLiteral(output, entity.wallet, walletAddressLink(entity.wallet, config, 8, 8));
    output = replaceLiteral(output, compactAddress(entity.wallet, 8, 8), walletAddressLink(entity.wallet, config, 8, 8));
    output = replaceLiteral(output, compactAddress(entity.wallet, 6, 6), walletAddressLink(entity.wallet, config, 6, 6));
  }

  if (entity.ca) {
    output = replaceLiteral(output, entity.ca, tokenAddressLink(entity.ca, config, 8, 8));
    output = replaceLiteral(output, compactAddress(entity.ca, 8, 8), tokenAddressLink(entity.ca, config, 8, 8));
    output = replaceLiteral(output, compactAddress(entity.ca, 6, 6), tokenAddressLink(entity.ca, config, 6, 6));
  }

  if (entity.wallet && entity.walletLabel) {
    output = replaceLiteral(output, entity.walletLabel, walletLink(entity.walletLabel, entity.wallet, config));
  }

  if (entity.ca && entity.symbol) {
    output = replaceLiteral(output, entity.symbol, tokenLink(entity.symbol, entity.ca, config));
  }

  return output;
}

function tokenLink(symbol, ca, config = {}) {
  const label = tokenLabel(symbol);
  const url = tokenUrl(ca, config);
  if (!url) return label;
  return `<a href="${escapeHtml(url)}">${label}</a>`;
}

function tokenAddressLink(ca, config = {}, head = 8, tail = 8) {
  const label = escapeHtml(compactAddress(ca, head, tail));
  const url = tokenUrl(ca, config);
  if (!url) return `<code>${label}</code>`;
  return `<a href="${escapeHtml(url)}">${label}</a>`;
}

function tokenLabel(symbol) {
  const text = String(symbol ?? '').trim();
  if (!text) return 'Unknown';
  return escapeHtml(text.startsWith('$') ? text : `$${text}`);
}

function walletLink(label, wallet, config = {}) {
  const text = escapeHtml(label || compactAddress(wallet, 6, 6));
  const url = walletUrl(wallet, config);
  if (!url) return text;
  return `<a href="${escapeHtml(url)}">${text}</a>`;
}

function walletAddressLink(wallet, config = {}, head = 8, tail = 8) {
  const label = escapeHtml(compactAddress(wallet, head, tail));
  const url = walletUrl(wallet, config);
  if (!url) return `<code>${label}</code>`;
  return `<a href="${escapeHtml(url)}">${label}</a>`;
}

function tokenUrl(ca, config = {}) {
  if (!ca) return '';
  const template = config.chartUrlTemplate || config.scanUrlTemplate || 'https://dexscreener.com/solana/{ca}';
  return linkFromTemplate(template, ca);
}

function walletUrl(wallet, config = {}) {
  if (!wallet) return '';
  const template = config.walletUrlTemplate || 'https://solscan.io/account/{wallet}';
  return template.replaceAll('{wallet}', encodeURIComponent(wallet));
}

function replaceLiteral(value, target, replacement) {
  const escapedTarget = escapeHtml(target);
  if (!escapedTarget || !replacement) return value;
  return value.replaceAll(escapedTarget, replacement);
}

function ageLabel(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'not yet';

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
