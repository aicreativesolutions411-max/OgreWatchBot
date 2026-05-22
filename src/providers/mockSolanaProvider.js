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

    return withMockQuality({
      ca,
      symbol: tokenSymbolFromAddress(ca),
      marketCapUsd,
      liquidityUsd,
      volume5mUsd,
      holders,
      mintDisabled: seed % 5 !== 0,
      freezeDisabled: seed % 7 !== 0,
      risk: ['Low', 'Medium', 'High'][riskScore]
    }, ca);
  }

  async getNewPairs(filters = NEW_PAIR_DEFAULT_FILTERS) {
    const maxAgeMinutes = Number(filters.maxAgeMinutes ?? NEW_PAIR_DEFAULT_FILTERS.maxAgeMinutes);
    return SAMPLE_CONTRACTS.map((ca, index) => withMockQuality({
      ca,
      symbol: tokenSymbolFromAddress(`${ca}:new:${index}`),
      ageMinutes: seededNumber(`${ca}:age`, 4, 28),
      marketCapUsd: seededNumber(`${ca}:new:mc`, filters.minMarketCapUsd, filters.maxMarketCapUsd),
      liquidityUsd: seededNumber(`${ca}:new:liq`, filters.minLiquidityUsd, 64_000),
      volumeUsd: seededNumber(`${ca}:new:volume`, filters.minVolumeUsd, 120_000),
      mintDisabled: true,
      freezeDisabled: true
    }, ca))
      .filter((pair) => pair.ageMinutes <= maxAgeMinutes)
      .sort((a, b) => b.qualityScore - a.qualityScore || a.ageMinutes - b.ageMinutes);
  }

  async getTrending(kind = '5m') {
    const labels = {
      '5m': '5m Movers',
      '1h': '1h Movers',
      '24h': '24h Momentum',
      volume: 'High Volume Setups',
      lowcaps: 'New Low Caps',
      bought: 'Most Bought',
      watched: 'Watched by Users'
    };

    return {
      label: labels[kind] ?? 'Trending',
      tokens: SAMPLE_CONTRACTS.map((ca, index) => withMockQuality({
        ca,
        symbol: tokenSymbolFromAddress(`${ca}:${kind}`),
        marketCapUsd: seededNumber(`${ca}:${kind}:mc`, 28_000, 420_000),
        liquidityUsd: seededNumber(`${ca}:${kind}:liq`, 4_500, 90_000),
        movePercent: seededNumber(`${ca}:${kind}:move`, 12, 88),
        reason: reasonsFor(kind, index)
      }, ca)).sort((a, b) => b.movePercent - a.movePercent)
    };
  }

  async getPaidBoosts() {
    return SAMPLE_CONTRACTS.map((ca, index) => withMockQuality({
      ca,
      symbol: tokenSymbolFromAddress(`${ca}:boost:${index}`),
      marketCapUsd: seededNumber(`${ca}:boost:mc`, 24_000, 520_000),
      liquidityUsd: seededNumber(`${ca}:boost:liq`, 5_000, 120_000),
      ageMinutes: seededNumber(`${ca}:boost:age`, 12, 240),
      movePercent: seededNumber(`${ca}:boost:move`, 6, 64),
      reason: 'boosted and passed mock setup filter'
    }, `${ca}:boost`)).sort((a, b) => b.qualityScore - a.qualityScore);
  }

  async getPortfolio(wallet) {
    const biggestBagCa = SAMPLE_CONTRACTS[seededNumber(`${wallet}:bagidx`, 0, SAMPLE_CONTRACTS.length - 1)];
    const bestRecentTradeCa = SAMPLE_CONTRACTS[seededNumber(`${wallet}:bestidx`, 0, SAMPLE_CONTRACTS.length - 1)];
    const worstRecentTradeCa = SAMPLE_CONTRACTS[seededNumber(`${wallet}:worstidx`, 0, SAMPLE_CONTRACTS.length - 1)];
    const biggestBag = tokenSymbolFromAddress(biggestBagCa);
    const bestRecentTradeSymbol = tokenSymbolFromAddress(bestRecentTradeCa);
    const worstRecentTradeSymbol = tokenSymbolFromAddress(worstRecentTradeCa);

    return {
      wallet,
      solBalance: seededNumber(`${wallet}:sol`, 1, 140) / 10,
      tokensHeld: seededNumber(`${wallet}:tokens`, 3, 26),
      estimatedValueUsd: seededNumber(`${wallet}:value`, 420, 41_000),
      recentBuys: seededNumber(`${wallet}:buys`, 0, 9),
      recentSells: seededNumber(`${wallet}:sells`, 0, 7),
      biggestBag,
      biggestBagCa,
      bestRecentTradeSymbol,
      bestRecentTradeCa,
      bestRecentTrade: `${bestRecentTradeSymbol} +${seededNumber(`${wallet}:bestpct`, 18, 164)}%`,
      worstRecentTradeSymbol,
      worstRecentTradeCa,
      worstRecentTrade: `${worstRecentTradeSymbol} -${seededNumber(`${wallet}:worstpct`, 8, 51)}%`
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
    '5m': ['MC momentum', 'whale buys', 'liquidity added', 'holder jump'],
    '1h': ['market cap breakout', 'repeated buys', 'trend acceleration', 'new holders'],
    '24h': ['MC and liquidity momentum', 'steady accumulation', 'strong liquidity', 'watchlist demand'],
    volume: ['high volume with clean setup', 'active trading', 'volume expansion', 'liquidity-backed volume'],
    lowcaps: ['low cap with liquidity', 'fresh pair traction', 'early holder growth', 'clean safety flags'],
    bought: ['most bought by tracked wallets', 'clustered buys', 'smart money entry', 'buy pressure'],
    watched: ['watched by users', 'group watchlist activity', 'DM watchlist growth', 'repeat scans']
  };
  return reasonSets[kind]?.[index % 4] ?? 'market movement';
}

function withMockQuality(item, seed) {
  const score = seededNumber(`${seed}:quality`, 68, 91);
  return {
    ...item,
    qualityScore: score,
    qualityTier: score >= 82 ? 'A' : 'B',
    qualityRiskLevel: score >= 82 ? 'Lower' : 'Medium',
    qualityWarnings: [],
    qualityStrengths: ['mock quality pass']
  };
}
