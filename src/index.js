import { pathToFileURL } from 'node:url';
import { config, requireBotToken } from './config.js';
import { RadarBot } from './bot.js';
import { AlertEngine } from './domain/alertEngine.js';
import { MockSolanaProvider } from './providers/mockSolanaProvider.js';
import { BackupManager } from './services/backupManager.js';
import { KeepAliveService } from './services/keepAliveService.js';
import { JsonStore } from './storage/jsonStore.js';
import { TelegramApi } from './telegram/api.js';

export async function main() {
  requireBotToken(config);

  const store = new JsonStore(config.dataFile);
  const telegram = new TelegramApi(config.telegramToken);
  const provider = new MockSolanaProvider(config);
  const backupManager = new BackupManager({ config, store, telegram });
  const keepAliveService = new KeepAliveService({ config, telegram });
  const alertEngine = new AlertEngine({ config, store, telegram, provider });

  const bot = new RadarBot({ config, store, telegram, provider, alertEngine, backupManager });
  installShutdownHooks({ config, bot, backupManager, keepAliveService });
  backupManager.start();
  keepAliveService.start();
  await bot.start();
}

function installShutdownHooks({ config: appConfig, bot, backupManager, keepAliveService }) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received.`);
    bot.stop();
    keepAliveService.stop();

    if (appConfig.backupOnShutdown) {
      await backupManager.sendBackup(`shutdown:${signal}`, {
        force: true
      }).catch((error) => console.warn('[shutdown-backup]', error.message));
    }

    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (isEntrypoint()) {
  main().catch((error) => {
    console.error('[fatal]', error);
    process.exitCode = 1;
  });
}

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
