import { invoke } from './tauri';

// Types matching the Rust backend
export interface HistoryPoint {
  date: string;  // MM/DD/YYYY format
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionContract {
  symbol: string;
  strike: number;
  expiry: string;  // MM/DD/YYYY format
  option_type: string;  // "call" or "put"
  last_price?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  open_interest?: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface OptionChain {
  underlying_symbol: string;
  as_of_date: string;  // MM/DD/YYYY format
  expiry_dates: string[];  // MM/DD/YYYY format
  strikes: number[];
  contracts: Record<string, OptionContract>;  // key: contract symbol
}

export interface OptionQuote {
  contract_symbol: string;
  last_price?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  open_interest?: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  timestamp: string;  // ISO format
}

export interface IDataError {
  message: string;
  code?: string;
  retryAfter?: number;  // seconds
}

/**
 * Fetch historical price data for a symbol
 */
export async function getHistory(
  symbol: string,
  startDate: string,  // MM/DD/YYYY
  endDate: string,    // MM/DD/YYYY
  interval: string = '1day'
): Promise<HistoryPoint[]> {
  try {
    const result = await invoke<HistoryPoint[]>('fetch_history', {
      symbol: symbol.toUpperCase(),
      start: startDate,
      end: endDate,
      interval,
    });
    return result;
  } catch (error) {
    throw new DataError({
      message: error as string,
      code: 'FETCH_HISTORY_ERROR',
    });
  }
}

/**
 * Fetch option chain for a symbol
 */
export async function getOptionChain(
  symbol: string,
  asOf: string  // MM/DD/YYYY
): Promise<OptionChain> {
  try {
    const result = await invoke<OptionChain>('fetch_option_chain', {
      symbol: symbol.toUpperCase(),
      asOf,
    });
    return result;
  } catch (error) {
    throw new DataError({
      message: error as string,
      code: 'FETCH_OPTION_CHAIN_ERROR',
    });
  }
}

/**
 * Fetch option quotes for specific contracts
 */
export async function getOptionQuotes(
  contracts: string[]
): Promise<OptionQuote[]> {
  try {
    const result = await invoke<OptionQuote[]>('fetch_option_quotes', {
      contracts,
    });
    return result;
  } catch (error) {
    throw new DataError({
      message: error as string,
      code: 'FETCH_OPTION_QUOTES_ERROR',
    });
  }
}

/**
 * Store API key in system keychain
 */
export async function storeApiKey(
  service: string,
  key: string
): Promise<void> {
  try {
    await invoke('store_api_key', {
      service,
      key,
    });
  } catch (error) {
    throw new DataError({
      message: error as string,
      code: 'STORE_API_KEY_ERROR',
    });
  }
}

/**
 * Test API connection
 */
export async function testApiConnection(): Promise<string> {
  try {
    const result = await invoke<string>('test_api_connection');
    return result;
  } catch (error) {
    throw new DataError({
      message: error as string,
      code: 'TEST_CONNECTION_ERROR',
    });
  }
}

/**
 * Utility function to format date for API calls
 */
export function formatDateForApi(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Utility function to parse MM/DD/YYYY date string
 */
export function parseApiDate(dateString: string): Date {
  const [month, day, year] = dateString.split('/').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Utility function to validate date format
 */
export function isValidDateFormat(dateString: string): boolean {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(dateString)) {
    return false;
  }
  
  try {
    const date = parseApiDate(dateString);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Get current date in MM/DD/YYYY format
 */
export function getCurrentDate(): string {
  return formatDateForApi(new Date());
}

/**
 * Get date N days ago in MM/DD/YYYY format
 */
export function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDateForApi(date);
}

/**
 * Check if error indicates missing API key
 */
export function isApiKeyError(error: unknown): boolean {
  if (error instanceof DataError) {
    return error.message.toLowerCase().includes('api key');
  }
  if (typeof error === 'string') {
    return error.toLowerCase().includes('api key');
  }
  return false;
}

/**
 * Check if error indicates rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof DataError) {
    return error.message.toLowerCase().includes('rate limit');
  }
  if (typeof error === 'string') {
    return error.toLowerCase().includes('rate limit');
  }
  return false;
}

/**
 * Extract retry delay from rate limit error
 */
export function getRetryDelay(error: unknown): number | null {
  if (error instanceof DataError && error.retryAfter) {
    return error.retryAfter;
  }
  if (typeof error === 'string') {
    const match = error.match(/(\d+)\s*seconds?/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

// Custom error class
export class DataError extends Error {
  code?: string;
  retryAfter?: number;

  constructor(options: { message: string; code?: string; retryAfter?: number }) {
    super(options.message);
    this.name = 'DataError';
    this.code = options.code;
    this.retryAfter = options.retryAfter;
  }
}
