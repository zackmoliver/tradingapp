// src/lib/strategies/schemas.ts
// Lightweight parameter validation without external dependencies

import { StrategyId, getStrategy, StrategyParameter } from './index';

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate strategy parameters
 */
export function validateParams(strategyId: StrategyId, params: Record<string, any>): ValidationResult {
  try {
    const strategy = getStrategy(strategyId);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate each parameter
    for (const paramDef of strategy.parameters) {
      const value = params[paramDef.name];
      const validation = validateParameter(paramDef, value);
      
      if (!validation.ok && validation.errors) {
        errors.push(...validation.errors);
      }
      
      if (validation.warnings) {
        warnings.push(...validation.warnings);
      }
    }

    // Strategy-specific cross-parameter validation
    const crossValidation = validateCrossParameters(strategyId, params);
    if (!crossValidation.ok && crossValidation.errors) {
      errors.push(...crossValidation.errors);
    }
    if (crossValidation.warnings) {
      warnings.push(...crossValidation.warnings);
    }

    return {
      ok: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };

  } catch (error) {
    return {
      ok: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Validate a single parameter
 */
function validateParameter(paramDef: StrategyParameter, value: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if value exists
  if (value === undefined || value === null || value === '') {
    errors.push(`${paramDef.label} is required`);
    return { ok: false, errors };
  }

  // Type validation
  switch (paramDef.type) {
    case 'number':
      if (!isValidNumber(value)) {
        errors.push(`${paramDef.label} must be a valid number`);
        break;
      }
      
      const numValue = Number(value);
      
      // Range validation
      if (paramDef.min !== undefined && numValue < paramDef.min) {
        errors.push(`${paramDef.label} must be at least ${paramDef.min}`);
      }
      if (paramDef.max !== undefined && numValue > paramDef.max) {
        errors.push(`${paramDef.label} must be at most ${paramDef.max}`);
      }
      
      // Step validation
      if (paramDef.step !== undefined && paramDef.min !== undefined) {
        const steps = (numValue - paramDef.min) / paramDef.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-10) {
          errors.push(`${paramDef.label} must be in increments of ${paramDef.step}`);
        }
      }
      
      // Warnings for edge values
      if (paramDef.min !== undefined && paramDef.max !== undefined) {
        const range = paramDef.max - paramDef.min;
        if (numValue <= paramDef.min + range * 0.1) {
          warnings.push(`${paramDef.label} is near minimum value - consider higher values`);
        }
        if (numValue >= paramDef.max - range * 0.1) {
          warnings.push(`${paramDef.label} is near maximum value - consider lower values`);
        }
      }
      break;

    case 'integer':
      if (!isValidInteger(value)) {
        errors.push(`${paramDef.label} must be a valid integer`);
        break;
      }
      
      const intValue = parseInt(value, 10);
      
      // Range validation
      if (paramDef.min !== undefined && intValue < paramDef.min) {
        errors.push(`${paramDef.label} must be at least ${paramDef.min}`);
      }
      if (paramDef.max !== undefined && intValue > paramDef.max) {
        errors.push(`${paramDef.label} must be at most ${paramDef.max}`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        errors.push(`${paramDef.label} must be true or false`);
      }
      break;

    case 'select':
      if (paramDef.options) {
        const validValues = paramDef.options.map(opt => opt.value);
        if (!validValues.includes(value)) {
          errors.push(`${paramDef.label} must be one of: ${validValues.join(', ')}`);
        }
      }
      break;
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Cross-parameter validation for strategy-specific rules
 */
function validateCrossParameters(strategyId: StrategyId, params: Record<string, any>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (strategyId) {
    case 'PMCC':
      // Long delta should be higher than short delta
      if (params.delta_long && params.delta_short) {
        if (Number(params.delta_long) <= Number(params.delta_short)) {
          errors.push('Long call delta must be higher than short call delta');
        }
        
        const deltaSpread = Number(params.delta_long) - Number(params.delta_short);
        if (deltaSpread < 0.3) {
          warnings.push('Consider wider delta spread for better risk/reward');
        }
      }
      
      // Long DTE should be much longer than short DTE
      if (params.dte_long && params.dte_short) {
        const longDte = Number(params.dte_long);
        const shortDte = Number(params.dte_short);
        
        if (longDte <= shortDte) {
          errors.push('Long call DTE must be longer than short call DTE');
        }
        
        if (longDte < shortDte * 2) {
          warnings.push('Consider longer DTE for long call (at least 2x short DTE)');
        }
      }
      break;

    case 'Wheel':
      // Put and call deltas should be similar for consistency
      if (params.put_delta && params.call_delta) {
        const putDelta = Number(params.put_delta);
        const callDelta = Number(params.call_delta);
        
        if (Math.abs(putDelta - callDelta) > 0.1) {
          warnings.push('Consider similar deltas for puts and calls for consistent risk');
        }
      }
      break;

    case 'iron_condor':
      // Call and put deltas should be similar for balanced risk
      if (params.call_delta && params.put_delta) {
        const callDelta = Number(params.call_delta);
        const putDelta = Number(params.put_delta);
        
        if (Math.abs(callDelta - putDelta) > 0.05) {
          warnings.push('Consider matching call and put deltas for balanced risk');
        }
      }
      
      // Wing width vs DTE relationship
      if (params.wing_width && params.dte) {
        const wingWidth = Number(params.wing_width);
        const dte = Number(params.dte);
        
        if (wingWidth > 20 && dte < 30) {
          warnings.push('Wide wings with short DTE increases gamma risk');
        }
      }
      break;

    case 'bull_put_spread':
      // Short delta should be higher than long delta
      if (params.short_delta && params.long_delta) {
        const shortDelta = Number(params.short_delta);
        const longDelta = Number(params.long_delta);
        
        if (shortDelta <= longDelta) {
          errors.push('Short put delta must be higher than long put delta');
        }
        
        const deltaSpread = shortDelta - longDelta;
        if (deltaSpread < 0.1) {
          warnings.push('Consider wider delta spread for better credit');
        }
      }
      
      // Width validation
      if (params.width_dollars && params.short_delta) {
        const width = Number(params.width_dollars);
        const shortDelta = Number(params.short_delta);
        
        if (width > 10 && shortDelta > 0.35) {
          warnings.push('Wide spreads with high delta increase assignment risk');
        }
      }
      break;

    case 'CoveredCall':
      // Roll up threshold should be reasonable
      if (params.roll_up_threshold && params.call_delta) {
        const rollThreshold = Number(params.roll_up_threshold);
        const callDelta = Number(params.call_delta);
        
        if (rollThreshold < 5 && callDelta > 0.4) {
          warnings.push('Low roll threshold with high delta may cause frequent adjustments');
        }
      }
      break;
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Get detailed validation errors with field information
 */
export function getDetailedValidation(strategyId: StrategyId, params: Record<string, any>): ValidationError[] {
  const strategy = getStrategy(strategyId);
  const errors: ValidationError[] = [];

  // Validate each parameter
  for (const paramDef of strategy.parameters) {
    const value = params[paramDef.name];
    const validation = validateParameter(paramDef, value);
    
    if (validation.errors) {
      validation.errors.forEach(error => {
        errors.push({
          field: paramDef.name,
          message: error,
          severity: 'error'
        });
      });
    }
    
    if (validation.warnings) {
      validation.warnings.forEach(warning => {
        errors.push({
          field: paramDef.name,
          message: warning,
          severity: 'warning'
        });
      });
    }
  }

  // Cross-parameter validation
  const crossValidation = validateCrossParameters(strategyId, params);
  if (crossValidation.errors) {
    crossValidation.errors.forEach(error => {
      errors.push({
        field: 'general',
        message: error,
        severity: 'error'
      });
    });
  }
  
  if (crossValidation.warnings) {
    crossValidation.warnings.forEach(warning => {
      errors.push({
        field: 'general',
        message: warning,
        severity: 'warning'
      });
    });
  }

  return errors;
}

/**
 * Sanitize and convert parameter values to correct types
 */
export function sanitizeParams(strategyId: StrategyId, params: Record<string, any>): Record<string, any> {
  const strategy = getStrategy(strategyId);
  const sanitized: Record<string, any> = {};

  for (const paramDef of strategy.parameters) {
    const value = params[paramDef.name];
    
    if (value === undefined || value === null || value === '') {
      sanitized[paramDef.name] = paramDef.default;
      continue;
    }

    switch (paramDef.type) {
      case 'number':
        sanitized[paramDef.name] = Number(value);
        break;
      case 'integer':
        sanitized[paramDef.name] = parseInt(value, 10);
        break;
      case 'boolean':
        sanitized[paramDef.name] = value === true || value === 'true';
        break;
      case 'select':
        sanitized[paramDef.name] = value;
        break;
      default:
        sanitized[paramDef.name] = value;
    }
  }

  return sanitized;
}

// Utility functions
function isValidNumber(value: any): boolean {
  return !isNaN(Number(value)) && isFinite(Number(value));
}

function isValidInteger(value: any): boolean {
  const num = Number(value);
  return !isNaN(num) && isFinite(num) && Number.isInteger(num);
}
