// src/lib/strategies/presets.ts
// Predefined parameter sets for each strategy

import { StrategyId } from './index';

export interface StrategyPreset {
  name: string;
  description: string;
  riskLevel: 'Conservative' | 'Moderate' | 'Aggressive';
  params: Record<string, any>;
  notes?: string;
}

export const PRESETS: Record<StrategyId, StrategyPreset[]> = {
  PMCC: [
    {
      name: 'Conservative PMCC',
      description: 'Lower risk with deep ITM long calls and OTM short calls',
      riskLevel: 'Conservative',
      params: {
        delta_long: 0.85,
        delta_short: 0.25,
        dte_long: 120,
        dte_short: 30,
        profit_target: 25,
        loss_limit: 150
      },
      notes: 'Best for beginners - high probability of profit with limited upside'
    },
    {
      name: 'Balanced PMCC',
      description: 'Standard approach balancing risk and reward',
      riskLevel: 'Moderate',
      params: {
        delta_long: 0.8,
        delta_short: 0.3,
        dte_long: 90,
        dte_short: 30,
        profit_target: 50,
        loss_limit: 200
      },
      notes: 'Most popular configuration - good balance of risk and reward'
    },
    {
      name: 'Aggressive PMCC',
      description: 'Higher risk/reward with closer strikes',
      riskLevel: 'Aggressive',
      params: {
        delta_long: 0.75,
        delta_short: 0.35,
        dte_long: 60,
        dte_short: 21,
        profit_target: 75,
        loss_limit: 250
      },
      notes: 'Higher potential returns but increased risk of early assignment'
    }
  ],

  Wheel: [
    {
      name: 'Conservative Wheel',
      description: 'Low delta puts for high-probability income',
      riskLevel: 'Conservative',
      params: {
        put_delta: 0.2,
        call_delta: 0.25,
        dte: 45,
        profit_target: 25,
        roll_threshold: 10
      },
      notes: 'Lower assignment probability but also lower premium income'
    },
    {
      name: 'Standard Wheel',
      description: 'Balanced approach for steady income',
      riskLevel: 'Moderate',
      params: {
        put_delta: 0.3,
        call_delta: 0.3,
        dte: 30,
        profit_target: 50,
        roll_threshold: 7
      },
      notes: 'Most common wheel configuration - good balance of income and risk'
    },
    {
      name: 'Aggressive Wheel',
      description: 'Higher delta for maximum premium collection',
      riskLevel: 'Aggressive',
      params: {
        put_delta: 0.4,
        call_delta: 0.35,
        dte: 21,
        profit_target: 75,
        roll_threshold: 5
      },
      notes: 'Higher income but increased assignment probability'
    }
  ],

  CoveredCall: [
    {
      name: 'Conservative Covered Call',
      description: 'Far OTM calls to minimize assignment risk',
      riskLevel: 'Conservative',
      params: {
        call_delta: 0.2,
        dte: 45,
        profit_target: 25,
        roll_up_threshold: 15,
        assignment_action: 'sell_puts'
      },
      notes: 'Low assignment risk but also lower premium income'
    },
    {
      name: 'Income Focused',
      description: 'Balanced approach for steady income',
      riskLevel: 'Moderate',
      params: {
        call_delta: 0.3,
        dte: 30,
        profit_target: 50,
        roll_up_threshold: 10,
        assignment_action: 'sell_puts'
      },
      notes: 'Good balance of income and assignment risk'
    },
    {
      name: 'High Income',
      description: 'Closer strikes for maximum premium',
      riskLevel: 'Aggressive',
      params: {
        call_delta: 0.4,
        dte: 21,
        profit_target: 75,
        roll_up_threshold: 8,
        assignment_action: 'rebuy_stock'
      },
      notes: 'Maximum income but higher assignment probability'
    }
  ],

  iron_condor: [
    {
      name: 'Wide Iron Condor',
      description: 'Wide strikes for high probability of profit',
      riskLevel: 'Conservative',
      params: {
        call_delta: 0.2,
        put_delta: 0.2,
        wing_width: 10,
        dte: 45,
        profit_target: 25,
        loss_limit: 150
      },
      notes: 'High probability of profit but lower premium collected'
    },
    {
      name: 'Standard Iron Condor',
      description: 'Balanced risk/reward configuration',
      riskLevel: 'Moderate',
      params: {
        call_delta: 0.25,
        put_delta: 0.25,
        wing_width: 10,
        dte: 45,
        profit_target: 50,
        loss_limit: 200
      },
      notes: 'Most popular iron condor setup - good balance'
    },
    {
      name: 'Tight Iron Condor',
      description: 'Closer strikes for higher premium',
      riskLevel: 'Aggressive',
      params: {
        call_delta: 0.3,
        put_delta: 0.3,
        wing_width: 5,
        dte: 30,
        profit_target: 75,
        loss_limit: 250
      },
      notes: 'Higher premium but lower probability of profit'
    },
    {
      name: 'Earnings Play',
      description: 'Short-term condor for earnings volatility crush',
      riskLevel: 'Aggressive',
      params: {
        call_delta: 0.25,
        put_delta: 0.25,
        wing_width: 15,
        dte: 7,
        profit_target: 50,
        loss_limit: 200
      },
      notes: 'Designed to profit from post-earnings volatility collapse'
    }
  ],

  bull_put_spread: [
    {
      name: 'Conservative Bull Put',
      description: 'Far OTM puts for high probability',
      riskLevel: 'Conservative',
      params: {
        short_delta: 0.2,
        long_delta: 0.1,
        dte: 45,
        profit_target: 25,
        loss_limit: 150,
        width_dollars: 5
      },
      notes: 'High probability of profit with limited premium'
    },
    {
      name: 'Standard Bull Put',
      description: 'Balanced approach for steady income',
      riskLevel: 'Moderate',
      params: {
        short_delta: 0.3,
        long_delta: 0.15,
        dte: 30,
        profit_target: 50,
        loss_limit: 200,
        width_dollars: 5
      },
      notes: 'Good balance of premium and probability'
    },
    {
      name: 'Aggressive Bull Put',
      description: 'Closer to ATM for maximum premium',
      riskLevel: 'Aggressive',
      params: {
        short_delta: 0.4,
        long_delta: 0.2,
        dte: 21,
        profit_target: 75,
        loss_limit: 250,
        width_dollars: 10
      },
      notes: 'Higher premium but increased assignment risk'
    },
    {
      name: 'Weekly Bull Put',
      description: 'Short-term spread for quick profits',
      riskLevel: 'Aggressive',
      params: {
        short_delta: 0.25,
        long_delta: 0.15,
        dte: 7,
        profit_target: 50,
        loss_limit: 200,
        width_dollars: 2.5
      },
      notes: 'Fast theta decay but higher gamma risk'
    }
  ]
};

/**
 * Get presets for a specific strategy
 */
export function getPresets(strategyId: StrategyId): StrategyPreset[] {
  return PRESETS[strategyId] || [];
}

/**
 * Get a specific preset by strategy and name
 */
export function getPreset(strategyId: StrategyId, presetName: string): StrategyPreset | undefined {
  const presets = getPresets(strategyId);
  return presets.find(preset => preset.name === presetName);
}

/**
 * Get presets by risk level
 */
export function getPresetsByRiskLevel(
  strategyId: StrategyId, 
  riskLevel: StrategyPreset['riskLevel']
): StrategyPreset[] {
  const presets = getPresets(strategyId);
  return presets.filter(preset => preset.riskLevel === riskLevel);
}

/**
 * Get default preset for a strategy (first conservative, then first available)
 */
export function getDefaultPreset(strategyId: StrategyId): StrategyPreset | undefined {
  const presets = getPresets(strategyId);
  
  // Try to find conservative preset first
  const conservative = presets.find(p => p.riskLevel === 'Conservative');
  if (conservative) return conservative;
  
  // Fall back to first available preset
  return presets[0];
}

/**
 * Create custom preset
 */
export function createCustomPreset(
  name: string,
  description: string,
  riskLevel: StrategyPreset['riskLevel'],
  params: Record<string, any>,
  notes?: string
): StrategyPreset {
  return {
    name,
    description,
    riskLevel,
    params,
    notes
  };
}

/**
 * Get all risk levels
 */
export function getRiskLevels(): StrategyPreset['riskLevel'][] {
  return ['Conservative', 'Moderate', 'Aggressive'];
}

/**
 * Get preset statistics
 */
export function getPresetStats(): Record<StrategyId, { total: number; byRisk: Record<string, number> }> {
  const stats: Record<string, { total: number; byRisk: Record<string, number> }> = {};
  
  Object.entries(PRESETS).forEach(([strategyId, presets]) => {
    const byRisk: Record<string, number> = {};
    
    presets.forEach(preset => {
      byRisk[preset.riskLevel] = (byRisk[preset.riskLevel] || 0) + 1;
    });
    
    stats[strategyId] = {
      total: presets.length,
      byRisk
    };
  });
  
  return stats as Record<StrategyId, { total: number; byRisk: Record<string, number> }>;
}
