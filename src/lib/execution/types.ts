// src/lib/execution/types.ts
// Order and Fill types for execution system

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK';
export type OrderStatus = 'PENDING' | 'WORKING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'REJECTED';
export type InstrumentType = 'STOCK' | 'OPTION' | 'FUTURE' | 'FOREX';
export type OptionType = 'CALL' | 'PUT';
export type Route = 'IBKR' | 'TRADIER' | 'DRY_RUN';

export interface OptionDetails {
  symbol: string;           // AAPL
  expiration: string;       // MM/DD/YYYY
  strike: number;           // 150.00
  type: OptionType;         // CALL | PUT
  multiplier?: number;      // 100 (default)
}

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;           // For LIMIT orders
  stopPrice?: number;       // For STOP orders
  timeInForce: TimeInForce;
  instrumentType: InstrumentType;
  optionDetails?: OptionDetails;
  route: Route;
  status: OrderStatus;
  createdAt: number;        // Unix timestamp
  updatedAt: number;        // Unix timestamp
  clientOrderId?: string;
  brokerOrderId?: string;
  metadata?: Record<string, any>;
}

export interface LegOrder {
  symbol: string;
  side: OrderSide;
  quantity: number;
  price?: number;
  instrumentType: InstrumentType;
  optionDetails?: OptionDetails;
  ratio?: number;           // For complex spreads
}

export interface MultiLegOrder {
  id: string;
  legs: LegOrder[];
  type: OrderType;
  netPrice?: number;        // Net debit/credit for spread
  timeInForce: TimeInForce;
  route: Route;
  status: OrderStatus;
  strategy?: string;        // iron_condor, pmcc, etc.
  createdAt: number;
  updatedAt: number;
  clientOrderId?: string;
  brokerOrderId?: string;
  metadata?: Record<string, any>;
}

export interface Fill {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  timestamp: number;
  commission?: number;
  fees?: number;
  route: Route;
  executionId?: string;
  slippage?: number;        // Difference from expected price
  slippageNote?: string;    // Human-readable slippage explanation
  metadata?: Record<string, any>;
}

export interface ExecutionSummary {
  orderId: string;
  totalQuantity: number;
  avgFillPrice: number;
  totalCommission: number;
  totalFees: number;
  fills: Fill[];
  status: OrderStatus;
  createdAt: number;
  completedAt?: number;
}

export interface SlippageModel {
  bidAskSpread: number;     // Current bid-ask spread
  marketImpact: number;     // Price impact based on order size
  volatility: number;       // Current volatility factor
  liquidity: number;        // Liquidity score (0-1)
}

export interface QuoteData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  bidSize: number;
  askSize: number;
  timestamp: number;
  impliedVol?: number;      // For options
  delta?: number;           // For options
  gamma?: number;           // For options
  theta?: number;           // For options
  vega?: number;            // For options
}

export interface ExecutionConfig {
  defaultRoute: Route;
  slippageModel: {
    enabled: boolean;
    bidAskSpreadFactor: number;    // 0.5 = fill at mid + 50% of spread
    marketImpactFactor: number;    // Additional slippage based on size
    volatilityFactor: number;      // Additional slippage in volatile markets
    minSlippage: number;           // Minimum slippage in basis points
    maxSlippage: number;           // Maximum slippage in basis points
  };
  commissions: {
    stock: number;                 // Per share
    option: number;                // Per contract
    minimum: number;               // Minimum commission
  };
  fees: {
    regulatory: number;            // SEC/FINRA fees
    exchange: number;              // Exchange fees
    clearing: number;              // Clearing fees
  };
}

// Type guards
export function isOrder(obj: any): obj is Order {
  return obj && 
    typeof obj.id === 'string' &&
    typeof obj.symbol === 'string' &&
    ['BUY', 'SELL'].includes(obj.side) &&
    ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'].includes(obj.type) &&
    typeof obj.quantity === 'number' &&
    ['DAY', 'GTC', 'IOC', 'FOK'].includes(obj.timeInForce) &&
    ['STOCK', 'OPTION', 'FUTURE', 'FOREX'].includes(obj.instrumentType) &&
    ['IBKR', 'TRADIER', 'DRY_RUN'].includes(obj.route);
}

export function isMultiLegOrder(obj: any): obj is MultiLegOrder {
  return obj &&
    typeof obj.id === 'string' &&
    Array.isArray(obj.legs) &&
    obj.legs.length > 0 &&
    ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'].includes(obj.type) &&
    ['DAY', 'GTC', 'IOC', 'FOK'].includes(obj.timeInForce) &&
    ['IBKR', 'TRADIER', 'DRY_RUN'].includes(obj.route);
}

export function isFill(obj: any): obj is Fill {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.orderId === 'string' &&
    typeof obj.symbol === 'string' &&
    ['BUY', 'SELL'].includes(obj.side) &&
    typeof obj.quantity === 'number' &&
    typeof obj.price === 'number' &&
    typeof obj.timestamp === 'number' &&
    ['IBKR', 'TRADIER', 'DRY_RUN'].includes(obj.route);
}

export function isOptionDetails(obj: any): obj is OptionDetails {
  return obj &&
    typeof obj.symbol === 'string' &&
    typeof obj.expiration === 'string' &&
    typeof obj.strike === 'number' &&
    ['CALL', 'PUT'].includes(obj.type);
}

// Utility functions
export function generateOrderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateFillId(): string {
  return `fill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function formatOptionSymbol(details: OptionDetails): string {
  const expDate = details.expiration.replace(/\//g, '');
  const strike = (details.strike * 1000).toString().padStart(8, '0');
  return `${details.symbol}${expDate}${details.type}${strike}`;
}

export function parseOptionSymbol(optionSymbol: string): OptionDetails | null {
  // Parse format: AAPL240119C00150000
  const match = optionSymbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;

  const [, symbol, expDate, typeChar, strikeStr] = match;
  const year = 2000 + parseInt(expDate.substr(0, 2));
  const month = parseInt(expDate.substr(2, 2));
  const day = parseInt(expDate.substr(4, 2));
  const expiration = `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
  const strike = parseInt(strikeStr) / 1000;
  const type = typeChar === 'C' ? 'CALL' : 'PUT';

  return { symbol, expiration, strike, type };
}

export function calculateNotionalValue(order: Order | LegOrder, price?: number): number {
  const orderPrice = price || order.price || 0;
  const multiplier = order.instrumentType === 'OPTION' ? 100 : 1;
  return order.quantity * orderPrice * multiplier;
}

export function getOrderDisplayName(order: Order): string {
  if (order.instrumentType === 'OPTION' && order.optionDetails) {
    const opt = order.optionDetails;
    return `${opt.symbol} ${opt.expiration} ${opt.strike} ${opt.type}`;
  }
  return order.symbol;
}

export function getMultiLegDisplayName(order: MultiLegOrder): string {
  if (order.strategy) {
    const symbol = order.legs[0]?.symbol || 'UNKNOWN';
    return `${symbol} ${order.strategy.toUpperCase()}`;
  }
  return `${order.legs.length}-Leg Spread`;
}
