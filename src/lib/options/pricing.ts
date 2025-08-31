// src/lib/options/pricing.ts
// Black-Scholes options pricing with Greeks and spread pricing

import { PriceData } from '@/lib/data/equities';

export interface OptionParams {
  spot: number;           // Current stock price
  strike: number;         // Strike price
  timeToExpiry: number;   // Time to expiry in years
  riskFreeRate: number;   // Risk-free rate (annual)
  volatility: number;     // Implied volatility (annual)
  dividendYield?: number; // Dividend yield (annual)
}

export interface OptionPrice {
  call: number;
  put: number;
}

export interface Greeks {
  delta: number;    // Price sensitivity to underlying
  gamma: number;    // Delta sensitivity to underlying
  theta: number;    // Time decay (per day)
  vega: number;     // Volatility sensitivity
  rho: number;      // Interest rate sensitivity
}

export interface SpreadPrice {
  price: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  greeks: Greeks;
}

/**
 * Calculate Black-Scholes option prices
 */
export function priceOption(params: OptionParams): OptionPrice {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield = 0 } = params;
  
  if (timeToExpiry <= 0) {
    // At expiration
    return {
      call: Math.max(spot - strike, 0),
      put: Math.max(strike - spot, 0)
    };
  }
  
  const d1 = calculateD1(spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield);
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
  
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const NnegD1 = normalCDF(-d1);
  const NnegD2 = normalCDF(-d2);
  
  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  const dividendFactor = Math.exp(-dividendYield * timeToExpiry);
  
  const call = spot * dividendFactor * Nd1 - strike * discountFactor * Nd2;
  const put = strike * discountFactor * NnegD2 - spot * dividendFactor * NnegD1;
  
  return {
    call: Math.max(call, 0),
    put: Math.max(put, 0)
  };
}

/**
 * Calculate option Greeks
 */
export function calculateGreeks(params: OptionParams, isCall: boolean = true): Greeks {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield = 0 } = params;
  
  if (timeToExpiry <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  
  const d1 = calculateD1(spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield);
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
  
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const nd1 = normalPDF(d1);
  
  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  const dividendFactor = Math.exp(-dividendYield * timeToExpiry);
  const sqrtT = Math.sqrt(timeToExpiry);
  
  // Delta
  const callDelta = dividendFactor * Nd1;
  const putDelta = dividendFactor * (Nd1 - 1);
  const delta = isCall ? callDelta : putDelta;
  
  // Gamma (same for calls and puts)
  const gamma = (dividendFactor * nd1) / (spot * volatility * sqrtT);
  
  // Theta
  const term1 = -(spot * dividendFactor * nd1 * volatility) / (2 * sqrtT);
  const term2 = riskFreeRate * strike * discountFactor * (isCall ? Nd2 : normalCDF(-d2));
  const term3 = dividendYield * spot * dividendFactor * (isCall ? Nd1 : normalCDF(-d1));
  const theta = (term1 - term2 + term3) / 365; // Per day
  
  // Vega (same for calls and puts)
  const vega = spot * dividendFactor * nd1 * sqrtT / 100; // Per 1% vol change
  
  // Rho
  const callRho = strike * timeToExpiry * discountFactor * Nd2 / 100;
  const putRho = -strike * timeToExpiry * discountFactor * normalCDF(-d2) / 100;
  const rho = isCall ? callRho : putRho;
  
  return { delta, gamma, theta, vega, rho };
}

/**
 * Price vertical spread (bull call, bear put, etc.)
 */
export function priceVerticalSpread(
  longParams: OptionParams,
  shortParams: OptionParams,
  isCall: boolean = true
): SpreadPrice {
  
  const longPrice = priceOption(longParams);
  const shortPrice = priceOption(shortParams);
  
  const longGreeks = calculateGreeks(longParams, isCall);
  const shortGreeks = calculateGreeks(shortParams, isCall);
  
  const netPrice = (isCall ? longPrice.call - shortPrice.call : longPrice.put - shortPrice.put);
  const strikeWidth = Math.abs(longParams.strike - shortParams.strike);
  
  // For debit spreads
  const maxProfit = strikeWidth - Math.abs(netPrice);
  const maxLoss = Math.abs(netPrice);
  
  // Combined Greeks
  const greeks: Greeks = {
    delta: longGreeks.delta - shortGreeks.delta,
    gamma: longGreeks.gamma - shortGreeks.gamma,
    theta: longGreeks.theta - shortGreeks.theta,
    vega: longGreeks.vega - shortGreeks.vega,
    rho: longGreeks.rho - shortGreeks.rho
  };
  
  // Breakeven calculation (simplified)
  const breakeven = isCall 
    ? [longParams.strike + Math.abs(netPrice)]
    : [longParams.strike - Math.abs(netPrice)];
  
  return {
    price: netPrice,
    maxProfit,
    maxLoss,
    breakeven,
    greeks
  };
}

/**
 * Price iron condor spread
 */
export function priceIronCondor(
  putSpreadParams: { long: OptionParams; short: OptionParams },
  callSpreadParams: { long: OptionParams; short: OptionParams }
): SpreadPrice {
  
  const putSpread = priceVerticalSpread(putSpreadParams.long, putSpreadParams.short, false);
  const callSpread = priceVerticalSpread(callSpreadParams.long, callSpreadParams.short, true);
  
  const netCredit = -putSpread.price - callSpread.price; // Received premium
  const maxProfit = netCredit;
  const maxLoss = Math.max(
    Math.abs(putSpreadParams.long.strike - putSpreadParams.short.strike),
    Math.abs(callSpreadParams.long.strike - callSpreadParams.short.strike)
  ) - netCredit;
  
  // Combined Greeks
  const greeks: Greeks = {
    delta: putSpread.greeks.delta + callSpread.greeks.delta,
    gamma: putSpread.greeks.gamma + callSpread.greeks.gamma,
    theta: putSpread.greeks.theta + callSpread.greeks.theta,
    vega: putSpread.greeks.vega + callSpread.greeks.vega,
    rho: putSpread.greeks.rho + callSpread.greeks.rho
  };
  
  // Breakeven points
  const breakeven = [
    putSpreadParams.short.strike - netCredit,
    callSpreadParams.short.strike + netCredit
  ];
  
  return {
    price: netCredit,
    maxProfit,
    maxLoss,
    breakeven,
    greeks
  };
}

/**
 * Estimate implied volatility from historical price data
 */
export function estimateIVFromHistory(
  bars: PriceData[], 
  lookbackDays: number = 30,
  annualizationFactor: number = 252
): number {
  
  if (bars.length < lookbackDays + 1) {
    return 0.20; // Default 20% volatility
  }
  
  const recentBars = bars.slice(-lookbackDays - 1);
  const returns: number[] = [];
  
  // Calculate daily returns
  for (let i = 1; i < recentBars.length; i++) {
    const prevClose = recentBars[i - 1].ohlc.c;
    const currClose = recentBars[i].ohlc.c;
    const dailyReturn = Math.log(currClose / prevClose);
    returns.push(dailyReturn);
  }
  
  if (returns.length === 0) return 0.20;
  
  // Calculate standard deviation
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);
  
  // Annualize volatility
  const annualizedVol = dailyVol * Math.sqrt(annualizationFactor);
  
  // Apply volatility smile adjustment (higher for OTM options)
  const volSmileAdjustment = 1.1; // 10% increase for typical smile
  
  return Math.max(0.05, Math.min(2.0, annualizedVol * volSmileAdjustment));
}

/**
 * Calculate time to expiry in years from date strings
 */
export function calculateTimeToExpiry(currentDate: string, expiryDate: string): number {
  const current = new Date(currentDate);
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - current.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(0, diffDays / 365.25);
}

/**
 * Get risk-free rate (simplified - would normally fetch from treasury data)
 */
export function getRiskFreeRate(): number {
  return 0.05; // 5% default risk-free rate
}

// Helper functions
function calculateD1(
  spot: number, 
  strike: number, 
  timeToExpiry: number, 
  riskFreeRate: number, 
  volatility: number, 
  dividendYield: number = 0
): number {
  const numerator = Math.log(spot / strike) + (riskFreeRate - dividendYield + 0.5 * volatility * volatility) * timeToExpiry;
  const denominator = volatility * Math.sqrt(timeToExpiry);
  return numerator / denominator;
}

function normalCDF(x: number): number {
  // Approximation of cumulative standard normal distribution
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2.0);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
