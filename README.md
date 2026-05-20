# $YOURCOIN Radar Bot

A clean Telegram bot scaffold for the Radar/Watchtower idea:

- DMs get detailed, user-controlled alerts.
- Groups get only filtered highlights and scheduled digests.
- Watches can be silent, instant, important-only, hourly, or daily.
- Buttons route users to scan, buy, chart, watch, or mute without cluttering chat.

The project has no npm dependencies. It uses Telegram's Bot API through Node's built-in `fetch` and stores state in a local JSON file.

## Quick Start

1. Create a Telegram bot with BotFather and copy the token.
2. Copy `.env.example` to `.env`.
3. Set `TELEGRAM_BOT_TOKEN`.
4. Run:

```powershell
npm start
```

Telegram bots can only DM users after those users have started the bot privately. Group alerts still work in groups where the bot is added, but personal DMs require `/start` in DM first.

## Render + Git Deploy

This repo includes `render.yaml` for a Git-backed Render Web Service. Render links to a GitHub/GitLab/Bitbucket branch and redeploys when you push to that branch.

1. Push this folder to a Git repo.
2. In Render, create a Blueprint from the repo.
3. Fill the secret env vars Render asks for:
   - `TELEGRAM_BOT_TOKEN`
   - `BACKUP_CHAT_ID` if you want backups sent to private DM
   - `ADMIN_USER_IDS` if you want private `/restore`
4. Keep the default `DATA_FILE=/tmp/yourcoin-radar/radar-store.json` unless you have a mounted Render disk. If you add a persistent disk later, point `DATA_FILE` at that mounted path.

The bot still uses Telegram long polling, but it also opens a small HTTP health server so Render Web Services see an open port and do not fail with `No open ports detected`.

## Social Footer

Bot messages include this footer by default:

```text
Powered by Ogres
Telegram | Website | Twitter
```

Default links:

```text
SOCIAL_TELEGRAM_URL=https://t.me/ogrecoinonsol
SOCIAL_WEBSITE_URL=https://ogremode.com/
SOCIAL_TWITTER_URL=https://twitter.com/i/communities/1930265213917425858
```

Set `SOCIAL_FOOTER_ENABLED=false` to turn it off.

## Private Telegram Backups

Send `/id` to the bot in a private DM. Use that numeric ID for:

```text
BACKUP_CHAT_ID=your_private_chat_id
ADMIN_USER_IDS=your_private_chat_id
```

Backup and restore commands:

- `/backup` - Admin-only backup
- `/restore` - attach a backup JSON file in private chat with caption `/restore`
- `/id` - show your Telegram user/chat IDs

`ADMIN_USER_IDS` is not needed for private channel/group backups. A Telegram admin in a private group, private supergroup, or private channel can run `/backup` without being listed in `ADMIN_USER_IDS`. Public chats with a public `@username` are blocked from creating backups. If `BACKUP_CHAT_ID` is blank, the backup file is posted back into the same private chat where `/backup` was run.

Backup shortcuts accepted:

- `/backup`
- `backup`
- `back up`
- `backup now`

In groups, Telegram may hide ordinary non-command messages from bots when BotFather privacy mode is enabled. Slash commands still work. For the bot to read loose text like `backup` and auto-scan pasted contracts, open BotFather, choose the bot, go to Bot Settings, Group Privacy, and turn privacy off.

The bot auto-registers commands on startup and when Telegram sends a bot membership update after it is added or promoted. Channels get their own channel-scoped command set when Telegram accepts it. Even if Telegram does not show a command menu in a channel, typed commands still work.

Automatic backups run on start, shutdown, and once per `BACKUP_INTERVAL_MINUTES`. Unchanged backups are skipped by default so your private chat does not get noisy.

## Render Keepalive

The Render Blueprint runs this as a Web Service and binds to `0.0.0.0:$PORT`. The bot serves `/health`, `/healthz`, and `/ready`.

The bot also runs a lightweight heartbeat every `KEEPALIVE_INTERVAL_MINUTES`, 10 minutes by default. It calls Telegram `getMe` and pings `KEEPALIVE_URL`; on Render Web Services, `KEEPALIVE_URL` automatically falls back to `RENDER_EXTERNAL_URL`, which helps keep the service active during quiet periods.

`RESET_TELEGRAM_OFFSET_ON_START=true` is enabled by default so a stale saved Telegram update offset cannot make the bot look online while ignoring new DMs or group commands.

On Render, the default data file is `/tmp/yourcoin-radar/radar-store.json` because that path is writable on Web Services. If `DATA_FILE` is accidentally left as `/var/data/radar-store.json`, the bot rewrites it to `/tmp/yourcoin-radar/radar-store.json` unless `ALLOW_VAR_DATA_FILE=true`. Startup logs print the exact data file path the bot is using.

## User Commands

- `/start` - Open the main menu
- `/watchtoken CA` - Watch a token
- `/watchwallet walletaddress` - Watch a wallet
- `/new` - View filtered new pairs
- `/trending` - View trending tokens
- `/portfolio walletaddress` - Check a wallet summary
- `/myalerts` - Manage DM alert cadence
- `/mywatchlist` - View watched tokens and wallets
- `/report` - Latest market report
- `/help` - Help menu
- `/id` - Show chat/user IDs
- `/ping` - Test bot status

## Admin Commands

- `/groupsettings` - Admin-only group settings
- `/backup` - Admin-only backup in private chats only
- `/commands` - Refresh command menu
- `/restore` - Owner-only restore from backup document

The bot registers public commands for everyone and admin commands for group/supergroup admins where Telegram supports admin command scopes. In channels, it registers a channel command set and also accepts plain command words like `ping`, `new`, `trending`, `report`, `groupsettings`, `commands`, and `backup`. Public channels/groups cannot create backups.

In DMs and groups, the bot also accepts exact plain command words like `ping`, `new`, `trending`, `report`, `commands`, and `backup`. In groups, Telegram only sends plain non-slash messages to bots when BotFather Group Privacy is off. Slash commands like `/ping` should still reach the bot even with privacy on.

## DM And Group Test

After deploy, DM the bot:

```text
/ping
```

Then try the same in the group:

```text
/ping
```

Render logs should show:

```text
[message] private:123 "/ping"
[message] group:-100123 "/ping"
```

If the DM log does not appear, the Render service is not polling Telegram, the token is wrong, or another running copy of the same bot token is stealing updates. If the group log appears but there is no reply, the bot is receiving the command but cannot post in that group.

## Channel Command Checklist

For a Telegram channel, add the bot as an admin and give it permission to post messages. Then create a new channel post with:

```text
/ping
```

or:

```text
ping
```

Render logs should show a line like:

```text
[message] channel:-100123 "/ping"
```

If that log does not appear, Telegram is not delivering channel posts to the bot. Remove and re-add the bot as channel admin, then run `/commands` or `commands` in the channel. If the log appears but the channel gets no reply, the bot is receiving messages but does not have permission to post in that channel.

## Default Alert Philosophy

User default: `Important Only`

Group default:

- Auto CA Scan: ON
- New Pair Alerts: OFF
- Whale Alerts: OFF
- Trending Digest: ON
- Daily Report: ON
- Cooldown: 10 minutes
- Quiet Hours: OFF

The bot tracks silently by default when needed, sends most details to DMs, and only posts group alerts when the event clears the group filter and cooldown rules.

## Anti-Spam Rules Included

- One group alert per token per cooldown window.
- One auto-scan per contract per group cooldown window.
- Personal alerts route to DM by default.
- Group settings require Telegram admin privileges.
- Milestones only fire at important market-cap moves.
- Muting is available from alert buttons.
- Hourly/daily digest queues are built in.
- Multi-wallet same-token alerts are represented as one combined event.

## Data Provider

`src/providers/mockSolanaProvider.js` returns deterministic demo data so the bot can run immediately. Replace that provider with real Solana sources such as Helius, Birdeye, DexScreener, Jupiter, or your own indexer.

The rest of the bot is already shaped around provider methods:

- `scanToken(ca)`
- `getNewPairs(filters)`
- `getTrending(kind)`
- `getPortfolio(wallet)`
- `getMarketReport()`
- `pollWatchedEvents(context)`

## Project Shape

```text
src/
  bot.js                         Telegram update router and commands
  index.js                       Runtime entrypoint
  config.js                      Environment config
  domain/
    alertEngine.js               DM/group routing, digests, alert formatting
    antiSpam.js                  Cooldowns, milestones, quiet hours
    defaults.js                  Defaults and alert modes
  providers/
    mockSolanaProvider.js        Swap this for live Solana data
  storage/
    jsonStore.js                 Local JSON persistence
  telegram/
    api.js                       Minimal Telegram Bot API client
  ui/
    keyboards.js                 Inline button builders
    messages.js                  Message templates
  utils/
    format.js                    Formatting helpers
    solana.js                    Address helpers
```
