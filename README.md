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

This repo includes `render.yaml` for a Git-backed Render Background Worker. Render links to a GitHub/GitLab/Bitbucket branch and redeploys when you push to that branch.

1. Push this folder to a Git repo.
2. In Render, create a Blueprint from the repo.
3. Fill the secret env vars Render asks for:
   - `TELEGRAM_BOT_TOKEN`
   - `BACKUP_CHAT_ID`
   - `ADMIN_USER_IDS`
4. Keep `DATA_FILE=/var/data/radar-store.json` on Render. The Blueprint mounts a persistent disk at `/var/data`.

Background workers are the right fit for long-polling Telegram bots because they run continuously without needing inbound HTTP traffic.

## Private Telegram Backups

Send `/id` to the bot in a private DM. Use that numeric ID for:

```text
BACKUP_CHAT_ID=your_private_chat_id
ADMIN_USER_IDS=your_private_chat_id
```

Owner commands:

- `/backup` - DM a fresh JSON backup to `BACKUP_CHAT_ID`
- `/restore` - attach a backup JSON file in private chat with caption `/restore`
- `/id` - show your Telegram user/chat IDs

`ADMIN_USER_IDS` is still recommended for private restore. For backup, a Telegram admin in the group, supergroup, or channel can run `/backup` without being listed in `ADMIN_USER_IDS`; the backup still goes to `BACKUP_CHAT_ID`.

Backup shortcuts accepted:

- `/backup`
- `backup`
- `back up`
- `backup now`

In groups, Telegram may hide ordinary non-command messages from bots when BotFather privacy mode is enabled. Slash commands still work. For the bot to read loose text like `backup` and auto-scan pasted contracts, open BotFather, choose the bot, go to Bot Settings, Group Privacy, and turn privacy off.

Automatic backups run on start, shutdown, and once per `BACKUP_INTERVAL_MINUTES`. Unchanged backups are skipped by default so your private chat does not get noisy.

## Render Keepalive

The Render Blueprint runs this as a Background Worker. The bot also runs a lightweight heartbeat every `KEEPALIVE_INTERVAL_MINUTES` by calling Telegram `getMe`, so Render logs show the process is alive.

If you later deploy it as a web service, set `ENABLE_HEALTH_SERVER=true` and Render's `PORT` will serve `/health`. You can also set `KEEPALIVE_URL` if you want the bot to ping an external health URL.

## Commands

- `/start` - Open the main menu
- `/watchtoken CA` - Watch a token
- `/watchwallet walletaddress` - Watch a wallet
- `/new` - View filtered new pairs
- `/trending` - View trending tokens
- `/portfolio walletaddress` - Check a wallet summary
- `/myalerts` - Manage DM alert cadence
- `/mywatchlist` - View watched tokens and wallets
- `/groupsettings` - Admin-only group settings
- `/report` - Latest market report
- `/help` - Help menu
- `/backup` - Owner-only private backup
- `/restore` - Owner-only restore from backup document
- `/id` - Show chat/user IDs

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
