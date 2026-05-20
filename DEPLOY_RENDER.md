# Deploy on Render with Git

This bot is designed to run as a Render Web Service from a Git repo.

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
BACKUP_CHAT_ID=optional_private_telegram_user_id
ADMIN_USER_IDS=optional_private_restore_owner_id
```

Send `/id` to the bot in private chat to get your numeric ID if you want private DM backups or private `/restore`. Private group/supergroup/channel admins can run `/backup` without being listed. Public chats with a public `@username` are blocked from creating backups. If `BACKUP_CHAT_ID` is empty, `/backup` posts the backup file to the same private chat where the command was run.

The Ogres social footer is included in `render.yaml`:

```text
SOCIAL_FOOTER_ENABLED=true
SOCIAL_FOOTER_TITLE=Powered by Ogres
SOCIAL_TELEGRAM_URL=https://t.me/ogrecoinonsol
SOCIAL_WEBSITE_URL=https://ogremode.com/
SOCIAL_TWITTER_URL=https://twitter.com/i/communities/1930265213917425858
```

## 3. Why this uses a web service

Telegram long polling does not need public HTTP traffic, but Render Web Services require an open HTTP port. This bot opens a small health server on `0.0.0.0:$PORT`, so Render deploys cleanly and `/health` returns 200.

The Blueprint also mounts a persistent disk:

```text
/var/data/radar-store.json
```

Telegram backups are still enabled because Render filesystems outside the disk are ephemeral, and backups give you an off-Render recovery copy in your private chat.

## 4. User vs admin commands

Public user commands are registered for everyone:

```text
/start
/watchtoken
/watchwallet
/new
/trending
/portfolio
/myalerts
/mywatchlist
/report
/help
/id
/ping
```

Admin commands are registered for chat admins where Telegram supports admin command scopes:

```text
/groupsettings
/backup
/commands
/restore
```

In channels, the bot registers a channel command set when Telegram accepts the channel scope. Typed commands still work either way.

## 5. Backup and restore

To restore, send a backup JSON file to the bot in private chat with the caption:

```text
/restore
```

Before restoring, the bot tries to send a `pre-restore` backup to your backup chat.

## 6. Message reading in groups/channels

The bot listens for normal messages, edited messages, channel posts, and edited channel posts. It accepts:

```text
/ping
ping
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

The bot registers commands on startup and again when it receives Telegram's bot membership update after being added or promoted. Telegram command menu scopes work for private chats, groups, supergroups, chat administrators, and channel chat scopes when Telegram accepts them. Private channels can run `/backup` or plain `backup`. Public chats cannot create backups.

For channels, the bot must be an admin with permission to post messages. Test with `/ping` or plain `ping` as a new channel post. If Render logs show `[message] channel:...` but the channel gets no reply, the bot can read the post but cannot post back. If no `[message] channel:...` log appears, remove and re-add the bot as channel admin, then run `/commands` or `commands`.

For DMs and groups, test with `/ping` first. Render logs should show `[message] private:... "/ping"` or `[message] group:... "/ping"`. If DMs do not show up in logs, check that `TELEGRAM_BOT_TOKEN` is the exact token for the bot you are messaging and that no other local/Render copy is running the same token. Telegram will usually log a polling conflict when two copies are running.

## 7. Render keepalive

The bot runs a keepalive heartbeat every 10 minutes by default:

```text
KEEPALIVE_INTERVAL_MINUTES=10
```

It calls Telegram `getMe`, serves `/health`, and pings `KEEPALIVE_URL`. On Render Web Services, `KEEPALIVE_URL` automatically falls back to Render's `RENDER_EXTERNAL_URL`.

```text
ENABLE_HEALTH_SERVER=true
RESET_TELEGRAM_OFFSET_ON_START=true
```

Then `/health` will respond on Render's `PORT`.
