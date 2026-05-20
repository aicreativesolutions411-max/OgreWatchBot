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

export const config = {
  projectRoot,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  botName: process.env.BOT_NAME ?? '$YOURCOIN Radar',
  brand: process.env.BRAND ?? '$YOURCOIN',
  dataProvider: process.env.DATA_PROVIDER ?? 'mock',
  dataFile: path.resolve(projectRoot, process.env.DATA_FILE ?? './data/radar-store.json'),
  scanUrlTemplate: process.env.SCAN_URL_TEMPLATE ?? 'https://dexscreener.com/solana/{ca}',
  buyUrlTemplate: process.env.BUY_URL_TEMPLATE ?? 'https://jup.ag/swap/SOL-{ca}',
  chartUrlTemplate: process.env.CHART_URL_TEMPLATE ?? 'https://dexscreener.com/solana/{ca}',
  pollTimeoutSeconds: numberFromEnv('POLL_TIMEOUT_SECONDS', 30),
  alertTickSeconds: numberFromEnv('ALERT_TICK_SECONDS', 30),
  groupDigestMinutes: numberFromEnv('GROUP_DIGEST_MINUTES', 60),
  userHourlyDigestMinutes: numberFromEnv('USER_HOURLY_DIGEST_MINUTES', 60),
  userDailyDigestHour: numberFromEnv('USER_DAILY_DIGEST_HOUR', 9),
  backupChatId: process.env.BACKUP_CHAT_ID ?? '',
  adminUserIds: listFromEnv('ADMIN_USER_IDS'),
  allowChatAdminBackup: booleanFromEnv('ALLOW_CHAT_ADMIN_BACKUP', true),
  backupIntervalMinutes: numberFromEnv('BACKUP_INTERVAL_MINUTES', 1440),
  backupOnStart: booleanFromEnv('BACKUP_ON_START', true),
  backupOnShutdown: booleanFromEnv('BACKUP_ON_SHUTDOWN', true),
  backupSkipUnchanged: booleanFromEnv('BACKUP_SKIP_UNCHANGED', true),
  enableRestoreCommand: booleanFromEnv('ENABLE_RESTORE_COMMAND', true),
  maxBackupBytes: numberFromEnv('MAX_BACKUP_BYTES', 45_000_000),
  keepAliveIntervalMinutes: numberFromEnv('KEEPALIVE_INTERVAL_MINUTES', 5),
  keepAliveUrl: process.env.KEEPALIVE_URL ?? '',
  enableHealthServer: booleanFromEnv('ENABLE_HEALTH_SERVER', false),
  healthHost: process.env.HEALTH_HOST ?? '0.0.0.0',
  healthPort: numberFromEnv('PORT', 0),
  renderServiceName: process.env.RENDER_SERVICE_NAME ?? process.env.RENDER_SERVICE_ID ?? '',
  enableDemoCommands: booleanFromEnv('ENABLE_DEMO_COMMANDS', false)
};

export function requireBotToken(appConfig) {
  if (!appConfig.telegramToken) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and set your BotFather token.');
  }
}
