import crypto from 'node:crypto';
import { escapeHtml } from '../utils/format.js';

export class BackupManager {
  constructor({ config, store, telegram }) {
    this.config = config;
    this.store = store;
    this.telegram = telegram;
    this.interval = null;
    this.lastBackupHash = '';
  }

  start() {
    if (this.config.backupOnStart) {
      setTimeout(() => {
        this.sendBackup('startup').catch((error) => console.warn('[startup-backup]', error.message));
      }, 1500);
    }

    if (this.config.backupIntervalMinutes > 0) {
      this.interval = setInterval(() => {
        this.sendBackup('scheduled').catch((error) => console.warn('[scheduled-backup]', error.message));
      }, this.config.backupIntervalMinutes * 60 * 1000);
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  isOwner(userId) {
    const value = String(userId ?? '');
    return this.config.adminUserIds.includes(value) || (!!this.config.backupChatId && this.config.backupChatId === value);
  }

  status() {
    return {
      configured: !!this.config.backupChatId,
      backupChatId: this.config.backupChatId,
      adminUserIds: this.config.adminUserIds,
      intervalMinutes: this.config.backupIntervalMinutes,
      skipUnchanged: this.config.backupSkipUnchanged,
      dataFile: this.store.filePath
    };
  }

  async sendBackup(reason = 'manual', options = {}) {
    const targetChatId = options.chatId ?? this.config.backupChatId;
    if (!targetChatId) {
      return {
        ok: false,
        skipped: true,
        reason: 'BACKUP_CHAT_ID is not configured.'
      };
    }

    const backup = this.buildBackup(reason);
    if (backup.buffer.byteLength > this.config.maxBackupBytes) {
      throw new Error(`Backup is ${backup.buffer.byteLength} bytes, above MAX_BACKUP_BYTES.`);
    }

    if (this.config.backupSkipUnchanged && !options.force && backup.hash === this.lastBackupHash) {
      return {
        ok: true,
        skipped: true,
        reason: 'Backup unchanged since last send.'
      };
    }

    const result = await this.telegram.sendDocument(targetChatId, {
      buffer: backup.buffer,
      filename: backup.filename,
      caption: [
        `🛰 <b>${escapeHtml(this.config.botName)} Backup</b>`,
        `Reason: <code>${escapeHtml(reason)}</code>`,
        `Created: <code>${escapeHtml(backup.createdAt)}</code>`
      ].join('\n')
    });

    this.lastBackupHash = backup.hash;
    return {
      ok: true,
      skipped: false,
      filename: backup.filename,
      bytes: backup.buffer.byteLength,
      telegramFileId: result.document?.file_id ?? ''
    };
  }

  buildBackup(reason) {
    this.store.save();

    const createdAt = new Date().toISOString();
    const payload = {
      format: 'yourcoin-radar-store-v1',
      createdAt,
      reason,
      botName: this.config.botName,
      renderServiceName: this.config.renderServiceName,
      data: this.store.data
    };

    const json = `${JSON.stringify(payload, null, 2)}\n`;
    const buffer = Buffer.from(json, 'utf8');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const stamp = createdAt.replaceAll(':', '-').replaceAll('.', '-');

    return {
      createdAt,
      hash,
      buffer,
      filename: `yourcoin-radar-backup-${stamp}.json`
    };
  }

  async restoreFromTelegramDocument(document) {
    if (!this.config.enableRestoreCommand) {
      throw new Error('Restore command is disabled.');
    }

    if (!document?.file_id) {
      throw new Error('No Telegram document was supplied.');
    }

    if (document.file_size && document.file_size > this.config.maxBackupBytes) {
      throw new Error(`Backup document is above MAX_BACKUP_BYTES (${this.config.maxBackupBytes}).`);
    }

    await this.sendBackup('pre-restore', { force: true }).catch((error) => {
      console.warn('[pre-restore-backup]', error.message);
    });

    const file = await this.telegram.getFile(document.file_id);
    const buffer = await this.telegram.fetchFile(file.file_path);
    const parsed = JSON.parse(buffer.toString('utf8'));
    this.store.replaceData(parsed);

    await this.sendBackup('post-restore', { force: true }).catch((error) => {
      console.warn('[post-restore-backup]', error.message);
    });

    return {
      ok: true,
      users: Object.keys(this.store.data.users).length,
      groups: Object.keys(this.store.data.groups).length
    };
  }
}
