// src/lib/execution/router.ts
// Dry-run execution router with slippage modeling

import { 
  Order, 
  MultiLegOrder, 
  Fill, 
  ExecutionSummary, 
  QuoteData, 
  SlippageModel, 
  ExecutionConfig,
  OrderStatus,
  generateFillId,
  calculateNotionalValue
} from './types';

// Default execution configuration
const DEFAULT_CONFIG: ExecutionConfig = {
  defaultRoute: 'DRY_RUN',
  slippageModel: {
    enabled: true,
    bidAskSpreadFactor: 0.5,      // Fill at mid + 50% of spread
    marketImpactFactor: 0.0001,   // 1 basis point per $10k notional
    volatilityFactor: 0.0002,     // 2 basis points in high vol
    minSlippage: 0.0001,          // 1 basis point minimum
    maxSlippage: 0.01,            // 100 basis points maximum
  },
  commissions: {
    stock: 0.005,                 // $0.005 per share
    option: 0.65,                 // $0.65 per contract
    minimum: 1.00,                // $1.00 minimum
  },
  fees: {
    regulatory: 0.0000221,        // SEC fee
    exchange: 0.0000300,          // Exchange fee
    clearing: 0.0000200,          // Clearing fee
  }
};

export class ExecutionRouter {
  private config: ExecutionConfig;
  private mockQuotes: Map<string, QuoteData> = new Map();

  constructor(config?: Partial<ExecutionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeMockQuotes();
  }

  private initializeMockQuotes() {
    // Initialize with some mock quotes for common symbols
    const mockSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY', 'QQQ'];
    
    mockSymbols.forEach(symbol => {
      const basePrice = this.getBasePriceForSymbol(symbol);
      const spread = basePrice * 0.001; // 0.1% spread
      
      this.mockQuotes.set(symbol, {
        symbol,
        bid: basePrice - spread / 2,
        ask: basePrice + spread / 2,
        last: basePrice,
        bidSize: 1000,
        askSize: 1000,
        timestamp: Date.now(),
      });
    });
  }

  private getBasePriceForSymbol(symbol: string): number {
    // Mock base prices for common symbols
    const prices: Record<string, number> = {
      'AAPL': 175.00,
      'MSFT': 350.00,
      'GOOGL': 140.00,
      'TSLA': 200.00,
      'SPY': 450.00,
      'QQQ': 380.00,
    };
    return prices[symbol] || 100.00;
  }

  public updateQuote(quote: QuoteData): void {
    this.mockQuotes.set(quote.symbol, quote);
  }

  public getQuote(symbol: string): QuoteData | null {
    return this.mockQuotes.get(symbol) || null;
  }

  public async dryRunExecute(order: Order): Promise<ExecutionSummary> {
    const startTime = Date.now();
    
    // Get or create mock quote
    let quote = this.getQuote(order.symbol);
    if (!quote) {
      quote = this.createMockQuote(order.symbol);
      this.updateQuote(quote);
    }

    // Calculate execution price with slippage
    const executionResult = this.calculateExecutionPrice(order, quote);
    
    // Create fill
    const fill: Fill = {
      id: generateFillId(),
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: executionResult.fillPrice,
      timestamp: Date.now(),
      commission: this.calculateCommission(order),
      fees: this.calculateFees(order, executionResult.fillPrice),
      route: 'DRY_RUN',
      slippage: executionResult.slippage,
      slippageNote: executionResult.slippageNote,
      metadata: {
        originalPrice: order.price,
        bidAskSpread: quote.ask - quote.bid,
        marketImpact: executionResult.marketImpact,
        volatilityImpact: executionResult.volatilityImpact,
      }
    };

    // Create execution summary
    const summary: ExecutionSummary = {
      orderId: order.id,
      totalQuantity: order.quantity,
      avgFillPrice: executionResult.fillPrice,
      totalCommission: fill.commission || 0,
      totalFees: fill.fees || 0,
      fills: [fill],
      status: 'FILLED' as OrderStatus,
      createdAt: order.createdAt,
      completedAt: Date.now(),
    };

    // Simulate execution delay
    const executionTime = Date.now() - startTime;
    if (executionTime < 100) {
      await new Promise(resolve => setTimeout(resolve, 100 - executionTime));
    }

    return summary;
  }

  public async dryRunExecuteMultiLeg(order: MultiLegOrder): Promise<ExecutionSummary> {
    const startTime = Date.now();
    const fills: Fill[] = [];
    let totalCommission = 0;
    let totalFees = 0;
    let totalNotional = 0;
    let weightedPriceSum = 0;

    // Execute each leg
    for (const leg of order.legs) {
      let quote = this.getQuote(leg.symbol);
      if (!quote) {
        quote = this.createMockQuote(leg.symbol);
        this.updateQuote(quote);
      }

      // Create temporary order for leg execution
      const legOrder: Order = {
        id: `${order.id}_leg_${fills.length}`,
        symbol: leg.symbol,
        side: leg.side,
        type: order.type,
        quantity: leg.quantity,
        price: leg.price,
        timeInForce: order.timeInForce,
        instrumentType: leg.instrumentType,
        optionDetails: leg.optionDetails,
        route: 'DRY_RUN',
        status: 'PENDING',
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };

      const executionResult = this.calculateExecutionPrice(legOrder, quote);
      
      const fill: Fill = {
        id: generateFillId(),
        orderId: order.id,
        symbol: leg.symbol,
        side: leg.side,
        quantity: leg.quantity,
        price: executionResult.fillPrice,
        timestamp: Date.now(),
        commission: this.calculateCommission(legOrder),
        fees: this.calculateFees(legOrder, executionResult.fillPrice),
        route: 'DRY_RUN',
        slippage: executionResult.slippage,
        slippageNote: executionResult.slippageNote,
        metadata: {
          legIndex: fills.length,
          originalPrice: leg.price,
          bidAskSpread: quote.ask - quote.bid,
        }
      };

      fills.push(fill);
      totalCommission += fill.commission || 0;
      totalFees += fill.fees || 0;
      
      const notional = calculateNotionalValue(leg, executionResult.fillPrice);
      totalNotional += Math.abs(notional);
      weightedPriceSum += executionResult.fillPrice * Math.abs(notional);
    }

    const avgFillPrice = totalNotional > 0 ? weightedPriceSum / totalNotional : 0;

    const summary: ExecutionSummary = {
      orderId: order.id,
      totalQuantity: order.legs.reduce((sum, leg) => sum + leg.quantity, 0),
      avgFillPrice,
      totalCommission,
      totalFees,
      fills,
      status: 'FILLED' as OrderStatus,
      createdAt: order.createdAt,
      completedAt: Date.now(),
    };

    // Simulate execution delay for multi-leg orders
    const executionTime = Date.now() - startTime;
    if (executionTime < 200) {
      await new Promise(resolve => setTimeout(resolve, 200 - executionTime));
    }

    return summary;
  }

  private createMockQuote(symbol: string): QuoteData {
    const basePrice = this.getBasePriceForSymbol(symbol);
    const spread = basePrice * (0.0005 + Math.random() * 0.002); // 0.05% to 0.25% spread
    
    return {
      symbol,
      bid: basePrice - spread / 2,
      ask: basePrice + spread / 2,
      last: basePrice + (Math.random() - 0.5) * spread,
      bidSize: Math.floor(Math.random() * 2000) + 500,
      askSize: Math.floor(Math.random() * 2000) + 500,
      timestamp: Date.now(),
    };
  }

  private calculateExecutionPrice(order: Order, quote: QuoteData): {
    fillPrice: number;
    slippage: number;
    slippageNote: string;
    marketImpact: number;
    volatilityImpact: number;
  } {
    const { slippageModel } = this.config;
    
    if (!slippageModel.enabled) {
      const fillPrice = order.side === 'BUY' ? quote.ask : quote.bid;
      return {
        fillPrice,
        slippage: 0,
        slippageNote: 'No slippage model applied',
        marketImpact: 0,
        volatilityImpact: 0,
      };
    }

    // Base execution price (mid + spread factor)
    const mid = (quote.bid + quote.ask) / 2;
    const spread = quote.ask - quote.bid;
    const spreadImpact = spread * slippageModel.bidAskSpreadFactor;
    
    // Market impact based on order size
    const notional = calculateNotionalValue(order, mid);
    const marketImpact = Math.min(
      notional * slippageModel.marketImpactFactor,
      mid * slippageModel.maxSlippage
    );

    // Volatility impact (random component)
    const volatilityImpact = mid * slippageModel.volatilityFactor * Math.random();

    // Total slippage
    const totalSlippage = Math.max(
      spreadImpact + marketImpact + volatilityImpact,
      mid * slippageModel.minSlippage
    );

    // Apply slippage based on order side
    const slippageDirection = order.side === 'BUY' ? 1 : -1;
    const fillPrice = mid + (totalSlippage * slippageDirection);

    // Calculate slippage percentage
    const slippagePercent = Math.abs(fillPrice - mid) / mid;

    // Generate slippage note
    let slippageNote = `Spread: ${(spreadImpact/mid*10000).toFixed(1)}bp`;
    if (marketImpact > 0) {
      slippageNote += `, Market impact: ${(marketImpact/mid*10000).toFixed(1)}bp`;
    }
    if (volatilityImpact > 0) {
      slippageNote += `, Volatility: ${(volatilityImpact/mid*10000).toFixed(1)}bp`;
    }

    return {
      fillPrice: Math.max(fillPrice, 0.01), // Minimum price of $0.01
      slippage: slippagePercent,
      slippageNote,
      marketImpact,
      volatilityImpact,
    };
  }

  private calculateCommission(order: Order): number {
    const { commissions } = this.config;
    
    let commission = 0;
    if (order.instrumentType === 'STOCK') {
      commission = order.quantity * commissions.stock;
    } else if (order.instrumentType === 'OPTION') {
      commission = order.quantity * commissions.option;
    }

    return Math.max(commission, commissions.minimum);
  }

  private calculateFees(order: Order, fillPrice: number): number {
    const { fees } = this.config;
    const notional = calculateNotionalValue(order, fillPrice);
    
    return notional * (fees.regulatory + fees.exchange + fees.clearing);
  }

  public getConfig(): ExecutionConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<ExecutionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Global instance
export const executionRouter = new ExecutionRouter();
