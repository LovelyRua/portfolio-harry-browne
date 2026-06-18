type ValidationResult<T> = { ok: true; value: T } | { ok: false; details: string[] };

export function validateAuth(value: unknown): ValidationResult<{ email: string; password: string }> {
  if (!isObject(value)) return invalid('Body must be an object');
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const password = typeof value.password === 'string' ? value.password : '';
  const details: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) details.push('Email is invalid');
  if (password.length < 10 || password.length > 128) details.push('Password must contain 10 to 128 characters');
  if (!/[a-z]/u.test(password) || !/[A-Z]/u.test(password) || !/[0-9]/u.test(password)) {
    details.push('Password requires uppercase, lowercase, and numeric characters');
  }
  return details.length ? { ok: false, details } : { ok: true, value: { email, password } };
}

export function validateUpload(value: unknown): ValidationResult<{ payload: Record<string, unknown> }> {
  if (!isObject(value) || !isObject(value.payload)) return invalid('payload must be an object');
  const payload = value.payload;
  const details: string[] = [];
  if (!Array.isArray(payload.assets)) details.push('assets must be an array');
  if (!isObject(payload.exchangeRates)) details.push('exchangeRates must be an object');
  if (!isObject(payload.targetAllocations)) details.push('targetAllocations must be an object');
  if (typeof payload.baseCurrency !== 'string' || payload.baseCurrency.length < 3 || payload.baseCurrency.length > 8) {
    details.push('baseCurrency is invalid');
  }
  if (Array.isArray(payload.assets)) {
    if (payload.assets.length > 2_000) details.push('assets exceeds the 2,000 item limit');
    for (const asset of payload.assets.slice(0, 2_001)) {
      if (!isObject(asset)
        || typeof asset.id !== 'string'
        || typeof asset.name !== 'string'
        || !['Stocks', 'Bonds', 'Gold', 'Cash'].includes(String(asset.category))
        || typeof asset.currency !== 'string'
        || typeof asset.amount !== 'number'
        || !Number.isFinite(asset.amount)
        || asset.amount < 0) {
        details.push('assets contains an invalid item');
        break;
      }
    }
  }
  return details.length ? { ok: false, details } : { ok: true, value: { payload } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(detail: string): ValidationResult<never> {
  return { ok: false, details: [detail] };
}
