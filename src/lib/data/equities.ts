// src/lib/data/equities.ts
// Unified equities data fetching with Polygon → yfinance fallback

import { invoke } from '@/lib/tauri';
import { parseMMDDYYYY, toMMDDYYYY } from '@/lib/date';

// Unified price data type for all modules
export interface PriceData {
  ts: Date;
  ohlc: {
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
    v: number;  // volume
  };
}

// Raw Polygon API response structure
interface PolygonBar {
  t: number;  // timestamp (ms)
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

interface PolygonResponse {
  status: string;
  results?: PolygonBar[];
  resultsCount?: number;
  adjusted?: boolean;
}

// Raw yfinance response structure
interface YFinanceBar {
  date: string;  // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface YFinanceResponse {
  symbol: string;
  data: YFinanceBar[];
}

/**
 * Fetch daily OHLCV bars for a symbol over a date range
 * Uses Polygon API first, falls back to yfinance if needed
 */
export async function getDailyBars(
  symbol: string, 
  startDate: string,  // MM/DD/YYYY
  endDate: string     // MM/DD/YYYY
): Promise<PriceData[]> {
  console.log(`📊 Fetching daily bars for ${symbol} from ${startDate} to ${endDate}`);
  
  try {
    // Try Polygon first
    const polygonData = await fetchFromPolygon(symbol, startDate, endDate);
    if (polygonData.length > 0) {
      console.log(`✅ Polygon: Retrieved ${polygonData.length} bars for ${symbol}`);
      return polygonData;
    }
    
    console.log(`⚠️ Polygon returned no data, trying yfinance fallback...`);
    
    // Fallback to yfinance
    const yfinanceData = await fetchFromYFinance(symbol, startDate, endDate);
    if (yfinanceData.length > 0) {
      console.log(`✅ yfinance: Retrieved ${yfinanceData.length} bars for ${symbol}`);
      return yfinanceData;
    }
    
    console.warn(`❌ No data available from either source for ${symbol}`);
    return [];
    
  } catch (error) {
    console.error(`❌ Error fetching data for ${symbol}:`, error);
    return [];
  }
}

/**
 * Fetch data from Polygon API
 */
async function fetchFromPolygon(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<PriceData[]> {
  try {
    const polygonKey = import.meta.env.VITE_POLYGON_KEY;
    if (!polygonKey) {
      console.log('🔑 No Polygon API key found, skipping Polygon fetch');
      return [];
    }

    // Convert MM/DD/YYYY to YYYY-MM-DD for Polygon API
    const start = parseMMDDYYYY(startDate);
    const end = parseMMDDYYYY(endDate);
    
    if (!start || !end) {
      throw new Error(`Invalid date format: ${startDate} or ${endDate}`);
    }

    const startISO = start.toISOString().split('T')[0];
    const endISO = end.toISOString().split('T')[0];

    // Call Tauri backend to fetch from Polygon
    const response = await invoke<PolygonResponse>('fetch_polygon_bars', {
      symbol: symbol.toUpperCase(),
      from: startISO,
      to: endISO,
      apikey: polygonKey
    });

    if (response.status !== 'OK' || !response.results) {
      console.log(`📊 Polygon API returned status: ${response.status}`);
      return [];
    }

    // Convert Polygon format to PriceData
    return response.results.map(bar => ({
      ts: new Date(bar.t),
      ohlc: {
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v
      }
    }));

  } catch (error) {
    console.error('Polygon fetch error:', error);
    return [];
  }
}

/**
 * Fetch data from yfinance (fallback)
 */
async function fetchFromYFinance(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<PriceData[]> {
  try {
    // Convert MM/DD/YYYY to YYYY-MM-DD for yfinance
    const start = parseMMDDYYYY(startDate);
    const end = parseMMDDYYYY(endDate);
    
    if (!start || !end) {
      throw new Error(`Invalid date format: ${startDate} or ${endDate}`);
    }

    const startISO = start.toISOString().split('T')[0];
    const endISO = end.toISOString().split('T')[0];

    // Call Tauri backend to fetch from yfinance
    const response = await invoke<YFinanceResponse>('fetch_history_yahoo', {
      symbol: symbol.toUpperCase(),
      start: startISO,
      end: endISO
    });

    if (!response.data || response.data.length === 0) {
      console.log(`📊 yfinance returned no data for ${symbol}`);
      return [];
    }

    // Convert yfinance format to PriceData
    return response.data.map(bar => ({
      ts: new Date(bar.date),
      ohlc: {
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume
      }
    }));

  } catch (error) {
    console.error('yfinance fetch error:', error);
    return [];
  }
}

/**
 * Get the most recent trading day's data
 */
export async function getLatestBar(symbol: string): Promise<PriceData | null> {
  const endDate = toMMDDYYYY(new Date());
  const startDate = toMMDDYYYY(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // 7 days ago
  
  const bars = await getDailyBars(symbol, startDate, endDate);
  return bars.length > 0 ? bars[bars.length - 1] : null;
}

/**
 * Validate that we have sufficient data for analysis
 */
export function validateDataSufficiency(
  data: PriceData[], 
  minBars: number = 20
): { isValid: boolean; message?: string } {
  if (data.length === 0) {
    return {
      isValid: false,
      message: 'No market data available for the selected date range.'
    };
  }
  
  if (data.length < minBars) {
    return {
      isValid: false,
      message: `Insufficient data: Only ${data.length} trading days found. At least ${minBars} days recommended for reliable analysis.`
    };
  }
  
  return { isValid: true };
}

/**
 * Get data for multiple symbols (batch fetch)
 */
export async function getMultipleSymbolData(
  symbols: string[],
  startDate: string,
  endDate: string
): Promise<Record<string, PriceData[]>> {
  const results: Record<string, PriceData[]> = {};
  
  // Fetch data for each symbol
  const promises = symbols.map(async (symbol) => {
    const data = await getDailyBars(symbol, startDate, endDate);
    return { symbol, data };
  });
  
  const responses = await Promise.all(promises);
  
  // Build results object
  responses.forEach(({ symbol, data }) => {
    results[symbol] = data;
  });
  
  return results;
}
