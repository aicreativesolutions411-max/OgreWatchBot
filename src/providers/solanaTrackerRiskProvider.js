const DEFAULT_BASE_URL = 'https://data.solanatracker.io';
const CACHE_TTL_MS = 10 * 60 * 1000;

export class SolanaTrackerRiskProvider {
  constructor(config = {}) {
    this.config = config;
    this.baseUrl = trimTrailingSlash(config.solanaTrackerApiBase ?? DEFAULT_BASE_URL);
    this.apiKey = config.solanaTrackerApiKey ?? '';
    this.enabled = Boolean(this.apiKey) && config.solanaTrackerRiskEnabled !== false;
    this.cache = new Map();
  }

  async checkToken(ca) {
    if (!this.enabled || !ca) return null;

    const cached = this.cache.get(ca);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    try {
      const response = await fetch(`${this.baseUrl}/tokens/${encodeURIComponent(ca)}`, {
        headers: {
          accept: 'application/json',
          'x-api-key': this.apiKey
        },
        signal: AbortSignal.timeout(10_000)
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const value = parseRisk(data);
      this.cache.set(ca, { at: Date.now(), value });
      return value;
    } catch (error) {
      console.warn(`[risk-check] ${ca} ${error.message}`);
      this.cache.set(ca, { at: Date.now(), value: null });
      return null;
    }
  }
}

function parseRisk(data) {
  const risk = data?.risk ?? data?.token?.risk ?? null;
  if (!risk) return null;

  const risks = Array.isArray(risk.risks) ? risk.risks : [];
  const dangerFlags = risks
    .filter((item) => String(item?.level ?? '').toLowerCase() === 'danger')
    .map((item) => item?.name)
    .filter(Boolean);

  return {
    score: Number(risk.score ?? 0),
    rugged: Boolean(risk.rugged),
    dangerFlags,
    risks
  };
}

function trimTrailingSlash(value) {
  return String(value ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}
