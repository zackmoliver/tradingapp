// src/lib/strategies/index.ts
// Strategy registry and type definitions

export type StrategyId = 
  | 'PMCC'
  | 'Wheel' 
  | 'CoveredCall'
  | 'iron_condor'
  | 'bull_put_spread';

export interface StrategyParameter {
  name: string;
  label: string;
  type: 'number' | 'integer' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
  default: any;
  description: string;
  tooltip?: string;
}

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  description: string;
  category: 'Income' | 'Growth' | 'Neutral' | 'Directional';
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  minCapital: number;
  parameters: StrategyParameter[];
  riskProfile: {
    maxLoss: 'Limited' | 'Unlimited';
    maxGain: 'Limited' | 'Unlimited';
    breakeven: number; // Number of breakeven points
  };
  marketOutlook: 'Bullish' | 'Bearish' | 'Neutral' | 'Volatile';
  timeDecay: 'Positive' | 'Negative' | 'Mixed';
}

export const STRATEGIES: Record<StrategyId, StrategyDefinition> = {
  PMCC: {
    id: 'PMCC',
    name: 'Poor Man\'s Covered Call',
    description: 'Long-term call + short-term call for leveraged income generation',
    category: 'Growth',
    complexity: 'Advanced',
    minCapital: 5000,
    parameters: [
      {
        name: 'delta_long',
        label: 'Long Call Delta',
        type: 'number',
        min: 0.7,
        max: 0.95,
        step: 0.05,
        default: 0.8,
        description: 'Delta for the long-term call (LEAPS)',
        tooltip: 'Higher delta = more stock-like behavior, typically 0.8-0.9'
      },
      {
        name: 'delta_short',
        label: 'Short Call Delta',
        type: 'number',
        min: 0.15,
        max: 0.4,
        step: 0.05,
        default: 0.3,
        description: 'Delta for the short-term call',
        tooltip: 'Lower delta = higher probability of profit, typically 0.2-0.35'
      },
      {
        name: 'dte_long',
        label: 'Long Call DTE',
        type: 'integer',
        min: 60,
        max: 365,
        step: 30,
        default: 90,
        description: 'Days to expiration for long call',
        tooltip: 'Longer DTE provides more time value, typically 90-365 days'
      },
      {
        name: 'dte_short',
        label: 'Short Call DTE',
        type: 'integer',
        min: 7,
        max: 60,
        step: 7,
        default: 30,
        description: 'Days to expiration for short call',
        tooltip: 'Shorter DTE for faster theta decay, typically 21-45 days'
      },
      {
        name: 'profit_target',
        label: 'Profit Target (%)',
        type: 'number',
        min: 10,
        max: 80,
        step: 5,
        default: 50,
        description: 'Close position at this profit percentage',
        tooltip: 'Percentage of max profit to take, typically 25-50%'
      },
      {
        name: 'loss_limit',
        label: 'Loss Limit (%)',
        type: 'number',
        min: 100,
        max: 300,
        step: 25,
        default: 200,
        description: 'Close position at this loss percentage',
        tooltip: 'Percentage of credit received, typically 150-250%'
      }
    ],
    riskProfile: {
      maxLoss: 'Limited',
      maxGain: 'Unlimited',
      breakeven: 1
    },
    marketOutlook: 'Bullish',
    timeDecay: 'Mixed'
  },

  Wheel: {
    id: 'Wheel',
    name: 'The Wheel Strategy',
    description: 'Sell puts, get assigned, sell calls - systematic income generation',
    category: 'Income',
    complexity: 'Intermediate',
    minCapital: 10000,
    parameters: [
      {
        name: 'put_delta',
        label: 'Put Delta',
        type: 'number',
        min: 0.15,
        max: 0.5,
        step: 0.05,
        default: 0.3,
        description: 'Delta for cash-secured puts',
        tooltip: 'Lower delta = lower assignment probability, typically 0.2-0.35'
      },
      {
        name: 'call_delta',
        label: 'Call Delta (if assigned)',
        type: 'number',
        min: 0.15,
        max: 0.5,
        step: 0.05,
        default: 0.3,
        description: 'Delta for covered calls after assignment',
        tooltip: 'Delta for calls when holding stock, typically 0.2-0.4'
      },
      {
        name: 'dte',
        label: 'Days to Expiration',
        type: 'integer',
        min: 14,
        max: 60,
        step: 7,
        default: 30,
        description: 'Target DTE for both puts and calls',
        tooltip: 'Optimal theta decay window, typically 21-45 days'
      },
      {
        name: 'profit_target',
        label: 'Profit Target (%)',
        type: 'number',
        min: 20,
        max: 80,
        step: 10,
        default: 50,
        description: 'Close at this percentage of max profit',
        tooltip: 'Take profits early to reduce risk, typically 25-50%'
      },
      {
        name: 'roll_threshold',
        label: 'Roll Threshold (DTE)',
        type: 'integer',
        min: 3,
        max: 14,
        step: 1,
        default: 7,
        description: 'Roll position when DTE reaches this level',
        tooltip: 'Roll to avoid assignment/expiration, typically 5-10 days'
      }
    ],
    riskProfile: {
      maxLoss: 'Limited',
      maxGain: 'Limited',
      breakeven: 1
    },
    marketOutlook: 'Neutral',
    timeDecay: 'Positive'
  },

  CoveredCall: {
    id: 'CoveredCall',
    name: 'Covered Call',
    description: 'Own stock + sell calls for income enhancement',
    category: 'Income',
    complexity: 'Beginner',
    minCapital: 5000,
    parameters: [
      {
        name: 'call_delta',
        label: 'Call Delta',
        type: 'number',
        min: 0.15,
        max: 0.5,
        step: 0.05,
        default: 0.3,
        description: 'Delta for covered calls',
        tooltip: 'Lower delta = lower assignment risk, typically 0.2-0.4'
      },
      {
        name: 'dte',
        label: 'Days to Expiration',
        type: 'integer',
        min: 14,
        max: 60,
        step: 7,
        default: 30,
        description: 'Target DTE for calls',
        tooltip: 'Optimal theta decay, typically 21-45 days'
      },
      {
        name: 'profit_target',
        label: 'Profit Target (%)',
        type: 'number',
        min: 20,
        max: 80,
        step: 10,
        default: 50,
        description: 'Close call at this profit percentage',
        tooltip: 'Take profits to reduce assignment risk, typically 25-50%'
      },
      {
        name: 'roll_up_threshold',
        label: 'Roll Up Threshold (%)',
        type: 'number',
        min: 5,
        max: 20,
        step: 2.5,
        default: 10,
        description: 'Roll up when stock moves this much',
        tooltip: 'Roll calls higher when stock rallies, typically 8-15%'
      },
      {
        name: 'assignment_action',
        label: 'If Assigned',
        type: 'select',
        options: [
          { value: 'hold_cash', label: 'Hold Cash' },
          { value: 'rebuy_stock', label: 'Rebuy Stock' },
          { value: 'sell_puts', label: 'Sell Puts' }
        ],
        default: 'sell_puts',
        description: 'Action to take if calls are assigned',
        tooltip: 'Strategy for managing assignment'
      }
    ],
    riskProfile: {
      maxLoss: 'Limited',
      maxGain: 'Limited',
      breakeven: 1
    },
    marketOutlook: 'Neutral',
    timeDecay: 'Positive'
  },

  iron_condor: {
    id: 'iron_condor',
    name: 'Iron Condor',
    description: 'Sell put spread + call spread for range-bound income',
    category: 'Neutral',
    complexity: 'Advanced',
    minCapital: 2000,
    parameters: [
      {
        name: 'call_delta',
        label: 'Short Call Delta',
        type: 'number',
        min: 0.15,
        max: 0.35,
        step: 0.05,
        default: 0.25,
        description: 'Delta for short call',
        tooltip: 'Probability of touching, typically 0.2-0.3'
      },
      {
        name: 'put_delta',
        label: 'Short Put Delta',
        type: 'number',
        min: 0.15,
        max: 0.35,
        step: 0.05,
        default: 0.25,
        description: 'Delta for short put',
        tooltip: 'Should match call delta for balanced risk'
      },
      {
        name: 'wing_width',
        label: 'Wing Width ($)',
        type: 'number',
        min: 5,
        max: 50,
        step: 5,
        default: 10,
        description: 'Distance between long and short strikes',
        tooltip: 'Wider wings = more capital at risk but higher credit'
      },
      {
        name: 'dte',
        label: 'Days to Expiration',
        type: 'integer',
        min: 21,
        max: 60,
        step: 7,
        default: 45,
        description: 'Target DTE for the condor',
        tooltip: 'Longer DTE for better theta decay, typically 30-60 days'
      },
      {
        name: 'profit_target',
        label: 'Profit Target (%)',
        type: 'number',
        min: 20,
        max: 75,
        step: 5,
        default: 50,
        description: 'Close at this percentage of max profit',
        tooltip: 'Take profits early to reduce tail risk, typically 25-50%'
      },
      {
        name: 'loss_limit',
        label: 'Loss Limit (%)',
        type: 'number',
        min: 100,
        max: 300,
        step: 25,
        default: 200,
        description: 'Close at this percentage of credit received',
        tooltip: 'Stop loss to limit damage, typically 150-250%'
      }
    ],
    riskProfile: {
      maxLoss: 'Limited',
      maxGain: 'Limited',
      breakeven: 2
    },
    marketOutlook: 'Neutral',
    timeDecay: 'Positive'
  },

  bull_put_spread: {
    id: 'bull_put_spread',
    name: 'Bull Put Spread',
    description: 'Sell put + buy lower put for bullish income',
    category: 'Directional',
    complexity: 'Intermediate',
    minCapital: 1000,
    parameters: [
      {
        name: 'short_delta',
        label: 'Short Put Delta',
        type: 'number',
        min: 0.15,
        max: 0.4,
        step: 0.05,
        default: 0.3,
        description: 'Delta for short put',
        tooltip: 'Higher delta = more aggressive, typically 0.2-0.35'
      },
      {
        name: 'long_delta',
        label: 'Long Put Delta',
        type: 'number',
        min: 0.05,
        max: 0.25,
        step: 0.05,
        default: 0.15,
        description: 'Delta for long put (protection)',
        tooltip: 'Lower delta for protection, typically 0.1-0.2'
      },
      {
        name: 'dte',
        label: 'Days to Expiration',
        type: 'integer',
        min: 21,
        max: 60,
        step: 7,
        default: 30,
        description: 'Target DTE for the spread',
        tooltip: 'Optimal theta decay window, typically 21-45 days'
      },
      {
        name: 'profit_target',
        label: 'Profit Target (%)',
        type: 'number',
        min: 20,
        max: 80,
        step: 10,
        default: 50,
        description: 'Close at this percentage of max profit',
        tooltip: 'Take profits to reduce risk, typically 25-50%'
      },
      {
        name: 'loss_limit',
        label: 'Loss Limit (%)',
        type: 'number',
        min: 100,
        max: 300,
        step: 25,
        default: 200,
        description: 'Close at this percentage of credit received',
        tooltip: 'Stop loss level, typically 150-250%'
      },
      {
        name: 'width_dollars',
        label: 'Spread Width ($)',
        type: 'number',
        min: 2.5,
        max: 25,
        step: 2.5,
        default: 5,
        description: 'Dollar width between strikes',
        tooltip: 'Wider spreads = more capital at risk but higher credit'
      }
    ],
    riskProfile: {
      maxLoss: 'Limited',
      maxGain: 'Limited',
      breakeven: 1
    },
    marketOutlook: 'Bullish',
    timeDecay: 'Positive'
  }
};

/**
 * Get strategy definition by ID
 */
export function getStrategy(id: StrategyId): StrategyDefinition {
  const strategy = STRATEGIES[id];
  if (!strategy) {
    throw new Error(`Unknown strategy: ${id}`);
  }
  return strategy;
}

/**
 * Get all available strategies
 */
export function getAllStrategies(): StrategyDefinition[] {
  return Object.values(STRATEGIES);
}

/**
 * Get strategies by category
 */
export function getStrategiesByCategory(category: StrategyDefinition['category']): StrategyDefinition[] {
  return getAllStrategies().filter(s => s.category === category);
}

/**
 * Get strategies by complexity
 */
export function getStrategiesByComplexity(complexity: StrategyDefinition['complexity']): StrategyDefinition[] {
  return getAllStrategies().filter(s => s.complexity === complexity);
}

/**
 * Check if strategy ID is valid
 */
export function isValidStrategyId(id: string): id is StrategyId {
  return id in STRATEGIES;
}
