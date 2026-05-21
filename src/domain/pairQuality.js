const DEFAULT_MIN_SCORE = 62;
const DEFAULT_MAX_RISK_SCORE = 7;
const DEFAULT_FRESH_MIN_LIQUIDITY_USD = 2_500;

export function scorePair(pair, options = {}) {
  const minScore = numberOption(options.marketQualityMinScore, DEFAULT_MIN_SCORE);
  const maxRiskScore = numberOption(options.solanaTrackerMaxRiskScore, DEFAULT_MAX_RISK_SCORE);
  const freshMinLiquidityUsd = numberOption(options.marketQualityFreshMinLiquidityUsd, DEFAULT_FRESH_MIN_LIQUIDITY_USD);
  const warnings = [];
  const strengths = [];
  let score = 50;

  const liquidityUsd = numberValue(pair.liquidityUsd);
  const marketCapUsd = numberValue(pair.marketCapUsd);
  const volume5mUsd = numberValue(pair.volume5mUsd);
  const volume1hUsd = numberValue(pair.volume1hUsd);
  const volume24hUsd = numberValue(pair.volume24hUsd);
  const volumeUsd = numberValue(pair.volumeUsd) || volume5mUsd || volume1hUsd || volume24hUsd;
  const buys5m = numberValue(pair.buys5m);
  const sells5m = numberValue(pair.sells5m);
  const buys1h = numberValue(pair.buys1h);
  const sells1h = numberValue(pair.sells1h);
  const priceChange5m = numberValue(pair.priceChange5m);
  const priceChange1h = numberValue(pair.priceChange1h);
  const ageMinutes = pair.ageMinutes == null ? null : numberValue(pair.ageMinutes);

  const totalTx5m = buys5m + sells5m;
  const totalTx1h = buys1h + sells1h;
  const liquidityToMarketCap = marketCapUsd > 0 ? liquidityUsd / marketCapUsd : 0;
  const volumeToLiquidity = liquidityUsd > 0 ? volumeUsd / liquidityUsd : 0;
  const avg5mTradeUsd = totalTx5m > 0 ? volume5mUsd / totalTx5m : 0;
  const freshPotential = isFreshPotential({
    liquidityUsd,
    marketCapUsd,
    volume5mUsd,
    volume1hUsd,
    buys5m,
    sells5m,
    buys1h,
    sells1h,
    priceChange5m,
    priceChange1h,
    ageMinutes
  });

  if (marketCapUsd <= 0) warnings.push('missing market cap');
  if (liquidityUsd < freshMinLiquidityUsd) warnings.push('thin liquidity');
  else if (liquidityUsd < 10_000 && !freshPotential) warnings.push('thin liquidity');
  if (liquidityToMarketCap > 0 && liquidityToMarketCap < 0.025) warnings.push('liquidity too thin for MC');
  if (volumeToLiquidity > 18) warnings.push('volume looks noisy vs liquidity');
  if (priceChange5m > 260 || priceChange1h > 650) warnings.push('extreme spike already');
  if (sells5m >= 8 && sells5m > buys5m * 1.8) warnings.push('heavy sell pressure');
  if (buys5m >= 20 && sells5m === 0 && volume5mUsd >= 10_000) warnings.push('no sells after heavy buying');
  if (avg5mTradeUsd > liquidityUsd * 0.75 && totalTx5m <= 8) warnings.push('few trades drive most volume');
  if (ageMinutes != null && ageMinutes < 2) warnings.push('too new to trust');
  if (isBundleLike({ buys5m, sells5m, priceChange5m, ageMinutes, volumeToLiquidity })) warnings.push('bundle/snipe pattern');

  if (liquidityUsd >= 100_000) {
    score += 22;
    strengths.push('deep liquidity');
  } else if (liquidityUsd >= 50_000) {
    score += 18;
    strengths.push('solid liquidity');
  } else if (liquidityUsd >= 25_000) {
    score += 12;
    strengths.push('usable liquidity');
  } else if (liquidityUsd >= freshMinLiquidityUsd && freshPotential) {
    score += 7;
    strengths.push('early low-liq momentum');
  } else if (liquidityUsd < 12_000) {
    score -= 12;
  }

  if (marketCapUsd >= 30_000 && marketCapUsd <= 450_000) {
    score += 9;
    strengths.push('early MC range');
  } else if (marketCapUsd > 1_500_000) {
    score -= 8;
  }

  if (liquidityToMarketCap >= 0.08 && liquidityToMarketCap <= 0.65) {
    score += 15;
    strengths.push('healthy liq/MC');
  } else if (liquidityToMarketCap >= 0.04) {
    score += 6;
  } else if (liquidityToMarketCap > 0) {
    score -= 18;
  }

  if (volumeToLiquidity >= 0.25 && volumeToLiquidity <= 6) {
    score += 10;
    strengths.push('active volume');
  } else if (volumeToLiquidity > 12) {
    score -= 18;
  }

  if (totalTx5m >= 12 && buys5m >= sells5m * 1.2) {
    score += 12;
    strengths.push('buy pressure');
  } else if (totalTx1h >= 30 && buys1h >= sells1h * 1.15) {
    score += 8;
    strengths.push('steady buys');
  } else if (sells5m > buys5m * 1.5) {
    score -= 12;
  }

  if (priceChange5m >= 8 && priceChange5m <= 85) {
    score += 7;
    strengths.push('5m momentum');
  } else if (priceChange5m > 180) {
    score -= 14;
  } else if (priceChange5m < -20) {
    score -= 10;
  }

  if (priceChange1h >= 12 && priceChange1h <= 180) {
    score += 8;
    strengths.push('1h momentum');
  } else if (priceChange1h > 420) {
    score -= 18;
  }

  if (ageMinutes != null && ageMinutes >= 5 && ageMinutes <= 240) {
    score += 6;
    strengths.push('fresh but not instant');
  }

  score -= hardWarningPenalty(warnings);
  score = clamp(Math.round(score), 0, 100);

  const externalRisk = normalizeExternalRisk(pair.externalRisk);
  if (externalRisk) {
    if (externalRisk.rugged) warnings.push('rugged status');
    if (externalRisk.score >= maxRiskScore) warnings.push(`risk score ${externalRisk.score}/10`);
    if (externalRisk.dangerFlags.length) warnings.push(...externalRisk.dangerFlags.slice(0, 3));
    if (externalRisk.score > 0) score = clamp(score - Math.round(externalRisk.score * 4), 0, 100);
  }

  const blocked = isBlocked({
    score,
    minScore,
    warnings,
    externalRisk,
    marketCapUsd,
    liquidityUsd,
    liquidityToMarketCap,
    volumeToLiquidity,
    maxRiskScore,
    freshMinLiquidityUsd,
    freshPotential
  });

  return {
    score,
    tier: qualityTier(score),
    riskLevel: riskLevel(score, warnings, blocked),
    passes: !blocked,
    warnings: unique(warnings).slice(0, 5),
    strengths: unique(strengths).slice(0, 4),
    externalRisk
  };
}

export function withQuality(target, quality) {
  return {
    ...target,
    qualityScore: quality?.score,
    qualityTier: quality?.tier,
    qualityRiskLevel: quality?.riskLevel,
    qualityWarnings: quality?.warnings ?? [],
    qualityStrengths: quality?.strengths ?? [],
    externalRiskScore: quality?.externalRisk?.score ?? null
  };
}

export function passesQuality(quality, options = {}) {
  if (options.marketQualityFilterEnabled === false) return true;
  return Boolean(quality?.passes);
}

function isBlocked({ score, minScore, warnings, externalRisk, marketCapUsd, liquidityUsd, liquidityToMarketCap, volumeToLiquidity, maxRiskScore, freshMinLiquidityUsd, freshPotential }) {
  if (marketCapUsd <= 0 || liquidityUsd <= 0) return true;
  if (liquidityUsd < freshMinLiquidityUsd) return true;
  if (liquidityUsd < 10_000 && !freshPotential) return true;
  if (liquidityToMarketCap > 0 && liquidityToMarketCap < 0.015) return true;
  if (volumeToLiquidity > 28) return true;
  if (externalRisk?.rugged) return true;
  if (externalRisk?.score >= maxRiskScore) return true;
  if (externalRisk?.dangerFlags?.length) return true;
  if (warnings.includes('bundle/snipe pattern')) return true;
  if (warnings.includes('no sells after heavy buying')) return true;
  if (warnings.includes('heavy sell pressure')) return true;
  return score < minScore;
}

function isFreshPotential({ liquidityUsd, marketCapUsd, volume5mUsd, volume1hUsd, buys5m, sells5m, buys1h, sells1h, priceChange5m, priceChange1h, ageMinutes }) {
  if (ageMinutes == null || ageMinutes > 60) return false;
  if (marketCapUsd <= 0 || liquidityUsd <= 0) return false;
  const earlyLowLiquidity = liquidityUsd < 5_000;
  const buyPressure5m = buys5m >= (earlyLowLiquidity ? 12 : 8) && buys5m >= sells5m * (earlyLowLiquidity ? 1.6 : 1.35);
  const buyPressure1h = buys1h >= (earlyLowLiquidity ? 25 : 18) && buys1h >= sells1h * (earlyLowLiquidity ? 1.45 : 1.25);
  const marketCapMove = priceChange5m >= (earlyLowLiquidity ? 12 : 8) || priceChange1h >= (earlyLowLiquidity ? 22 : 15);
  const activeVolume = volume5mUsd >= (earlyLowLiquidity ? 8_000 : 5_000) || volume1hUsd >= (earlyLowLiquidity ? 16_000 : 10_000);
  const saneLiquidity = liquidityUsd / marketCapUsd >= 0.035;
  return (buyPressure5m || buyPressure1h) && marketCapMove && activeVolume && saneLiquidity;
}

function isBundleLike({ buys5m, sells5m, priceChange5m, ageMinutes, volumeToLiquidity }) {
  const veryFresh = ageMinutes == null || ageMinutes <= 30;
  if (!veryFresh) return false;
  if (buys5m >= 35 && sells5m <= 2 && priceChange5m >= 140) return true;
  return buys5m >= 50 && volumeToLiquidity >= 10 && sells5m <= 4;
}

function hardWarningPenalty(warnings) {
  const weights = {
    'missing market cap': 30,
    'thin liquidity': 20,
    'liquidity too thin for MC': 24,
    'volume looks noisy vs liquidity': 20,
    'extreme spike already': 18,
    'heavy sell pressure': 24,
    'no sells after heavy buying': 28,
    'few trades drive most volume': 18,
    'too new to trust': 10,
    'bundle/snipe pattern': 34
  };
  return warnings.reduce((sum, warning) => sum + (weights[warning] ?? 8), 0);
}

function normalizeExternalRisk(risk) {
  if (!risk) return null;
  return {
    score: numberValue(risk.score),
    rugged: Boolean(risk.rugged),
    dangerFlags: Array.isArray(risk.dangerFlags) ? risk.dangerFlags.filter(Boolean) : []
  };
}

function qualityTier(score) {
  if (score >= 82) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function riskLevel(score, warnings, blocked) {
  if (blocked) return 'Blocked';
  if (score >= 78 && warnings.length === 0) return 'Lower';
  if (score >= 62) return 'Medium';
  return 'High';
}

function numberOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
