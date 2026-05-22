# $YOURCOIN Radar Bot

A clean Telegram bot scaffold for the Radar/Watchtower idea:

- DMs get detailed, user-controlled alerts.
- Groups get only filtered highlights and scheduled digests.
- Watches can be silent, instant, important-only, hourly, or daily.
- Buttons route users through Find Alpha, Token Deep Dive, Wallet Intel, Top Calls, alerts, scan, buy, chart, watch, or mute without cluttering chat.
- Alpha views include Top Calls, filtered new pairs, trending, most-bought pressure, high-volume setups, low-cap gems, and clean paid boosts.

The project has no npm dependencies. It uses Telegram's Bot API and DEX Screener's public API through Node's built-in `fetch`, then stores state in a local JSON file.

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

## Link Templates

Ticker text links to DexScreener by default, and wallet text links to Solscan:

```text
CHART_URL_TEMPLATE=https://dexscreener.com/solana/{ca}
WALLET_URL_TEMPLATE=https://solscan.io/account/{wallet}
```

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

Backup command:

- `/backup`

In groups, Telegram may hide ordinary non-command messages from bots when BotFather privacy mode is enabled. Slash commands still work. Auto-scan of pasted contracts needs BotFather Group Privacy turned off, but auto-scan is disabled by default to avoid spam.

The bot auto-registers commands on startup and when Telegram sends a bot membership update after it is added or promoted. Channels get their own channel-scoped command set when Telegram accepts it. Even if Telegram does not show a command menu in a channel, typed commands still work.

Automatic backups run on start, shutdown, and once per `BACKUP_INTERVAL_MINUTES`. Unchanged backups are skipped by default so your private chat does not get noisy.

## Render Keepalive

The Render Blueprint runs this as a Web Service and binds to `0.0.0.0:$PORT`. The bot serves `/health`, `/healthz`, and `/ready`.

The bot also runs a lightweight heartbeat every `KEEPALIVE_INTERVAL_MINUTES`, 10 minutes by default. It calls Telegram `getMe` and pings `KEEPALIVE_URL`; on Render Web Services, `KEEPALIVE_URL` automatically falls back to `RENDER_EXTERNAL_URL`, which helps keep the service active during quiet periods.

`RESET_TELEGRAM_OFFSET_ON_START=true` is enabled by default so a stale saved Telegram update offset cannot make the bot look online while ignoring new DMs or group commands.

On Render, the default data file is `/tmp/yourcoin-radar/radar-store.json` because that path is writable on Web Services. If `DATA_FILE` is accidentally left as `/var/data/radar-store.json`, the bot rewrites it to `/tmp/yourcoin-radar/radar-store.json` unless `ALLOW_VAR_DATA_FILE=true`. Startup logs print the exact data file path the bot is using.

## Live Market Refresh

Render defaults to live market data:

```text
DATA_PROVIDER=dexscreener
MARKET_REFRESH_INTERVAL_SECONDS=60
DEXSCREENER_API_BASE=https://api.dexscreener.com
DEXSCREENER_SEARCH_QUERIES=SOL/USDC,SOL,pump,pumpfun,raydium,meteora,moonshot,bonk
DEXSCREENER_MAX_TOKENS=120
```

The bot refreshes DEX Screener data silently in the background every minute. It does not post each refresh. Commands like `/new`, `/trending`, `/report`, and token scans read from the latest cache. If the API is temporarily unavailable, the bot keeps running and falls back to mock data instead of hanging commands.

## Quality And Rug Filter

The bot scores live pairs before showing them in `/new`, `/trending`, market reports, and hourly group digests. It prefers pairs with healthier liquidity, active but not absurd volume, buy pressure, sane liquidity/market-cap ratio, and momentum that has not already gone vertical. It blocks obvious bad shapes such as heavy sell pressure, no-sell buy spikes, extreme volume/liquidity noise, very thin liquidity, and bundle/snipe-like launch bursts.

```text
NEW_PAIR_DEFAULT_AGE_MINUTES=60
NEW_PAIR_MIN_LIQUIDITY_USD=5000
NEW_PAIR_FRESH_MIN_LIQUIDITY_USD=2500
NEW_PAIR_FRESH_MIN_VOLUME_USD=8000
MARKET_QUALITY_FILTER_ENABLED=true
MARKET_QUALITY_MIN_SCORE=62
MARKET_QUALITY_FRESH_MIN_LIQUIDITY_USD=2500
```

The `/new` screen defaults to pairs under 1 hour old and includes buttons for `10m`, `30m`, `1h`, `6h`, `12h`, and `1d`. The hourly group digest only uses the 1-hour new-pair window. Under-1-hour pairs can pass with lower liquidity when buys, market-cap movement, activity, and liquidity/MC ratio look strong enough. Posted token rows show market cap and liquidity first; volume is used only as a hidden scoring input.

Older pairs are kept out of trending lists unless they are actually spiking, for example strong buy pressure plus market-cap movement. That keeps stale high-volume coins from crowding the feed.

Hourly group updates are ranked as watcher picks: the bot combines fresh pairs, short-term momentum, and 24h setup data, removes duplicates, and posts only the strongest setups with market cap, liquidity, age, source, and a plain-English setup label.

For deeper risk checks, add a Solana Tracker Data API key. Without a key, the bot still uses DexScreener-based heuristics. With a key, it also blocks rugged tokens, high risk scores, danger flags, bundler/insider warnings, mint/freeze authority risks, and other Rugcheck-style signals returned by Solana Tracker.

```text
SOLANA_TRACKER_API_KEY=
SOLANA_TRACKER_RISK_ENABLED=true
SOLANA_TRACKER_MAX_RISK_SCORE=7
```

Group command/button spam is gated by message flow:

```text
COMMAND_GATE_MESSAGES=10
PANEL_REUSE_MINUTES=60
ENABLE_AUTO_CA_SCAN=false
ENABLE_IMMEDIATE_GROUP_ALERTS=false
```

In groups and channels, repeating the same typed command will not post again until 10 new chat messages have appeared. Button clicks edit the same bot panel instead of posting new messages. When someone types a command, the bot reuses the last panel for 60 minutes when possible; after that it posts a fresh panel. DMs are not command-gated. The bot does not auto-scan posted contracts by default; users must click or send commands. The only proactive group post is the hourly digest.

Commands must be typed in full. Partial commands such as `/w` are ignored silently and do not post the help menu. Plain words like `new`, `ping`, or `backup` do not trigger group/channel replies; users must send the exact slash command, for example `/new`, or click a button.

## User Commands

- `/start` - Open the main menu
- `/watchtoken CA` - Watch a token
- `/watchwallet walletaddress` - Watch a wallet
- `/topcalls` - Show the best bot-surfaced calls for 1D, 1W, 2W, or 1M
- `/scan CA` - Token deep dive with MC, liquidity, setup, warnings, and quick buttons
- `/new` - View filtered new pairs
- `/newpairs` - View filtered new pairs
- `/boosts` - View paid-boosted tokens that still pass the quality filter
- `/untrack CA_OR_TICKER_OR_WALLET` - Remove a personal watch, and remove the group watch when used by a group admin
- `/untrackcoin CA_OR_TICKER` - Remove a watched coin/token by ticker or contract address
- `/untracktoken CA_OR_TICKER` - Same as `/untrackcoin`
- `/untrackwallet walletaddress` - Remove a watched wallet
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

The bot registers public commands for everyone and admin commands for group/supergroup admins where Telegram supports admin command scopes. In channels, it registers a channel command set. Typed slash commands still work even when Telegram does not show a menu. Public channels/groups cannot create backups.

Plain words do not trigger commands. Use exact slash commands like `/ping`, `/new`, or `/newpairs`, or click the bot's buttons.

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

Render logs should show a line like:

```text
[message] channel:-100123 "/ping"
```

If that log does not appear, Telegram is not delivering channel posts to the bot. Remove and re-add the bot as channel admin, then run `/commands` in the channel. If the log appears but the channel gets no reply, the bot is receiving messages but does not have permission to post in that channel.

## Default Alert Philosophy

User default: `Important Only`

Group default:

- Auto CA Scan: OFF
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

`src/providers/dexScreenerProvider.js` refreshes public DEX Screener data every minute by default. `src/providers/mockSolanaProvider.js` remains as an offline fallback so the bot can still run if live data is unavailable.

The rest of the bot is already shaped around provider methods:

- `scanToken(ca)`
- `getNewPairs(filters)`
- `getTrending(kind)`
- `getPaidBoosts()`
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
    dexScreenerProvider.js       Live public market cache
    mockSolanaProvider.js        Offline fallback
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
