/**
 * PayoffChart Component Props Interface - Options Trading Backtest Engine
 * 
 * This module defines the complete TypeScript interface for the PayoffChart component
 * props, specifying the exact API for options strategy payoff diagram visualization.
 * All date strings use MM/DD/YYYY format as specified in requirements.
 * 
 * INTERFACE DEFINITIONS ONLY - NO COMPONENT LOGIC
 */

// Core primitive types
export type Price = number;
export type Quantity = number;
export type Percentage = number;
export type DateString = string; // MM/DD/YYYY format
export type CurrencyAmount = number;
export type SymbolString = string;

// Option types and classifications
export type OptionType = 'call' | 'put';
export type PositionDirection = 'long' | 'short';
export type LegType = 
  | 'long_call'
  | 'short_call' 
  | 'long_put'
  | 'short_put'
  | 'long_stock'
  | 'short_stock';

// Chart display modes
export type ChartMode = 
  | 'payoff' // P&L at expiration
  | 'current' // Current P&L with time decay
  | 'both'; // Show both lines

export type ChartStyle = 
  | 'line'
  | 'area'
  | 'stepped';

// Color themes for chart
export type ColorTheme = 
  | 'default'
  | 'dark'
  | 'light'
  | 'colorblind'
  | 'custom';

// Individual strategy leg definition
export interface StrategyLeg {
  readonly legId: string;
  readonly symbol: SymbolString;
  readonly legType: LegType;
  readonly optionType: OptionType | null; // null for stock positions
  readonly strike: Price | null; // null for stock positions
  readonly expirationDate: DateString | null; // MM/DD/YYYY, null for stock
  readonly quantity: Quantity;
  readonly premium: CurrencyAmount; // Premium paid/received per contract
  readonly impliedVolatility: Percentage | null;
  readonly delta: number | null;
  readonly gamma: number | null;
  readonly theta: number | null;
  readonly vega: number | null;
  readonly rho: number | null;
  readonly isEnabled: boolean; // Allow toggling legs on/off
  readonly label: string; // Display name for the leg
  readonly color: string | null; // Custom color for this leg
}

// Underlying asset information
export interface UnderlyingAsset {
  readonly symbol: SymbolString;
  readonly currentPrice: Price;
  readonly name: string;
  readonly volatility: Percentage | null;
  readonly dividendYield: Percentage | null;
  readonly riskFreeRate: Percentage | null;
  readonly lastUpdated: DateString; // MM/DD/YYYY
}

// Payoff calculation range and resolution
export interface PayoffRange {
  readonly minPrice: Price | null; // null for auto-calculation
  readonly maxPrice: Price | null; // null for auto-calculation
  readonly centerPrice: Price | null; // null to use current price
  readonly priceStep: Price | null; // null for auto-calculation
  readonly numberOfPoints: number; // Resolution of calculation
  readonly rangeMultiplier: number; // Multiplier of current price for auto range (e.g., 0.5 = ±50%)
}

// Individual payoff data point
export interface PayoffDataPoint {
  readonly underlyingPrice: Price;
  readonly totalPayoff: CurrencyAmount;
  readonly currentPayoff: CurrencyAmount | null; // With time decay
  readonly legPayoffs: Record<string, CurrencyAmount>; // Payoff by leg ID
  readonly breakeven: boolean; // Is this a breakeven point?
  readonly maxProfit: boolean; // Is this the max profit point?
  readonly maxLoss: boolean; // Is this the max loss point?
  readonly probability: Percentage | null; // Probability of reaching this price
}

// Chart interaction callbacks
export interface ChartInteractionCallbacks {
  readonly onPointHover?: (point: PayoffDataPoint | null) => void;
  readonly onPointClick?: (point: PayoffDataPoint) => void;
  readonly onRangeChange?: (newRange: PayoffRange) => void;
  readonly onLegToggle?: (legId: string, enabled: boolean) => void;
  readonly onModeChange?: (mode: ChartMode) => void;
  readonly onExport?: (format: 'png' | 'svg' | 'pdf' | 'csv') => void;
}

// Chart display configuration
export interface ChartDisplayConfig {
  readonly width: number | string; // Chart width (px or %)
  readonly height: number | string; // Chart height (px or %)
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly showTitle: boolean;
  readonly showLegend: boolean;
  readonly showGrid: boolean;
  readonly showBreakevens: boolean;
  readonly showMaxProfitLoss: boolean;
  readonly showCurrentPrice: boolean;
  readonly showProbabilities: boolean;
  readonly showTooltips: boolean;
  readonly showCrosshair: boolean;
  readonly animationDuration: number; // Animation duration in ms
  readonly responsive: boolean; // Auto-resize to container
}

// Axis configuration
export interface AxisConfig {
  readonly xAxis: {
    readonly label: string;
    readonly showLabel: boolean;
    readonly tickFormat: string | null; // d3 format string
    readonly tickCount: number | null; // null for auto
    readonly domain: [Price, Price] | null; // null for auto
  };
  readonly yAxis: {
    readonly label: string;
    readonly showLabel: boolean;
    readonly tickFormat: string | null; // d3 format string
    readonly tickCount: number | null; // null for auto
    readonly domain: [CurrencyAmount, CurrencyAmount] | null; // null for auto
    readonly zeroline: boolean; // Show zero line
  };
}

// Color scheme configuration
export interface ColorScheme {
  readonly theme: ColorTheme;
  readonly profitColor: string;
  readonly lossColor: string;
  readonly breakevenColor: string;
  readonly currentPriceColor: string;
  readonly gridColor: string;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly customColors: Record<string, string>; // Custom color mappings
}

// Strategy summary information
export interface StrategySummary {
  readonly strategyName: string;
  readonly strategyType: string; // 'bullish', 'bearish', 'neutral', 'volatile'
  readonly netPremium: CurrencyAmount; // Net premium paid/received
  readonly maxProfit: CurrencyAmount | null; // null for unlimited
  readonly maxLoss: CurrencyAmount | null; // null for unlimited
  readonly breakevens: readonly Price[];
  readonly profitRange: readonly [Price, Price][] | null; // Profitable price ranges
  readonly riskRewardRatio: number | null;
  readonly probabilityOfProfit: Percentage | null;
  readonly daysToExpiration: number | null;
  readonly impliedMove: Price | null; // Expected move based on IV
}

// Export and sharing options
export interface ExportOptions {
  readonly enableExport: boolean;
  readonly formats: readonly ('png' | 'svg' | 'pdf' | 'csv')[];
  readonly filename: string | null; // null for auto-generated
  readonly includeData: boolean; // Include raw data in export
  readonly includeMetadata: boolean; // Include strategy metadata
}

// Advanced calculation options
export interface CalculationOptions {
  readonly includeTimeDecay: boolean;
  readonly includeDividends: boolean;
  readonly includeInterestRates: boolean;
  readonly volatilityModel: 'constant' | 'smile' | 'surface';
  readonly pricingModel: 'black_scholes' | 'binomial' | 'monte_carlo';
  readonly monteCarloIterations: number | null; // For Monte Carlo pricing
  readonly confidenceInterval: Percentage | null; // For probability calculations
}

// Performance optimization options
export interface PerformanceOptions {
  readonly enableVirtualization: boolean; // For large datasets
  readonly debounceMs: number; // Debounce for real-time updates
  readonly maxDataPoints: number; // Limit for performance
  readonly enableWebWorker: boolean; // Use web worker for calculations
  readonly cacheResults: boolean; // Cache calculation results
}

// Main PayoffChart component props interface
export interface PayoffChartProps {
  // Core data
  readonly underlying: UnderlyingAsset;
  readonly legs: readonly StrategyLeg[];
  readonly payoffRange: PayoffRange;
  
  // Chart configuration
  readonly mode: ChartMode;
  readonly style: ChartStyle;
  readonly displayConfig: ChartDisplayConfig;
  readonly axisConfig: AxisConfig;
  readonly colorScheme: ColorScheme;
  
  // Strategy information
  readonly strategySummary: StrategySummary | null;
  
  // Interaction and callbacks
  readonly callbacks: ChartInteractionCallbacks;
  
  // Advanced options
  readonly calculationOptions: CalculationOptions;
  readonly exportOptions: ExportOptions;
  readonly performanceOptions: PerformanceOptions;
  
  // Component state
  readonly loading: boolean;
  readonly error: string | null;
  readonly className: string | null;
  readonly testId: string | null; // For testing
  
  // Accessibility
  readonly ariaLabel: string | null;
  readonly ariaDescription: string | null;
  readonly tabIndex: number | null;
}

// Default configuration objects for convenience
export interface PayoffChartDefaults {
  readonly payoffRange: PayoffRange;
  readonly displayConfig: ChartDisplayConfig;
  readonly axisConfig: AxisConfig;
  readonly colorScheme: ColorScheme;
  readonly calculationOptions: CalculationOptions;
  readonly exportOptions: ExportOptions;
  readonly performanceOptions: PerformanceOptions;
}

// Computed properties that the chart will calculate
export interface PayoffChartComputedProps {
  readonly payoffData: readonly PayoffDataPoint[];
  readonly breakevens: readonly Price[];
  readonly maxProfit: CurrencyAmount | null;
  readonly maxLoss: CurrencyAmount | null;
  readonly currentPayoff: CurrencyAmount;
  readonly impliedVolatility: Percentage | null;
  readonly timeDecay: CurrencyAmount | null;
  readonly deltaExposure: number;
  readonly gammaExposure: number;
  readonly thetaExposure: number;
  readonly vegaExposure: number;
}

// Chart state for controlled components
export interface PayoffChartState {
  readonly hoveredPoint: PayoffDataPoint | null;
  readonly selectedPoint: PayoffDataPoint | null;
  readonly zoomLevel: number;
  readonly panOffset: { readonly x: number; readonly y: number };
  readonly visibleRange: { readonly min: Price; readonly max: Price };
  readonly enabledLegs: Record<string, boolean>;
}

// Event types for chart interactions
export type PayoffChartEvent = 
  | { readonly type: 'hover'; readonly point: PayoffDataPoint | null }
  | { readonly type: 'click'; readonly point: PayoffDataPoint }
  | { readonly type: 'zoom'; readonly level: number }
  | { readonly type: 'pan'; readonly offset: { readonly x: number; readonly y: number } }
  | { readonly type: 'leg_toggle'; readonly legId: string; readonly enabled: boolean }
  | { readonly type: 'mode_change'; readonly mode: ChartMode }
  | { readonly type: 'export'; readonly format: string };

// Validation types for props
export type PayoffChartPropsValidator = (props: PayoffChartProps) => readonly string[];

// Type guards for runtime validation
export type StrategyLegTypeGuard = (leg: unknown) => leg is StrategyLeg;
export type PayoffDataPointTypeGuard = (point: unknown) => point is PayoffDataPoint;

// Utility types for component development
export type RequiredPayoffChartProps = Pick<PayoffChartProps, 'underlying' | 'legs' | 'payoffRange'>;
export type OptionalPayoffChartProps = Omit<PayoffChartProps, keyof RequiredPayoffChartProps>;
export type PayoffChartPropsKey = keyof PayoffChartProps;
export type PayoffChartPropsValue<K extends PayoffChartPropsKey> = PayoffChartProps[K];

// Export type aliases for external use
export type {
  PayoffChartProps as PayoffChartComponentProps,
  StrategyLeg as PayoffChartLeg,
  PayoffDataPoint as PayoffChartDataPoint,
  ChartInteractionCallbacks as PayoffChartCallbacks
};
