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
4. Keep `DATA_FILE=/var/data/radar-store.json` on Render. The Blueprint mounts a persistent disk at `/var/data`.

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

The bot auto-registers commands on startup and when Telegram sends a bot membership update after it is added or promoted. Telegram supports command scopes for private chats, groups, supergroups, and chat administrators; private channel posts still respond to `/backup` when the bot is admin, but Telegram does not expose a per-channel command menu scope.

Automatic backups run on start, shutdown, and once per `BACKUP_INTERVAL_MINUTES`. Unchanged backups are skipped by default so your private chat does not get noisy.

## Render Keepalive

The Render Blueprint runs this as a Web Service and binds to `0.0.0.0:$PORT`. The bot serves `/health`, `/healthz`, and `/ready`.

The bot also runs a lightweight heartbeat every `KEEPALIVE_INTERVAL_MINUTES`, 10 minutes by default. It calls Telegram `getMe` and pings `KEEPALIVE_URL`; on Render Web Services, `KEEPALIVE_URL` automatically falls back to `RENDER_EXTERNAL_URL`, which helps keep the service active during quiet periods.

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

## Admin Commands

- `/groupsettings` - Admin-only group settings
- `/backup` - Admin-only backup in private chats only
- `/commands` - Refresh command menu
- `/restore` - Owner-only restore from backup document

The bot registers public commands for everyone and admin commands for group/supergroup admins where Telegram supports admin command scopes. In channels, Telegram does not support per-channel admin command menus, but admin commands still work when typed by a private-channel admin. Public channels/groups cannot create backups.

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
