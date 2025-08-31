// src/lib/date.ts
import { format, parse } from 'date-fns';

/** True if a Date is valid */
function isValidDate(d: Date) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** Parse MM/DD/YYYY into a Date. Accepts minor separators (- or /). */
export function parseMMDDYYYY(input: string): Date {
  if (!input) return new Date(NaN);

  // Normalize: 1-1-2023 -> 01/01/2023
  const norm = input
    .trim()
    .replace(/-/g, '/')
    .replace(/\s+/g, '');

  const parsed = parse(norm, 'MM/dd/yyyy', new Date());
  return isValidDate(parsed) ? parsed : new Date(NaN);
}

/** Format a Date as MM/DD/YYYY. Returns '' if invalid. */
export function toMMDDYYYY(date: Date): string {
  return isValidDate(date) ? format(date, 'MM/dd/yyyy') : '';
}

/** Percentage helper: 0.3159 -> '31.59%' */
export function toPct(n: number, digits = 2): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

/** Currency helper (USD) */
export function toMoney(n: number, digits = 2): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}
/**
 * Returns a safe label for a date-like value.
 * If invalid or empty, returns '—' instead.
 */
export function safeDateLabel(value: string | Date | undefined | null): string {
  if (!value) return '—';

  if (value instanceof Date) {
    return toMMDDYYYY(value) || '—';
  }

  const d = parseMMDDYYYY(value);
  return toMMDDYYYY(d) || '—';
}

/** Chart tick formatter for Recharts */
export function chartTickFormatter(value: number): string {
  return toMMDDYYYY(new Date(value));
}

/** Normalize date string to MM/DD/YYYY format */
export function normalizeToMMDDYYYY(input: string): string {
  const parsed = parseMMDDYYYY(input);
  return toMMDDYYYY(parsed);
}

/** Sanitize equity curve data for charts */
export function sanitizeEquityCurveData(data: any[]): { date: Date; value: number }[] {
  return data
    .filter(d => d && typeof d === 'object')
    .map(d => ({
      date: d.t ? parseMMDDYYYY(d.t) : new Date(d.date || Date.now()),
      value: typeof d.equity === 'number' ? d.equity : (typeof d.value === 'number' ? d.value : 0)
    }))
    .filter(d => !isNaN(d.date.getTime()) && !isNaN(d.value));
}
