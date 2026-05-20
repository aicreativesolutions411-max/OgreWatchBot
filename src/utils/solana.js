const SOLANA_ADDRESS_PATTERN = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const SOLANA_ADDRESS_RE = new RegExp(`\\b${SOLANA_ADDRESS_PATTERN}\\b`, 'g');

export function findSolanaAddresses(text) {
  return [...new Set(String(text ?? '').match(SOLANA_ADDRESS_RE) ?? [])];
}

export function looksLikeSolanaAddress(value) {
  return new RegExp(`^${SOLANA_ADDRESS_PATTERN}$`).test(String(value ?? ''));
}

export function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededNumber(seed, min, max) {
  const hash = hashString(seed);
  return min + (hash % (max - min + 1));
}

export function tokenSymbolFromAddress(ca) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const hash = hashString(ca);
  let symbol = '';
  for (let index = 0; index < 3; index += 1) {
    symbol += alphabet[(hash >> (index * 5)) % alphabet.length];
  }
  return `$${symbol}`;
}
