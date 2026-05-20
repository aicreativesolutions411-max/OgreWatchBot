import { NEW_PAIR_DEFAULT_FILTERS } from '../domain/defaults.js';
import { tokenSymbolFromAddress } from '../utils/solana.js';

const SOLANA_CHAIN_ID = 'solana';
const DEFAULT_SEARCH_QUERIES = ['SOL/USDC', 'SOL', 'pump', 'raydium'];

export class DexScreenerProvider {
  constructor(config, fallbackProvider) {
    this.config = config;
    this.fallbackProvider = fallbackProvider;
    this.baseUrl = trimTrailingSlash(config.dexScreenerApiBase ?? 'https://api.dexscreener.com');
    this.refreshIntervalSeconds = config.marketRefreshIntervalSeconds ?? 60;
    this.searchQueries = config.dexScreenerSearchQueries?.length ? config.dexScreenerSearchQueries : DEFAULT_SEARCH_QUERIES;
    this.maxTokens = config.dexScreenerMaxTokens ?? 30;
    this.interval = null;
    this.refreshing = null;
    this.lastRefreshAt = null;
    this.lastError = '';
    this.pairsByAddress = new Map();
    this.pairsByToken = new Map();
  }

  start() {
    if (this.refreshIntervalSeconds <= 0) return;

    setTimeout(() => {
      this.refreshNow('startup').catch((error) => {
        console.warn(`[market-refresh] startup failed: ${error.message}`);
      });
    }, 1000);

    this.interval = setInterval(() => {
      this.refreshNow('scheduled').catch((error) => {
        console.warn(`[market-refresh] scheduled failed: ${error.message}`);
      });
    }, this.refreshIntervalSeconds * 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async refreshNow(reason = 'manual') {
    if (this.refreshing) return this.refreshing;

    this.refreshing = this.#refresh(reason)
      .catch((error) => {
        this.lastError = error.message;
        throw error;
      })
      .finally(() => {
        this.refreshing = null;
      });

    return this.refreshing;
  }

  async #refresh(reason) {
    const [profiles, latestBoosts, topBoosts, searchedPairs] = await Promise.all([
      this.#fetchJson('/token-profiles/latest/v1').catch((error) => {
        console.warn(`[dexscreener] token profiles failed: ${error.message}`);
        return [];
      }),
      this.#fetchJson('/token-boosts/latest/v1').catch((error) => {
        console.warn(`[dexscreener] latest boosts failed: ${error.message}`);
        return [];
      }),
      this.#fetchJson('/token-boosts/top/v1').catch((error) => {
        console.warn(`[dexscreener] top boosts failed: ${error.message}`);
        return [];
      }),
      this.#fetchSearchPairs()
    ]);

    const tokenAddresses = unique([
      ...solanaTokenAddresses(profiles),
      ...solanaTokenAddresses(latestBoosts),
      ...solanaTokenAddresses(topBoosts)
    ]).slice(0, this.maxTokens);

    const tokenPairs = tokenAddresses.length ? await this.#fetchTokenPairs(tokenAddresses) : [];
    const allPairs = [...tokenPairs, ...searchedPairs]
      .filter((pair) => pair?.chainId === SOLANA_CHAIN_ID)
      .map(normalizePair)
      .filter(Boolean);

    if (!allPairs.length) {
      throw new Error('DexScreener returned no Solana pairs.');
    }

    this.#replacePairs(allPairs);
    this.lastRefreshAt = new Date();
    this.lastError = '';
    console.log(`[market-refresh] ${reason} ok: ${this.pairsByAddress.size} Solana pairs cached`);
  }

  async #fetchSearchPairs() {
    const responses = await Promise.all(this.searchQueries.map((query) => {
      const path = `/latest/dex/search?q=${encodeURIComponent(query)}`;
      return this.#fetchJson(path).catch((error) => {
        console.warn(`[dexscreener] search "${query}" failed: ${error.message}`);
        return { pairs: [] };
      });
    }));

    return responses.flatMap((response) => response?.pairs ?? []);
  }

  async #fetchTokenPairs(tokenAddresses) {
    const chunks = chunk(tokenAddresses, 30);
    const responses = await Promise.all(chunks.map((addresses) => {
      const path = `/tokens/v1/${SOLANA_CHAIN_ID}/${addresses.join(',')}`;
      return this.#fetchJson(path).catch((error) => {
        console.warn(`[dexscreener] token pairs failed: ${error.message}`);
        return [];
      });
    }));

    return responses.flatMap((response) => Array.isArray(response) ? response : response?.pairs ?? []);
  }

  async #fetchJson(path) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  #replacePairs(pairs) {
    const byAddress = new Map();
    const byToken = new Map();

    for (const pair of pairs) {
      const existing = byAddress.get(pair.pairAddress);
      if (!existing || pair.liquidityUsd > existing.liquidityUsd) {
        byAddress.set(pair.pairAddress, pair);
      }

      for (const tokenAddress of [pair.baseTokenAddress, pair.quoteTokenAddress].filter(Boolean)) {
        const current = byToken.get(tokenAddress);
        if (!current || pair.liquidityUsd > current.liquidityUsd) {
          byToken.set(tokenAddress, pair);
        }
      }
    }

    this.pairsByAddress = byAddress;
    this.pairsByToken = byToken;
  }

  async ensureFreshForCommand() {
    const maxAgeMs = Math.max(this.refreshIntervalSeconds, 30) * 1000;
    if (!this.lastRefreshAt || Date.now() - this.lastRefreshAt.getTime() > maxAgeMs) {
      await this.refreshNow('command').catch((error) => {
        console.warn(`[market-refresh] command failed: ${error.message}`);
      });
    }
  }

  async scanToken(ca) {
    await this.#refreshTokenIfNeeded(ca);
    const pair = this.pairsByToken.get(ca);
    if (!pair) return this.fallbackProvider.scanToken(ca);

    return {
      ca,
      symbol: pair.symbol,
      marketCapUsd: pair.marketCapUsd,
      liquidityUsd: pair.liquidityUsd,
      volume5mUsd: pair.volume5mUsd,
      holders: 0,
      mintDisabled: null,
      freezeDisabled: null,
      risk: riskFromPair(pair),
      priceUsd: pair.priceUsd,
      pairAddress: pair.pairAddress
    };
  }

  async #refreshTokenIfNeeded(ca) {
    if (this.pairsByToken.has(ca)) return;

    const pairs = await this.#fetchTokenPairs([ca]).catch((error) => {
      console.warn(`[dexscreener] scan token failed: ${error.message}`);
      return [];
    });
    const normalizedPairs = pairs.map(normalizePair).filter(Boolean);
    if (normalizedPairs.length) this.#replacePairs([...this.pairsByAddress.values(), ...normalizedPairs]);
  }

  async getNewPairs(filters = NEW_PAIR_DEFAULT_FILTERS) {
    await this.ensureFreshForCommand();

    const pairs = [...this.pairsByAddress.values()]
      .filter((pair) => pair.ageMinutes != null)
      .filter((pair) => pair.liquidityUsd >= filters.minLiquidityUsd)
      .filter((pair) => pair.volumeUsd >= filters.minVolumeUsd)
      .filter((pair) => pair.marketCapUsd >= filters.minMarketCapUsd && pair.marketCapUsd <= filters.maxMarketCapUsd)
      .sort((a, b) => a.ageMinutes - b.ageMinutes)
      .slice(0, 10)
      .map(pairToNewPair);

    return pairs.length ? pairs : this.fallbackProvider.getNewPairs(filters);
  }

  async getTrending(kind = '5m') {
    await this.ensureFreshForCommand();

    const pairs = [...this.pairsByAddress.values()];
    const sorted = sortPairsForTrend(pairs, kind).slice(0, 10).map((pair) => ({
      ca: pair.baseTokenAddress,
      symbol: pair.symbol,
      movePercent: trendPercent(pair, kind),
      reason: trendReason(pair, kind)
    }));

    if (sorted.length) {
      return {
        label: trendLabel(kind),
        tokens: sorted
      };
    }

    return this.fallbackProvider.getTrending(kind);
  }

  async getPortfolio(wallet) {
    return this.fallbackProvider.getPortfolio(wallet);
  }

  async getMarketReport() {
    const trending = await this.getTrending('5m');
    const newPairs = await this.getNewPairs();
    return {
      topTokens: trending.tokens.slice(0, 3),
      newPairs: newPairs.slice(0, 3)
    };
  }

  async pollWatchedEvents(context) {
    const tokens = unique(context.tokens ?? []).slice(0, 30);
    if (tokens.length) {
      const pairs = await this.#fetchTokenPairs(tokens).catch((error) => {
        console.warn(`[dexscreener] watched token refresh failed: ${error.message}`);
        return [];
      });
      const normalizedPairs = pairs.map(normalizePair).filter(Boolean);
      if (normalizedPairs.length) this.#replacePairs([...this.pairsByAddress.values(), ...normalizedPairs]);
    }

    return [];
  }

  marketStatus() {
    return {
      source: 'DexScreener',
      refreshedAt: this.lastRefreshAt?.toISOString() ?? '',
      pairCount: this.pairsByAddress.size,
      error: this.lastError
    };
  }
}

function solanaTokenAddresses(items) {
  const list = Array.isArray(items) ? items : [items];
  return list
    .filter((item) => item?.chainId === SOLANA_CHAIN_ID)
    .map((item) => item.tokenAddress)
    .filter(Boolean);
}

function normalizePair(pair) {
  const pairAddress = pair?.pairAddress;
  if (!pairAddress) return null;

  const baseTokenAddress = pair.baseToken?.address ?? '';
  const quoteTokenAddress = pair.quoteToken?.address ?? '';
  const symbol = pair.baseToken?.symbol || tokenSymbolFromAddress(baseTokenAddress || pairAddress);
  const createdAt = Number(pair.pairCreatedAt);
  const ageMinutes = Number.isFinite(createdAt) ? Math.max(0, Math.floor((Date.now() - createdAt) / 60000)) : null;
  const marketCapUsd = firstFinite(pair.marketCap, pair.fdv, 0);
  const liquidityUsd = firstFinite(pair.liquidity?.usd, 0);
  const volume5mUsd = firstFinite(pair.volume?.m5, 0);
  const volume1hUsd = firstFinite(pair.volume?.h1, volume5mUsd);
  const volume24hUsd = firstFinite(pair.volume?.h24, volume1hUsd);

  return {
    chainId: pair.chainId,
    dexId: pair.dexId ?? '',
    url: pair.url ?? '',
    pairAddress,
    baseTokenAddress,
    quoteTokenAddress,
    symbol,
    priceUsd: Number(pair.priceUsd ?? 0),
    marketCapUsd,
    liquidityUsd,
    volume5mUsd,
    volume1hUsd,
    volume24hUsd,
    volumeUsd: volume5mUsd || volume1hUsd || volume24hUsd,
    priceChange5m: firstFinite(pair.priceChange?.m5, 0),
    priceChange1h: firstFinite(pair.priceChange?.h1, 0),
    priceChange24h: firstFinite(pair.priceChange?.h24, 0),
    buys5m: firstFinite(pair.txns?.m5?.buys, 0),
    sells5m: firstFinite(pair.txns?.m5?.sells, 0),
    ageMinutes
  };
}

function pairToNewPair(pair) {
  return {
    ca: pair.baseTokenAddress,
    symbol: pair.symbol,
    ageMinutes: pair.ageMinutes,
    marketCapUsd: pair.marketCapUsd,
    liquidityUsd: pair.liquidityUsd,
    volumeUsd: pair.volumeUsd,
    mintDisabled: null,
    freezeDisabled: null
  };
}

function sortPairsForTrend(pairs, kind) {
  const list = pairs.filter((pair) => pair.liquidityUsd > 0);
  if (kind === '1h') return list.sort((a, b) => b.priceChange1h - a.priceChange1h);
  if (kind === '24h') return list.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  if (kind === 'lowcaps') return list.filter((pair) => pair.marketCapUsd > 0 && pair.marketCapUsd <= 500_000).sort((a, b) => b.volume1hUsd - a.volume1hUsd);
  if (kind === 'bought') return list.sort((a, b) => (b.buys5m - b.sells5m) - (a.buys5m - a.sells5m));
  if (kind === 'watched') return list.sort((a, b) => b.volume1hUsd - a.volume1hUsd);
  return list.sort((a, b) => b.priceChange5m - a.priceChange5m);
}

function trendPercent(pair, kind) {
  if (kind === '1h') return pair.priceChange1h;
  if (kind === '24h') return pair.priceChange24h;
  if (kind === 'bought') return pair.buys5m - pair.sells5m;
  return pair.priceChange5m || pair.priceChange1h || pair.priceChange24h;
}

function trendReason(pair, kind) {
  if (kind === '24h') return `$${Math.round(pair.volume24hUsd).toLocaleString('en-US')} 24h volume`;
  if (kind === 'bought') return `${pair.buys5m} buys / ${pair.sells5m} sells in 5m`;
  if (kind === 'lowcaps') return `$${Math.round(pair.marketCapUsd).toLocaleString('en-US')} market cap`;
  if (kind === '1h') return `$${Math.round(pair.volume1hUsd).toLocaleString('en-US')} 1h volume`;
  return `$${Math.round(pair.volume5mUsd).toLocaleString('en-US')} 5m volume`;
}

function trendLabel(kind) {
  const labels = {
    '5m': '5m Movers',
    '1h': '1h Movers',
    '24h': '24h Volume',
    lowcaps: 'New Low Caps',
    bought: 'Most Bought',
    watched: 'Watched by Users'
  };
  return labels[kind] ?? 'Trending';
}

function riskFromPair(pair) {
  if (pair.liquidityUsd >= 50_000 && pair.volume1hUsd >= 20_000) return 'Lower';
  if (pair.liquidityUsd >= 10_000) return 'Medium';
  return 'High';
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}
