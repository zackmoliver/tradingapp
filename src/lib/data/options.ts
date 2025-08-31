// src/lib/data/options.ts
// Implied volatility metrics: IV Rank, Term Structure, Skew

import { invoke } from '@/lib/tauri';
import { PriceData, getDailyBars } from './equities';
import { parseMMDDYYYY, toMMDDYYYY } from '@/lib/date';

export interface IvMetrics {
  ivRank: number;      // 0-100, percentile rank of current IV vs 1-year history
  term: number;        // Term structure slope: (IV_long - IV_short) / IV_short
  skew: number;        // Put/call skew: (OTM_put_IV - OTM_call_IV) / ATM_IV
  approx: boolean;     // True if estimated from historical vol, false if real options data
  confidence: number;  // 0-1, confidence in the metrics
}

interface PolygonOptionsResponse {
  status: string;
  results?: {
    underlying_ticker: string;
    implied_volatility?: number;
    delta?: number;
    strike_price: number;
    expiration_date: string;
    option_type: 'call' | 'put';
  }[];
}

/**
 * Get implied volatility metrics for a symbol on a specific date
 */
export async function getIvMetrics(symbol: string, asOfDate: string): Promise<IvMetrics> {
  try {
    // Try to get real options data first
    const realMetrics = await getRealIvMetrics(symbol, asOfDate);
    if (realMetrics) {
      return realMetrics;
    }

    // Fallback to estimated metrics from historical volatility
    console.log(`📊 Using historical volatility proxy for ${symbol} IV metrics`);
    return await getEstimatedIvMetrics(symbol, asOfDate);

  } catch (error) {
    console.error(`Error getting IV metrics for ${symbol}:`, error);
    
    // Return default metrics on error
    return {
      ivRank: 50,
      term: 0,
      skew: 0,
      approx: true,
      confidence: 0.3
    };
  }
}

/**
 * Attempt to get real options data from Polygon
 */
async function getRealIvMetrics(symbol: string, asOfDate: string): Promise<IvMetrics | null> {
  try {
    const polygonKey = import.meta.env.VITE_POLYGON_KEY;
    if (!polygonKey) {
      return null;
    }

    // Get options chain for the symbol
    const response = await invoke<PolygonOptionsResponse>('fetch_option_chain', {
      symbol: symbol.toUpperCase(),
      date: asOfDate
    });

    if (response.status !== 'OK' || !response.results || response.results.length === 0) {
      return null;
    }

    const options = response.results;
    
    // Calculate IV metrics from real options data
    const ivRank = calculateIvRank(options);
    const term = calculateTermStructure(options);
    const skew = calculateSkew(options);

    return {
      ivRank,
      term,
      skew,
      approx: false,
      confidence: 0.9
    };

  } catch (error) {
    console.log('Real options data not available, using estimates');
    return null;
  }
}

/**
 * Estimate IV metrics from historical price volatility
 */
async function getEstimatedIvMetrics(symbol: string, asOfDate: string): Promise<IvMetrics> {
  try {
    // Get 1 year of historical data for volatility calculation
    const endDate = parseMMDDYYYY(asOfDate) || new Date();
    const startDate = new Date(endDate);
    startDate.setFullYear(endDate.getFullYear() - 1);

    const historicalData = await getDailyBars(
      symbol,
      toMMDDYYYY(startDate),
      toMMDDYYYY(endDate)
    );

    if (historicalData.length < 50) {
      throw new Error('Insufficient historical data for volatility estimation');
    }

    // Calculate realized volatility metrics
    const realizedVols = calculateRealizedVolatilities(historicalData);
    const currentVol = realizedVols[realizedVols.length - 1];
    
    // Estimate IV rank from realized vol percentile
    const ivRank = calculateVolatilityPercentile(currentVol, realizedVols);
    
    // Estimate term structure (typically upward sloping in normal markets)
    const term = estimateTermStructure(realizedVols, symbol);
    
    // Estimate skew (puts typically more expensive than calls)
    const skew = estimateSkew(realizedVols, symbol);

    return {
      ivRank,
      term,
      skew,
      approx: true,
      confidence: 0.6
    };

  } catch (error) {
    console.error('Error estimating IV metrics:', error);
    
    // Return market-typical defaults
    return {
      ivRank: 45,  // Slightly below median
      term: 0.15,  // Mild contango
      skew: -0.1,  // Slight put skew
      approx: true,
      confidence: 0.3
    };
  }
}

/**
 * Calculate realized volatilities from price data
 */
function calculateRealizedVolatilities(data: PriceData[], window: number = 20): number[] {
  const returns = [];
  
  // Calculate daily returns
  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].ohlc.c;
    const currClose = data[i].ohlc.c;
    const dailyReturn = Math.log(currClose / prevClose);
    returns.push(dailyReturn);
  }

  // Calculate rolling volatility
  const volatilities = [];
  for (let i = window - 1; i < returns.length; i++) {
    const windowReturns = returns.slice(i - window + 1, i + 1);
    const mean = windowReturns.reduce((sum, r) => sum + r, 0) / window;
    const variance = windowReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (window - 1);
    const volatility = Math.sqrt(variance * 252); // Annualized
    volatilities.push(volatility);
  }

  return volatilities;
}

/**
 * Calculate volatility percentile rank
 */
function calculateVolatilityPercentile(currentVol: number, historicalVols: number[]): number {
  const sorted = [...historicalVols].sort((a, b) => a - b);
  const rank = sorted.findIndex(vol => vol >= currentVol);
  return Math.round((rank / sorted.length) * 100);
}

/**
 * Estimate term structure from historical volatility patterns
 */
function estimateTermStructure(volatilities: number[], symbol: string): number {
  // Get recent volatility trend
  const recent = volatilities.slice(-10);
  const older = volatilities.slice(-30, -10);
  
  const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
  const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;
  
  // Estimate term structure based on volatility trend and symbol characteristics
  let baseSlope = (recentAvg - olderAvg) / olderAvg;
  
  // Adjust for symbol characteristics
  if (symbol === 'SPY' || symbol === 'QQQ') {
    baseSlope *= 0.8; // Index ETFs typically have flatter term structure
  }
  
  // Clamp to reasonable range
  return Math.max(-0.5, Math.min(0.5, baseSlope));
}

/**
 * Estimate put/call skew from volatility characteristics
 */
function estimateSkew(volatilities: number[], symbol: string): number {
  // Calculate volatility of volatility (vol of vol)
  const volChanges = [];
  for (let i = 1; i < volatilities.length; i++) {
    volChanges.push(volatilities[i] - volatilities[i - 1]);
  }
  
  const volOfVol = Math.sqrt(
    volChanges.reduce((sum, change) => sum + change * change, 0) / volChanges.length
  );
  
  // Higher vol of vol typically means more negative skew
  let skew = -volOfVol * 2;
  
  // Adjust for symbol characteristics
  if (symbol === 'SPY' || symbol === 'QQQ') {
    skew *= 1.2; // Index ETFs typically have more pronounced put skew
  }
  
  // Clamp to reasonable range
  return Math.max(-0.3, Math.min(0.1, skew));
}

/**
 * Calculate IV rank from real options data
 */
function calculateIvRank(options: any[]): number {
  // This would need historical IV data to calculate properly
  // For now, return a reasonable estimate based on current IV levels
  const avgIv = options.reduce((sum, opt) => sum + (opt.implied_volatility || 0.2), 0) / options.length;
  
  // Rough mapping of IV to percentile (would need historical data for accuracy)
  if (avgIv < 0.15) return 20;
  if (avgIv < 0.25) return 40;
  if (avgIv < 0.35) return 60;
  if (avgIv < 0.45) return 80;
  return 90;
}

/**
 * Calculate term structure from real options data
 */
function calculateTermStructure(options: any[]): number {
  // Group by expiration and calculate average IV
  const expirationGroups: { [key: string]: number[] } = {};
  
  options.forEach(opt => {
    if (!expirationGroups[opt.expiration_date]) {
      expirationGroups[opt.expiration_date] = [];
    }
    expirationGroups[opt.expiration_date].push(opt.implied_volatility || 0.2);
  });
  
  // Calculate average IV for each expiration
  const expirationIvs = Object.entries(expirationGroups).map(([date, ivs]) => ({
    date,
    avgIv: ivs.reduce((sum, iv) => sum + iv, 0) / ivs.length
  }));
  
  if (expirationIvs.length < 2) return 0;
  
  // Sort by expiration date
  expirationIvs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Calculate slope between shortest and longest expiration
  const shortIv = expirationIvs[0].avgIv;
  const longIv = expirationIvs[expirationIvs.length - 1].avgIv;
  
  return (longIv - shortIv) / shortIv;
}

/**
 * Calculate put/call skew from real options data
 */
function calculateSkew(options: any[]): number {
  const calls = options.filter(opt => opt.option_type === 'call');
  const puts = options.filter(opt => opt.option_type === 'put');
  
  if (calls.length === 0 || puts.length === 0) return 0;
  
  // Find OTM options (rough approximation)
  const avgCallIv = calls.reduce((sum, opt) => sum + (opt.implied_volatility || 0.2), 0) / calls.length;
  const avgPutIv = puts.reduce((sum, opt) => sum + (opt.implied_volatility || 0.2), 0) / puts.length;
  
  // Calculate skew as difference normalized by average
  const avgIv = (avgCallIv + avgPutIv) / 2;
  return (avgPutIv - avgCallIv) / avgIv;
}

/**
 * Get VIX-like volatility index for market regime detection
 */
export async function getVolatilityIndex(asOfDate: string): Promise<number> {
  try {
    // Try to get VIX data
    const vixData = await getDailyBars('VIX', asOfDate, asOfDate);
    if (vixData.length > 0) {
      return vixData[0].ohlc.c;
    }
    
    // Fallback: estimate from SPY volatility
    const spyMetrics = await getIvMetrics('SPY', asOfDate);
    return spyMetrics.ivRank * 0.4; // Rough VIX approximation
    
  } catch (error) {
    console.error('Error getting volatility index:', error);
    return 20; // Default VIX-like value
  }
}
