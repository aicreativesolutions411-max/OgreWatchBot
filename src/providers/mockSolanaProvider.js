import { NEW_PAIR_DEFAULT_FILTERS } from '../domain/defaults.js';
import { hashString, seededNumber, tokenSymbolFromAddress } from '../utils/solana.js';

const SAMPLE_CONTRACTS = [
  'So11111111111111111111111111111111111111112',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'ComputeBudget111111111111111111111111111111'
];

export class MockSolanaProvider {
  constructor(config) {
    this.config = config;
  }

  async scanToken(ca) {
    const seed = hashString(ca);
    const marketCapUsd = seededNumber(`${ca}:mc`, 24_000, 420_000);
    const liquidityUsd = seededNumber(`${ca}:liq`, 10_000, 90_000);
    const volume5mUsd = seededNumber(`${ca}:volume`, 4_000, 80_000);
    const holders = seededNumber(`${ca}:holders`, 80, 2400);
    const riskScore = seed % 3;

    return {
      ca,
      symbol: tokenSymbolFromAddress(ca),
      marketCapUsd,
      liquidityUsd,
      volume5mUsd,
      holders,
      mintDisabled: seed % 5 !== 0,
      freezeDisabled: seed % 7 !== 0,
      risk: ['Low', 'Medium', 'High'][riskScore]
    };
  }

  async getNewPairs(filters = NEW_PAIR_DEFAULT_FILTERS) {
    return SAMPLE_CONTRACTS.map((ca, index) => ({
      ca,
      symbol: tokenSymbolFromAddress(`${ca}:new:${index}`),
      ageMinutes: seededNumber(`${ca}:age`, 4, 28),
      marketCapUsd: seededNumber(`${ca}:new:mc`, filters.minMarketCapUsd, filters.maxMarketCapUsd),
      liquidityUsd: seededNumber(`${ca}:new:liq`, filters.minLiquidityUsd, 64_000),
      volumeUsd: seededNumber(`${ca}:new:volume`, filters.minVolumeUsd, 120_000),
      mintDisabled: true,
      freezeDisabled: true
    })).sort((a, b) => a.ageMinutes - b.ageMinutes);
  }

  async getTrending(kind = '5m') {
    const labels = {
      '5m': '5m Movers',
      '1h': '1h Movers',
      '24h': '24h Volume',
      lowcaps: 'New Low Caps',
      bought: 'Most Bought',
      watched: 'Watched by Users'
    };

    return {
      label: labels[kind] ?? 'Trending',
      tokens: SAMPLE_CONTRACTS.map((ca, index) => ({
        ca,
        symbol: tokenSymbolFromAddress(`${ca}:${kind}`),
        movePercent: seededNumber(`${ca}:${kind}:move`, 12, 88),
        reason: reasonsFor(kind, index)
      })).sort((a, b) => b.movePercent - a.movePercent)
    };
  }

  async getPortfolio(wallet) {
    return {
      wallet,
      solBalance: seededNumber(`${wallet}:sol`, 1, 140) / 10,
      tokensHeld: seededNumber(`${wallet}:tokens`, 3, 26),
      estimatedValueUsd: seededNumber(`${wallet}:value`, 420, 41_000),
      recentBuys: seededNumber(`${wallet}:buys`, 0, 9),
      recentSells: seededNumber(`${wallet}:sells`, 0, 7),
      biggestBag: tokenSymbolFromAddress(`${wallet}:bag`),
      bestRecentTrade: `${tokenSymbolFromAddress(`${wallet}:best`)} +${seededNumber(`${wallet}:bestpct`, 18, 164)}%`,
      worstRecentTrade: `${tokenSymbolFromAddress(`${wallet}:worst`)} -${seededNumber(`${wallet}:worstpct`, 8, 51)}%`
    };
  }

  async getMarketReport() {
    const trending = await this.getTrending('watched');
    const newPairs = await this.getNewPairs();
    return {
      topTokens: trending.tokens.slice(0, 3),
      newPairs: newPairs.slice(0, 3)
    };
  }

  async pollWatchedEvents(context) {
    void context;
    return [];
  }

  marketStatus() {
    return {
      source: 'Mock',
      refreshedAt: new Date().toISOString(),
      pairCount: SAMPLE_CONTRACTS.length,
      error: ''
    };
  }

  demoWalletAlert(ca = SAMPLE_CONTRACTS[0]) {
    return {
      type: 'wallet_trade',
      ca,
      symbol: tokenSymbolFromAddress(ca),
      wallet: 'Whale11111111111111111111111111111111111111',
      walletLabel: 'Smart Wallet',
      side: 'bought',
      solAmount: 6.2,
      marketCapUsd: 44_000,
      liquidityUsd: 13_000,
      reason: 'You watch this wallet.',
      importance: 'important'
    };
  }

  demoGroupSpike(ca = SAMPLE_CONTRACTS[0]) {
    return {
      type: 'multi_wallet',
      ca,
      symbol: tokenSymbolFromAddress(ca),
      walletCount: 4,
      totalSol: 31.7,
      timeframeMinutes: 6,
      marketCapBeforeUsd: 44_000,
      marketCapAfterUsd: 91_000,
      volume5mUsd: 42_000,
      importance: 'major'
    };
  }
}

function reasonsFor(kind, index) {
  const reasonSets = {
    '5m': ['volume spike', 'whale buys', 'liquidity added', 'holder jump'],
    '1h': ['market cap breakout', 'repeated buys', 'trend acceleration', 'new holders'],
    '24h': ['high volume', 'steady accumulation', 'strong liquidity', 'watchlist demand'],
    lowcaps: ['low cap with liquidity', 'fresh pair traction', 'early holder growth', 'clean safety flags'],
    bought: ['most bought by tracked wallets', 'clustered buys', 'smart money entry', 'buy pressure'],
    watched: ['watched by users', 'group watchlist activity', 'DM watchlist growth', 'repeat scans']
  };
  return reasonSets[kind]?.[index % 4] ?? 'market movement';
}
