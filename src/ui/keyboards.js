import { ALERT_MODES, NEW_PAIR_AGE_OPTIONS } from '../domain/defaults.js';
import { linkFromTemplate } from '../utils/format.js';

export function mainMenuKeyboard(options = {}) {
  const rows = [
    [callbackButton('Watch Token', 'menu:watchtoken'), callbackButton('Watch Wallet', 'menu:watchwallet')],
    [callbackButton('New Pairs', 'menu:new'), callbackButton('Trending', 'menu:trending')],
    [callbackButton('My Alerts', 'menu:alerts'), callbackButton('My Watchlist', 'menu:watchlist')],
    options.showAdmin
      ? [callbackButton('Group Settings', 'menu:groupsettings'), callbackButton('Daily Report', 'menu:report')]
      : [callbackButton('Daily Report', 'menu:report')]
  ];
  return inlineKeyboard(rows);
}

export function alertPrefsKeyboard(activeMode) {
  const rows = Object.entries(ALERT_MODES).map(([mode, config]) => {
    const marker = mode === activeMode ? '✓ ' : '';
    return [callbackButton(`${marker}${config.label}`, `alertmode:${mode}`)];
  });
  rows.push([callbackButton('Back', 'menu:start')]);
  return inlineKeyboard(rows);
}

export function tokenOptionsKeyboard(ca) {
  return inlineKeyboard([
    [callbackButton('Important Alerts', `wt:${ca}:important`)],
    [callbackButton('Price / MC Moves', `wt:${ca}:price`), callbackButton('Volume Spikes', `wt:${ca}:volume`)],
    [callbackButton('Whale Trades', `wt:${ca}:whales`), callbackButton('Liquidity Changes', `wt:${ca}:liquidity`)],
    [callbackButton('Holder Growth', `wt:${ca}:holders`), callbackButton('Silent Tracking', `wt:${ca}:silent`)]
  ]);
}

export function walletOptionsKeyboard(wallet) {
  return inlineKeyboard([
    [callbackButton('Important Trades Only', `ww:${wallet}:important`)],
    [callbackButton('Buys Only', `ww:${wallet}:buys`), callbackButton('Sells Only', `ww:${wallet}:sells`)],
    [callbackButton('All Trades', `ww:${wallet}:all`), callbackButton('Silent Tracking', `ww:${wallet}:silent`)]
  ]);
}

export function actionButtons(config, ca, options = {}) {
  const rows = [
    [
      urlButton('Scan', linkFromTemplate(config.scanUrlTemplate, ca)),
      urlButton('Buy', linkFromTemplate(config.buyUrlTemplate, ca)),
      urlButton('Chart', linkFromTemplate(config.chartUrlTemplate, ca))
    ]
  ];

  const callbacks = [];
  if (options.watch !== false) callbacks.push(callbackButton('Watch', `qw:${ca}`));
  if (options.mute !== false) callbacks.push(callbackButton('Mute', `mt:${ca}`));
  if (callbacks.length) rows.push(callbacks);

  return inlineKeyboard(rows);
}

export function newPairsKeyboard(activeAgeMinutes = 60) {
  const ageButtons = NEW_PAIR_AGE_OPTIONS.map((option) => {
    const marker = Number(activeAgeMinutes) === option.minutes ? '✓ ' : '';
    return callbackButton(`${marker}${option.label}`, `new:age:${option.minutes}`);
  });

  return inlineKeyboard([
    ageButtons.slice(0, 3),
    ageButtons.slice(3),
    [callbackButton('Refresh', 'new:refresh'), callbackButton('Filters', 'new:filters')],
    [callbackButton('Watch New Pairs', 'new:watch'), callbackButton('Back', 'menu:start')]
  ]);
}

export function trendingKeyboard() {
  return inlineKeyboard([
    [callbackButton('5m Movers', 'trending:5m'), callbackButton('1h Movers', 'trending:1h')],
    [callbackButton('24h Volume', 'trending:24h'), callbackButton('New Low Caps', 'trending:lowcaps')],
    [callbackButton('Most Bought', 'trending:bought'), callbackButton('Watched by Users', 'trending:watched')]
  ]);
}

export function groupSettingsKeyboard(group) {
  const s = group.settings;
  return inlineKeyboard([
    [callbackButton(`Auto CA Scan: ${onOff(s.autoCaScan)}`, 'group:toggle:autoCaScan')],
    [callbackButton(`Wallet Alerts: ${onOff(s.whaleAlerts)}`, 'group:toggle:whaleAlerts')],
    [callbackButton(`New Pair Alerts: ${onOff(s.newPairAlerts)}`, 'group:toggle:newPairAlerts')],
    [callbackButton(`Trending Digest: ${onOff(s.trendingDigest)}`, 'group:toggle:trendingDigest')],
    [callbackButton(`Daily Report: ${onOff(s.dailyReport)}`, 'group:toggle:dailyReport')],
    [callbackButton(`Quiet Hours: ${onOff(s.quietHours.enabled)}`, 'group:toggleQuiet')],
    [callbackButton('Cooldown', 'group:cooldown'), callbackButton('Save', 'group:save')]
  ]);
}

export function reportKeyboard() {
  return inlineKeyboard([
    [callbackButton('View Trending', 'trending:5m'), callbackButton('New Pairs', 'new:refresh')],
    [callbackButton('Watchlist', 'menu:watchlist')]
  ]);
}

function inlineKeyboard(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

function callbackButton(text, callbackData) {
  return { text, callback_data: callbackData };
}

function urlButton(text, url) {
  return { text, url };
}

function onOff(value) {
  return value ? 'ON' : 'OFF';
}
