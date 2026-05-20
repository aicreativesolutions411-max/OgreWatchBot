import { ALERT_MODES, NEW_PAIR_DEFAULT_FILTERS, TOKEN_ALERT_OPTIONS, WALLET_ALERT_OPTIONS } from '../domain/defaults.js';
import { compactAddress, escapeHtml, minutesAgo, percent, sol, usd } from '../utils/format.js';

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

export function askTokenOptionsMessage(ca) {
  return [
    '🛰 <b>Watch Token</b>',
    '',
    `Token: <code>${escapeHtml(ca)}</code>`,
    '',
    'What do you want to know about this token?'
  ].join('\n');
}

export function tokenWatchedMessage(ca, mode) {
  const label = TOKEN_ALERT_OPTIONS[mode] ?? ALERT_MODES[mode]?.label ?? mode;
  return [
    '✅ <b>Token Watch Added</b>',
    '',
    `Token: <code>${escapeHtml(ca)}</code>`,
    `Mode: <b>${escapeHtml(label)}</b>`,
    '',
    'Important events will route to DM unless your alert mode is silent or digest-only.'
  ].join('\n');
}

export function askWalletOptionsMessage(wallet) {
  return [
    '🐋 <b>Watch Wallet</b>',
    '',
    `Wallet: <code>${escapeHtml(wallet)}</code>`,
    '',
    'How should trades from this wallet be handled?'
  ].join('\n');
}

export function walletWatchedMessage(wallet, mode) {
  const label = WALLET_ALERT_OPTIONS[mode] ?? ALERT_MODES[mode]?.label ?? mode;
  return [
    '✅ <b>Wallet Watch Added</b>',
    '',
    `Wallet: <code>${escapeHtml(wallet)}</code>`,
    `Mode: <b>${escapeHtml(label)}</b>`,
    '',
    'Large trades, first buys, repeated buys, and multi-wallet activity are treated as important.'
  ].join('\n');
}

export function watchlistMessage(user) {
  const tokens = Object.keys(user.watchTokens);
  const wallets = Object.values(user.watchWallets);

  const lines = ['📌 <b>My Watchlist</b>', ''];
  lines.push('<b>Tokens</b>');
  lines.push(tokens.length ? tokens.map((ca, index) => `${index + 1}. <code>${escapeHtml(compactAddress(ca, 6, 6))}</code> - ${escapeHtml(user.watchTokens[ca].mode)}`).join('\n') : 'None yet.');
  lines.push('');
  lines.push('<b>Wallets</b>');
  lines.push(wallets.length ? wallets.map((watch, index) => `${index + 1}. ${escapeHtml(watch.label)} - <code>${escapeHtml(compactAddress(watch.wallet, 6, 6))}</code> - ${escapeHtml(watch.mode)}`).join('\n') : 'None yet.');

  return lines.join('\n');
}

export function groupSettingsMessage(group) {
  const s = group.settings;
  return [
    '⚙️ <b>Group Alert Settings</b>',
    '',
    `Auto CA Scan: <b>${onOff(s.autoCaScan)}</b>`,
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
    `🔎 <b>${escapeHtml(scan.symbol)} Scan</b>`,
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

export function newPairsMessage(pairs, status = null) {
  const lines = ['🆕 <b>New Solana Pairs</b>', ''];
  lines.push(...marketStatusLines(status));
  if (status) lines.push('');
  pairs.forEach((pair, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(pair.symbol)}</b> - ${minutesAgo(pair.ageMinutes)} - ${usd(pair.marketCapUsd)} MC - ${usd(pair.liquidityUsd)} liq`);
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

export function trendingMessage(tokens, label = 'Trending', status = null) {
  const lines = [`🔥 <b>${escapeHtml(label)}</b>`, ''];
  lines.push(...marketStatusLines(status));
  if (status) lines.push('');
  tokens.forEach((token, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(token.symbol)}</b> ${percent(token.movePercent)} - ${escapeHtml(token.reason)}`);
  });
  return lines.join('\n');
}

export function portfolioMessage(summary) {
  return [
    '👛 <b>Wallet Summary</b>',
    '',
    `Wallet: <code>${escapeHtml(compactAddress(summary.wallet, 8, 8))}</code>`,
    `SOL balance: <b>${sol(summary.solBalance)}</b>`,
    `Tokens held: <b>${summary.tokensHeld}</b>`,
    `Estimated value: <b>${usd(summary.estimatedValueUsd)}</b>`,
    '',
    `Recent buys: <b>${summary.recentBuys}</b>`,
    `Recent sells: <b>${summary.recentSells}</b>`,
    `Biggest current bag: <b>${escapeHtml(summary.biggestBag)}</b>`,
    `Best recent trade: <b>${escapeHtml(summary.bestRecentTrade)}</b>`,
    `Worst recent trade: <b>${escapeHtml(summary.worstRecentTrade)}</b>`
  ].join('\n');
}

export function marketReportMessage(report, config, status = null) {
  const lines = [`🛰 <b>Solana Radar Update by ${escapeHtml(config.brand)}</b>`, ''];
  lines.push(...marketStatusLines(status));
  if (status) lines.push('');
  lines.push('<b>Top watched tokens</b>');
  report.topTokens.forEach((token, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(token.symbol)}</b> ${percent(token.movePercent)} - ${escapeHtml(token.reason)}`);
  });
  lines.push('');
  lines.push('<b>New pairs worth watching</b>');
  report.newPairs.forEach((pair, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(pair.symbol)}</b> - ${usd(pair.liquidityUsd)} liq - ${minutesAgo(pair.ageMinutes)}`);
  });
  return lines.join('\n');
}

export function walletAlertMessage(alert, config) {
  return [
    '🐋 <b>Wallet Alert</b>',
    '',
    `${escapeHtml(alert.walletLabel)} ${escapeHtml(alert.side)} <b>${escapeHtml(alert.symbol)}</b>`,
    `Amount: <b>${sol(alert.solAmount)}</b>`,
    `Market Cap: <b>${usd(alert.marketCapUsd)}</b>`,
    `Liquidity: <b>${usd(alert.liquidityUsd)}</b>`,
    '',
    `Reason sent: ${escapeHtml(alert.reason)}`,
  ].join('\n');
}

export function groupActivitySpikeMessage(alert, config) {
  return [
    `🚨 <b>${escapeHtml(alert.symbol)} Activity Spike</b>`,
    '',
    `${alert.walletCount} watched wallets bought in ${alert.timeframeMinutes} minutes`,
    `Total: <b>${sol(alert.totalSol)}</b>`,
    `MC: <b>${usd(alert.marketCapBeforeUsd)} → ${usd(alert.marketCapAfterUsd)}</b>`,
    `Volume 5m: <b>${usd(alert.volume5mUsd)}</b>`,
  ].join('\n');
}

export function tokenMilestoneMessage(alert, config) {
  return [
    `📈 <b>${escapeHtml(alert.symbol)} Milestone</b>`,
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
    `<b>${escapeHtml(alert.symbol)}</b> liquidity changed`,
    `Before: <b>${usd(alert.beforeUsd)}</b>`,
    `Now: <b>${usd(alert.afterUsd)}</b>`,
    `Change: <b>${percent(alert.changePercent)}</b>`,
  ].join('\n');
}

export function digestMessage(alerts, config) {
  const lines = [`🛰 <b>${escapeHtml(config.botName)} Summary</b>`, ''];
  alerts.slice(0, 10).forEach((alert, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(alert.title)}</b> - ${escapeHtml(alert.summary)}`);
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

function marketStatusLines(status) {
  if (!status) return [];
  const lines = [`Data: <b>${escapeHtml(status.source ?? 'Market')}</b> - updated <b>${escapeHtml(ageLabel(status.refreshedAt))}</b>`];
  if (status.error) lines.push(`Last refresh error: <code>${escapeHtml(status.error)}</code>`);
  return lines;
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
