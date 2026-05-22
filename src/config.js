import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

loadEnvFile(path.join(projectRoot, '.env'));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function listFromEnv(name) {
  return String(process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

const defaultHealthServerEnabled = !!process.env.PORT || process.env.RENDER === 'true';
const defaultRenderDataFile = '/tmp/yourcoin-radar/radar-store.json';
const requestedDataFile = firstNonEmpty(process.env.DATA_FILE, './data/radar-store.json');
const resolvedDataFile = resolveDataFile(requestedDataFile);

export const config = {
  projectRoot,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  botName: process.env.BOT_NAME ?? 'Ogres Radar',
  brand: process.env.BRAND ?? 'Ogres',
  dataProvider: process.env.DATA_PROVIDER ?? 'dexscreener',
  requestedDataFile,
  dataFile: resolvedDataFile,
  dataFallbackFile: resolveDataFile(firstNonEmpty(process.env.DATA_FALLBACK_FILE, defaultRenderDataFile)),
  dataFileWasRewritten: normalizePath(requestedDataFile).startsWith('/var/data') && !booleanFromEnv('ALLOW_VAR_DATA_FILE', false),
  scanUrlTemplate: process.env.SCAN_URL_TEMPLATE ?? 'https://dexscreener.com/solana/{ca}',
  buyUrlTemplate: process.env.BUY_URL_TEMPLATE ?? 'https://jup.ag/swap/SOL-{ca}',
  chartUrlTemplate: process.env.CHART_URL_TEMPLATE ?? 'https://dexscreener.com/solana/{ca}',
  walletUrlTemplate: process.env.WALLET_URL_TEMPLATE ?? 'https://solscan.io/account/{wallet}',
  socialFooterEnabled: booleanFromEnv('SOCIAL_FOOTER_ENABLED', true),
  socialFooterTitle: process.env.SOCIAL_FOOTER_TITLE ?? 'Powered by Ogres',
  socialTelegramUrl: process.env.SOCIAL_TELEGRAM_URL ?? 'https://t.me/ogrecoinonsol',
  socialWebsiteUrl: process.env.SOCIAL_WEBSITE_URL ?? 'https://ogremode.com/',
  socialTwitterUrl: process.env.SOCIAL_TWITTER_URL ?? 'https://twitter.com/i/communities/1930265213917425858',
  pollTimeoutSeconds: numberFromEnv('POLL_TIMEOUT_SECONDS', 30),
  alertTickSeconds: numberFromEnv('ALERT_TICK_SECONDS', 30),
  commandGateMessages: numberFromEnv('COMMAND_GATE_MESSAGES', 10),
  panelReuseMinutes: numberFromEnv('PANEL_REUSE_MINUTES', 60),
  enableAutoCaScan: booleanFromEnv('ENABLE_AUTO_CA_SCAN', false),
  enableImmediateGroupAlerts: booleanFromEnv('ENABLE_IMMEDIATE_GROUP_ALERTS', false),
  marketRefreshIntervalSeconds: numberFromEnv('MARKET_REFRESH_INTERVAL_SECONDS', 60),
  dexScreenerApiBase: process.env.DEXSCREENER_API_BASE ?? 'https://api.dexscreener.com',
  dexScreenerSearchQueries: listFromEnv('DEXSCREENER_SEARCH_QUERIES'),
  dexScreenerMaxTokens: numberFromEnv('DEXSCREENER_MAX_TOKENS', 120),
  newPairDefaultAgeMinutes: numberFromEnv('NEW_PAIR_DEFAULT_AGE_MINUTES', 60),
  newPairMinLiquidityUsd: numberFromEnv('NEW_PAIR_MIN_LIQUIDITY_USD', 5_000),
  newPairFreshMinLiquidityUsd: numberFromEnv('NEW_PAIR_FRESH_MIN_LIQUIDITY_USD', 2_500),
  newPairFreshMinVolumeUsd: numberFromEnv('NEW_PAIR_FRESH_MIN_VOLUME_USD', 8_000),
  marketQualityFilterEnabled: booleanFromEnv('MARKET_QUALITY_FILTER_ENABLED', true),
  marketQualityMinScore: numberFromEnv('MARKET_QUALITY_MIN_SCORE', 62),
  marketQualityFreshMinLiquidityUsd: numberFromEnv('MARKET_QUALITY_FRESH_MIN_LIQUIDITY_USD', 2_500),
  solanaTrackerApiKey: process.env.SOLANA_TRACKER_API_KEY ?? '',
  solanaTrackerApiBase: process.env.SOLANA_TRACKER_API_BASE ?? 'https://data.solanatracker.io',
  solanaTrackerRiskEnabled: booleanFromEnv('SOLANA_TRACKER_RISK_ENABLED', true),
  solanaTrackerMaxRiskScore: numberFromEnv('SOLANA_TRACKER_MAX_RISK_SCORE', 7),
  groupDigestMinutes: numberFromEnv('GROUP_DIGEST_MINUTES', 60),
  userHourlyDigestMinutes: numberFromEnv('USER_HOURLY_DIGEST_MINUTES', 60),
  userDailyDigestHour: numberFromEnv('USER_DAILY_DIGEST_HOUR', 9),
  deleteWebhookOnStart: booleanFromEnv('DELETE_WEBHOOK_ON_START', true),
  dropPendingUpdatesOnStart: booleanFromEnv('DROP_PENDING_UPDATES_ON_START', false),
  resetTelegramOffsetOnStart: booleanFromEnv('RESET_TELEGRAM_OFFSET_ON_START', true),
  backupChatId: process.env.BACKUP_CHAT_ID ?? '',
  adminUserIds: listFromEnv('ADMIN_USER_IDS'),
  allowChatAdminBackup: booleanFromEnv('ALLOW_CHAT_ADMIN_BACKUP', true),
  backupAllowPublicChats: booleanFromEnv('BACKUP_ALLOW_PUBLIC_CHATS', false),
  backupIntervalMinutes: numberFromEnv('BACKUP_INTERVAL_MINUTES', 1440),
  backupOnStart: booleanFromEnv('BACKUP_ON_START', true),
  backupOnShutdown: booleanFromEnv('BACKUP_ON_SHUTDOWN', true),
  backupSkipUnchanged: booleanFromEnv('BACKUP_SKIP_UNCHANGED', true),
  enableRestoreCommand: booleanFromEnv('ENABLE_RESTORE_COMMAND', true),
  maxBackupBytes: numberFromEnv('MAX_BACKUP_BYTES', 45_000_000),
  keepAliveIntervalMinutes: numberFromEnv('KEEPALIVE_INTERVAL_MINUTES', 10),
  keepAliveUrl: firstNonEmpty(process.env.KEEPALIVE_URL, process.env.RENDER_EXTERNAL_URL),
  enableHealthServer: booleanFromEnv('ENABLE_HEALTH_SERVER', defaultHealthServerEnabled),
  healthHost: process.env.HEALTH_HOST ?? '0.0.0.0',
  healthPort: numberFromEnv('PORT', 10000),
  renderExternalUrl: firstNonEmpty(process.env.RENDER_EXTERNAL_URL),
  renderServiceName: process.env.RENDER_SERVICE_NAME ?? process.env.RENDER_SERVICE_ID ?? '',
  enableDemoCommands: booleanFromEnv('ENABLE_DEMO_COMMANDS', false)
};

export function requireBotToken(appConfig) {
  if (!appConfig.telegramToken) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and set your BotFather token.');
  }
}

function resolveDataFile(filePath) {
  const normalized = normalizePath(filePath);
  const safePath = normalized.startsWith('/var/data') && !booleanFromEnv('ALLOW_VAR_DATA_FILE', false)
    ? defaultRenderDataFile
    : filePath;

  return path.isAbsolute(safePath) ? safePath : path.resolve(projectRoot, safePath);
}

function normalizePath(filePath) {
  return String(filePath ?? '').replaceAll('\\', '/');
}
