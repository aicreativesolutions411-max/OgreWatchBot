export const ALERT_MODES = {
  silent: {
    label: 'Silent Tracking',
    description: 'Watchlist only. No DMs unless you ask.'
  },
  instant: {
    label: 'Instant Alerts',
    description: 'Send every matching alert right away.'
  },
  important: {
    label: 'Important Only',
    description: 'Default. Sends filtered high-value updates.'
  },
  hourly: {
    label: 'Hourly Summary',
    description: 'Batch alerts into hourly summaries.'
  },
  daily: {
    label: 'Daily Summary',
    description: 'Batch alerts into one daily summary.'
  }
};

export const DEFAULT_USER_SETTINGS = {
  alertMode: 'important',
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  }
};

export const DEFAULT_GROUP_SETTINGS = {
  autoCaScan: false,
  newPairAlerts: false,
  whaleAlerts: false,
  trendingDigest: true,
  dailyReport: true,
  cooldownMinutes: 10,
  alertMode: 'important',
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  }
};

export const TOKEN_ALERT_OPTIONS = {
  important: 'Important Alerts',
  price: 'Price / MC Moves',
  volume: 'Volume Spikes',
  whales: 'Whale Trades',
  liquidity: 'Liquidity Changes',
  holders: 'Holder Growth'
};

export const WALLET_ALERT_OPTIONS = {
  important: 'Important Trades Only',
  buys: 'Buys Only',
  sells: 'Sells Only',
  all: 'All Trades',
  token: 'Specific Token Only'
};

export const MARKET_CAP_MILESTONES = [25, 50, 100, 250, 500];

export const NEW_PAIR_AGE_OPTIONS = [
  { label: '10m', minutes: 10 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '12h', minutes: 720 },
  { label: '1d', minutes: 1440 }
];

export const NEW_PAIR_DEFAULT_FILTERS = {
  minLiquidityUsd: 10_000,
  freshMinLiquidityUsd: 5_000,
  minVolumeUsd: 20_000,
  freshMinVolumeUsd: 8_000,
  minMarketCapUsd: 20_000,
  freshMinMarketCapUsd: 10_000,
  maxMarketCapUsd: 500_000,
  maxAgeMinutes: 60,
  mintDisabled: true,
  freezeDisabled: true
};
