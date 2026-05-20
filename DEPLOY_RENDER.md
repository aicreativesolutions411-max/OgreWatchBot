# Deploy on Render with Git

This bot is designed to run as a Render Background Worker from a Git repo.

## 1. Push to Git

```powershell
git init
git add .
git commit -m "Initial Radar bot"
git branch -M main
git remote add origin https://github.com/YOURNAME/yourcoin-radar-bot.git
git push -u origin main
```

## 2. Create the Render service

Use the Render Dashboard:

1. New + Blueprint
2. Select the Git repo
3. Use the root `render.yaml`
4. Fill the secret env vars when prompted

Required secrets:

```text
TELEGRAM_BOT_TOKEN=your_botfather_token
BACKUP_CHAT_ID=your_private_telegram_user_id
ADMIN_USER_IDS=your_private_telegram_user_id
```

Send `/id` to the bot in private chat to get your numeric ID. `ADMIN_USER_IDS` is still recommended for private `/restore`, but group/supergroup/channel admins can run `/backup` without being listed.

## 3. Why this uses a worker

Telegram long polling does not need public HTTP traffic. A Render Background Worker keeps the bot process alive and lets it poll Telegram continuously.

The Blueprint also mounts a persistent disk:

```text
/var/data/radar-store.json
```

Telegram backups are still enabled because Render filesystems outside the disk are ephemeral, and backups give you an off-Render recovery copy in your private chat.

## 4. Backup and restore

Owner-only commands:

```text
/backup
/restore
/id
```

To restore, send a backup JSON file to the bot in private chat with the caption:

```text
/restore
```

Before restoring, the bot tries to send a `pre-restore` backup to your backup chat.

## 5. Message reading in groups/channels

The bot listens for both normal messages and channel posts. It accepts:

```text
/backup
backup
back up
backup now
```

Telegram privacy mode can still hide loose text from bots in groups. If you want the bot to read plain `backup` messages and auto-scan contract addresses, disable Group Privacy in BotFather:

```text
BotFather -> your bot -> Bot Settings -> Group Privacy -> Turn off
```

Slash commands like `/backup` are the most reliable option when privacy mode is on.

## 6. Render keepalive

The bot runs a keepalive heartbeat every 5 minutes by default:

```text
KEEPALIVE_INTERVAL_MINUTES=5
```

It calls Telegram `getMe` and logs success. If you later deploy as a Render Web Service instead of a Background Worker, set:

```text
ENABLE_HEALTH_SERVER=true
```

Then `/health` will respond on Render's `PORT`.
