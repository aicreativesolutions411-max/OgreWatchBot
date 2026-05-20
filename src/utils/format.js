export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function usd(value, maximumFractionDigits = 0) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits
  }).format(amount);
}

export function sol(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0 SOL';
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} SOL`;
}

export function percent(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0%';
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

export function compactAddress(value, head = 4, tail = 4) {
  const text = String(value ?? '');
  if (text.length <= head + tail + 3) return text;
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

export function minutesAgo(minutes) {
  return `${minutes}m old`;
}

export function linkFromTemplate(template, ca) {
  return template.replaceAll('{ca}', encodeURIComponent(ca));
}

export function nowIso() {
  return new Date().toISOString();
}
