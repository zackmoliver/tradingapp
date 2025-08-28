/**
 * Position State Type Definitions - Options Trading Backtest Engine
 * 
 * This module defines the complete TypeScript type system for trading positions,
 * portfolio state, and related data structures. All date strings use MM/DD/YYYY format.
 * 
 * TYPE DEFINITIONS ONLY - NO IMPLEMENTATION LOGIC
 */

// Core primitive types
export type Price = number;
export type Quantity = number;
export type Percentage = number;
export type DateString = string; // MM/DD/YYYY format
export type TimestampString = string; // MM/DD/YYYY HH:mm:ss format
export type CurrencyAmount = number;
export type SymbolString = string;
export type StrategyId = string;
export type PositionId = string;
export type OrderId = string;

// Position type classifications
export type PositionType = 
  | 'long_stock'
  | 'short_stock'
  | 'long_call'
  | 'short_call'
  | 'long_put'
  | 'short_put'
  | 'cash';

export type AssetClass = 
  | 'equity'
  | 'option'
  | 'etf'
  | 'cash'
  | 'crypto'
  | 'future';

export type OptionType = 'call' | 'put';

export type OrderSide = 
  | 'buy'
  | 'sell'
  | 'buy_to_open'
  | 'sell_to_open'
  | 'buy_to_close'
  | 'sell_to_close';

// Greeks for options positions
export interface OptionsGreeks {
  readonly delta: number | null;
  readonly gamma: number | null;
  readonly theta: number | null;
  readonly vega: number | null;
  readonly rho: number | null;
  readonly impliedVolatility: number | null;
}

// Options-specific metadata
export interface OptionsMetadata {
  readonly optionType: OptionType;
  readonly strikePrice: Price;
  readonly expirationDate: DateString; // MM/DD/YYYY
  readonly underlyingSymbol: SymbolString;
  readonly contractSize: number;
  readonly greeks: OptionsGreeks;
  readonly timeToExpiration: number; // Days
  readonly intrinsicValue: CurrencyAmount;
  readonly timeValue: CurrencyAmount;
}

// Performance metrics for positions
export interface PositionPerformance {
  readonly unrealizedPnl: CurrencyAmount;
  readonly realizedPnl: CurrencyAmount;
  readonly totalPnl: CurrencyAmount;
  readonly unrealizedPnlPercent: Percentage;
  readonly realizedPnlPercent: Percentage;
  readonly totalPnlPercent: Percentage;
  readonly costBasis: CurrencyAmount;
  readonly marketValue: CurrencyAmount;
  readonly dayChange: CurrencyAmount;
  readonly dayChangePercent: Percentage;
}

// Risk metrics for positions
export interface PositionRisk {
  readonly exposure: CurrencyAmount;
  readonly notionalValue: CurrencyAmount;
  readonly marginRequirement: CurrencyAmount | null;
  readonly leverage: number | null;
  readonly beta: number | null;
  readonly var95: CurrencyAmount | null; // Value at Risk 95%
  readonly maxLoss: CurrencyAmount | null; // Maximum theoretical loss
}

// Trade execution details
export interface TradeExecution {
  readonly orderId: OrderId;
  readonly executionId: string;
  readonly executionPrice: Price;
  readonly executionQuantity: Quantity;
  readonly executionTime: TimestampString; // MM/DD/YYYY HH:mm:ss
  readonly commission: CurrencyAmount;
  readonly fees: CurrencyAmount;
  readonly side: OrderSide;
}

// Position metadata and tracking
export interface PositionMetadata {
  readonly strategyId: StrategyId;
  readonly strategyName: string;
  readonly openedBy: string; // User or system identifier
  readonly tags: readonly string[];
  readonly notes: string;
  readonly isManual: boolean; // Manually opened vs. algorithm
  readonly parentPositionId: PositionId | null; // For complex strategies
  readonly hedgePositionIds: readonly PositionId[]; // Related hedge positions
}

// Core position interface
export interface Position {
  readonly positionId: PositionId;
  readonly symbol: SymbolString;
  readonly assetClass: AssetClass;
  readonly positionType: PositionType;
  readonly quantity: Quantity;
  readonly averagePrice: Price;
  readonly currentPrice: Price | null;
  readonly entryDate: DateString; // MM/DD/YYYY
  readonly entryTime: TimestampString; // MM/DD/YYYY HH:mm:ss
  readonly exitDate: DateString | null; // MM/DD/YYYY
  readonly exitTime: TimestampString | null; // MM/DD/YYYY HH:mm:ss
  readonly isOpen: boolean;
  readonly performance: PositionPerformance;
  readonly risk: PositionRisk;
  readonly executions: readonly TradeExecution[];
  readonly optionsMetadata: OptionsMetadata | null;
  readonly metadata: PositionMetadata;
  readonly lastUpdated: TimestampString; // MM/DD/YYYY HH:mm:ss
}

// Portfolio-level Greeks aggregation
export interface PortfolioGreeks {
  readonly totalDelta: number;
  readonly totalGamma: number;
  readonly totalTheta: number;
  readonly totalVega: number;
  readonly totalRho: number;
  readonly netDelta: number; // Delta-adjusted exposure
  readonly gammaExposure: CurrencyAmount;
  readonly thetaDecay: CurrencyAmount; // Daily theta decay
  readonly vegaRisk: CurrencyAmount; // Vega exposure
}

// Portfolio performance metrics
export interface PortfolioPerformance {
  readonly totalValue: CurrencyAmount;
  readonly cash: CurrencyAmount;
  readonly positionsValue: CurrencyAmount;
  readonly totalPnl: CurrencyAmount;
  readonly unrealizedPnl: CurrencyAmount;
  readonly realizedPnl: CurrencyAmount;
  readonly dayChange: CurrencyAmount;
  readonly dayChangePercent: Percentage;
  readonly totalReturn: Percentage;
  readonly annualizedReturn: Percentage;
  readonly sharpeRatio: number | null;
  readonly maxDrawdown: Percentage;
  readonly winRate: Percentage;
}

// Portfolio risk metrics
export interface PortfolioRisk {
  readonly totalExposure: CurrencyAmount;
  readonly netExposure: CurrencyAmount;
  readonly grossExposure: CurrencyAmount;
  readonly leverage: number;
  readonly marginUsed: CurrencyAmount;
  readonly marginAvailable: CurrencyAmount;
  readonly buyingPower: CurrencyAmount;
  readonly var95: CurrencyAmount;
  readonly var99: CurrencyAmount;
  readonly beta: number;
  readonly correlation: number;
}

// Sector and asset allocation
export interface AllocationBreakdown {
  readonly bySector: Record<string, CurrencyAmount>;
  readonly byAssetClass: Record<AssetClass, CurrencyAmount>;
  readonly byStrategy: Record<StrategyId, CurrencyAmount>;
  readonly byDirection: {
    readonly long: CurrencyAmount;
    readonly short: CurrencyAmount;
  };
  readonly byExpiration: Record<DateString, CurrencyAmount>; // For options
}

// Complete portfolio state
export interface Portfolio {
  readonly portfolioId: string;
  readonly accountId: string;
  readonly name: string;
  readonly positions: Record<PositionId, Position>;
  readonly performance: PortfolioPerformance;
  readonly risk: PortfolioRisk;
  readonly greeks: PortfolioGreeks;
  readonly allocation: AllocationBreakdown;
  readonly lastUpdated: TimestampString; // MM/DD/YYYY HH:mm:ss
  readonly createdAt: TimestampString; // MM/DD/YYYY HH:mm:ss
}

// Position filtering and querying types
export interface PositionFilter {
  readonly symbols?: readonly SymbolString[];
  readonly assetClasses?: readonly AssetClass[];
  readonly positionTypes?: readonly PositionType[];
  readonly strategies?: readonly StrategyId[];
  readonly isOpen?: boolean;
  readonly minValue?: CurrencyAmount;
  readonly maxValue?: CurrencyAmount;
  readonly minPnl?: CurrencyAmount;
  readonly maxPnl?: CurrencyAmount;
  readonly entryDateFrom?: DateString; // MM/DD/YYYY
  readonly entryDateTo?: DateString; // MM/DD/YYYY
  readonly expirationDateFrom?: DateString; // MM/DD/YYYY
  readonly expirationDateTo?: DateString; // MM/DD/YYYY
  readonly tags?: readonly string[];
}

// Position sorting options
export type PositionSortField = 
  | 'symbol'
  | 'quantity'
  | 'marketValue'
  | 'unrealizedPnl'
  | 'totalPnl'
  | 'entryDate'
  | 'dayChange'
  | 'exposure';

export type SortDirection = 'asc' | 'desc';

export interface PositionSort {
  readonly field: PositionSortField;
  readonly direction: SortDirection;
}

// Position query result
export interface PositionQueryResult {
  readonly positions: readonly Position[];
  readonly totalCount: number;
  readonly filteredCount: number;
  readonly aggregates: {
    readonly totalValue: CurrencyAmount;
    readonly totalPnl: CurrencyAmount;
    readonly totalExposure: CurrencyAmount;
  };
}

// Position update events
export type PositionUpdateType = 
  | 'price_update'
  | 'quantity_change'
  | 'greeks_update'
  | 'execution'
  | 'close'
  | 'metadata_update';

export interface PositionUpdate {
  readonly positionId: PositionId;
  readonly updateType: PositionUpdateType;
  readonly timestamp: TimestampString; // MM/DD/YYYY HH:mm:ss
  readonly previousState: Partial<Position>;
  readonly newState: Partial<Position>;
  readonly source: string; // Update source identifier
}

// Historical position data
export interface PositionSnapshot {
  readonly positionId: PositionId;
  readonly timestamp: TimestampString; // MM/DD/YYYY HH:mm:ss
  readonly position: Position;
}

export interface PositionHistory {
  readonly positionId: PositionId;
  readonly snapshots: readonly PositionSnapshot[];
  readonly updates: readonly PositionUpdate[];
}

// Position analytics
export interface PositionAnalytics {
  readonly positionId: PositionId;
  readonly holdingPeriod: number; // Days
  readonly averageHoldingPeriod: number; // For similar positions
  readonly profitProbability: Percentage;
  readonly expectedReturn: CurrencyAmount;
  readonly riskRewardRatio: number;
  readonly correlationToPortfolio: number;
  readonly contributionToRisk: Percentage;
  readonly optimalSize: Quantity | null;
}

// Complex position structures (spreads, straddles, etc.)
export interface ComplexPosition {
  readonly complexPositionId: string;
  readonly name: string;
  readonly type: string; // 'iron_condor', 'butterfly', 'straddle', etc.
  readonly legs: readonly PositionId[];
  readonly netPremium: CurrencyAmount;
  readonly maxProfit: CurrencyAmount;
  readonly maxLoss: CurrencyAmount;
  readonly breakevens: readonly Price[];
  readonly expirationDate: DateString; // MM/DD/YYYY
  readonly underlyingSymbol: SymbolString;
  readonly strategy: string;
}

// Type guards for runtime type checking
export type PositionTypeGuard<T extends Position> = (position: Position) => position is T;

// Utility types for position operations
export type PositionKey = keyof Position;
export type PositionValue<K extends PositionKey> = Position[K];
export type PartialPosition = Partial<Position>;
export type RequiredPositionFields = Pick<Position, 'positionId' | 'symbol' | 'quantity' | 'positionType'>;

// Date validation type
export type ValidDateString = DateString & { readonly __brand: 'ValidDateString' };

// Export all types for external use
export type {
  Position as PositionState,
  Portfolio as PortfolioState,
  PositionFilter as PositionFilterState,
  PositionQueryResult as PositionQueryState
};
