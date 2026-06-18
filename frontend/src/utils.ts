import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency: string = 'USD', compact: boolean = false) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      notation: compact ? 'compact' : 'standard',
      compactDisplay: 'short'
    }).format(value);
  } catch (e) {
    // Fallback for custom currencies like "CRYPTO"
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      notation: compact ? 'compact' : 'standard',
      compactDisplay: 'short'
    }).format(value) + ' ' + currency;
  }
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function parseAmount(value: string | number): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  const cleanValue = value.trim().toLowerCase().replace(/,/g, '');
  const match = cleanValue.match(/^([\d.]+)([kmbt]?)$/);

  if (!match) {
    const parsed = Number(cleanValue);
    return isNaN(parsed) ? 0 : parsed;
  }

  const num = Number(match[1]);
  const suffix = match[2];

  if (isNaN(num)) return 0;

  switch (suffix) {
    case 'k': return num * 1000;
    case 'm': return num * 1000000;
    case 'b': return num * 1000000000;
    case 't': return num * 1000000000000;
    default: return num;
  }
}
