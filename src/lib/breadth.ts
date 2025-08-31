// src/lib/breadth.ts
// Market breadth metrics computation

import { sma, extractClosePrices, PriceData } from './indicators';

export interface BreadthMetrics {
  pct_above_200dma: number;
  rsp_spy_ratio_slope: number;
  ad_line_slope: number;
}

// Default watchlist for breadth calculation
const DEFAULT_WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX',
  'JPM', 'JNJ', 'V', 'PG', 'UNH', 'HD', 'MA', 'DIS', 'PYPL', 'ADBE',
  'CRM', 'INTC', 'CMCSA', 'VZ', 'KO', 'PFE', 'PEP', 'T', 'ABT', 'MRK',
  'WMT', 'BAC', 'XOM', 'CVX', 'LLY', 'TMO', 'COST', 'ABBV', 'ACN', 'MDT'
];

export class BreadthCalculator {
  private cachedData: Map<string, PriceData[]> = new Map();
  
  constructor(private fetchHistoryFn: (symbol: string, start: string, end: string) => Promise<PriceData[]>) {}

  async calculateBreadthMetrics(
    endDate: string = new Date().toLocaleDateString('en-US'),
    lookbackDays: number = 252,
    watchlist: string[] = DEFAULT_WATCHLIST
  ): Promise<BreadthMetrics> {
    try {
      // Calculate start date
      const end = new Date(endDate);
      const start = new Date(end);
      start.setDate(start.getDate() - lookbackDays);
      const startDate = start.toLocaleDateString('en-US');

      // Fetch data for all symbols in parallel
      const dataPromises = watchlist.map(async (symbol) => {
        try {
          const data = await this.fetchHistoryFn(symbol, startDate, endDate);
          this.cachedData.set(symbol, data);
          return { symbol, data };
        } catch (error) {
          console.warn(`Failed to fetch data for ${symbol}:`, error);
          return { symbol, data: [] };
        }
      });

      const results = await Promise.all(dataPromises);
      const validResults = results.filter(r => r.data.length > 0);

      if (validResults.length === 0) {
        return this.getFallbackMetrics();
      }

      // Calculate percentage above 200-day MA
      const pct_above_200dma = this.calculatePctAbove200DMA(validResults);

      // Calculate RSP/SPY ratio slope (if we have both)
      const rsp_spy_ratio_slope = await this.calculateRSPSPYSlope(startDate, endDate);

      // Calculate A/D line slope (simplified version)
      const ad_line_slope = this.calculateADLineSlope(validResults);

      return {
        pct_above_200dma,
        rsp_spy_ratio_slope,
        ad_line_slope
      };

    } catch (error) {
      console.error('Error calculating breadth metrics:', error);
      return this.getFallbackMetrics();
    }
  }

  private calculatePctAbove200DMA(results: Array<{ symbol: string; data: PriceData[] }>): number {
    let aboveCount = 0;
    let totalCount = 0;

    for (const { data } of results) {
      if (data.length < 200) continue; // Need at least 200 days for 200-day MA
      
      const prices = extractClosePrices(data);
      const sma200 = sma(prices, 200);
      
      // Check if current price is above 200-day MA
      const currentPrice = prices[prices.length - 1];
      const current200MA = sma200[sma200.length - 1];
      
      if (!isNaN(current200MA) && currentPrice > current200MA) {
        aboveCount++;
      }
      totalCount++;
    }

    return totalCount > 0 ? aboveCount / totalCount : 0.5; // Default to neutral
  }

  private async calculateRSPSPYSlope(startDate: string, endDate: string): Promise<number> {
    try {
      // Fetch RSP (equal-weight S&P 500) and SPY data
      const [rspData, spyData] = await Promise.all([
        this.fetchHistoryFn('RSP', startDate, endDate).catch(() => []),
        this.fetchHistoryFn('SPY', startDate, endDate).catch(() => [])
      ]);

      if (rspData.length === 0 || spyData.length === 0) {
        return 0; // Neutral if we can't get data
      }

      // Calculate ratio and its slope
      const minLength = Math.min(rspData.length, spyData.length);
      const ratios: number[] = [];
      
      for (let i = 0; i < minLength; i++) {
        const rspPrice = rspData[i].ohlc.c;
        const spyPrice = spyData[i].ohlc.c;
        if (spyPrice > 0) {
          ratios.push(rspPrice / spyPrice);
        }
      }

      if (ratios.length < 20) return 0;

      // Calculate slope of last 20 days
      const recentRatios = ratios.slice(-20);
      return this.calculateSlope(recentRatios);

    } catch (error) {
      console.warn('Error calculating RSP/SPY slope:', error);
      return 0;
    }
  }

  private calculateADLineSlope(results: Array<{ symbol: string; data: PriceData[] }>): number {
    // Simplified A/D line calculation
    // In reality, this would use actual advance/decline data from exchanges
    
    const dailyAdvances: number[] = [];
    const maxLength = Math.max(...results.map(r => r.data.length));
    
    for (let day = 1; day < maxLength; day++) {
      let advances = 0;
      let declines = 0;
      
      for (const { data } of results) {
        if (day < data.length && day > 0) {
          const currentPrice = data[day].ohlc.c;
          const previousPrice = data[day - 1].ohlc.c;
          
          if (currentPrice > previousPrice) {
            advances++;
          } else if (currentPrice < previousPrice) {
            declines++;
          }
        }
      }
      
      const netAdvances = advances - declines;
      dailyAdvances.push(netAdvances);
    }

    if (dailyAdvances.length < 20) return 0;

    // Calculate cumulative A/D line
    const adLine: number[] = [];
    let cumulative = 0;
    
    for (const netAdvance of dailyAdvances) {
      cumulative += netAdvance;
      adLine.push(cumulative);
    }

    // Calculate slope of last 20 days
    const recentADLine = adLine.slice(-20);
    return this.calculateSlope(recentADLine);
  }

  private calculateSlope(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const xSum = (n * (n - 1)) / 2; // Sum of 0, 1, 2, ..., n-1
    const ySum = values.reduce((a, b) => a + b, 0);
    const xySum = values.reduce((sum, y, x) => sum + x * y, 0);
    const xxSum = values.reduce((sum, _, x) => sum + x * x, 0);
    
    const slope = (n * xySum - xSum * ySum) / (n * xxSum - xSum * xSum);
    
    // Normalize slope to reasonable range (-1 to 1)
    return Math.max(-1, Math.min(1, slope / 10));
  }

  private getFallbackMetrics(): BreadthMetrics {
    // Return neutral/slightly positive metrics as fallback
    return {
      pct_above_200dma: 0.55,
      rsp_spy_ratio_slope: 0.02,
      ad_line_slope: 0.01
    };
  }

  // Get cached data for a symbol
  getCachedData(symbol: string): PriceData[] | undefined {
    return this.cachedData.get(symbol);
  }

  // Clear cache
  clearCache(): void {
    this.cachedData.clear();
  }

  // Get summary of breadth metrics for display
  getBreadthSummary(metrics: BreadthMetrics): {
    overall: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
    details: Array<{ metric: string; value: string; status: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' }>;
  } {
    const details = [
      {
        metric: '% Above 200-day MA',
        value: `${(metrics.pct_above_200dma * 100).toFixed(1)}%`,
        status: (metrics.pct_above_200dma > 0.6 ? 'POSITIVE' :
                metrics.pct_above_200dma < 0.4 ? 'NEGATIVE' : 'NEUTRAL') as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
      },
      {
        metric: 'RSP/SPY Slope',
        value: metrics.rsp_spy_ratio_slope.toFixed(3),
        status: (metrics.rsp_spy_ratio_slope > 0.01 ? 'POSITIVE' :
                metrics.rsp_spy_ratio_slope < -0.01 ? 'NEGATIVE' : 'NEUTRAL') as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
      },
      {
        metric: 'A/D Line Slope',
        value: metrics.ad_line_slope.toFixed(3),
        status: (metrics.ad_line_slope > 0.01 ? 'POSITIVE' :
                metrics.ad_line_slope < -0.01 ? 'NEGATIVE' : 'NEUTRAL') as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
      }
    ];

    // Calculate overall sentiment
    const positiveCount = details.filter(d => d.status === 'POSITIVE').length;
    const negativeCount = details.filter(d => d.status === 'NEGATIVE').length;
    
    let overall: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
    if (positiveCount >= 2) {
      overall = 'BULLISH';
    } else if (negativeCount >= 2) {
      overall = 'BEARISH';
    } else {
      overall = 'NEUTRAL';
    }

    return { overall, details };
  }
}
