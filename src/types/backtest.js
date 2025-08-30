"use strict";
/**
 * TypeScript types for Backtest Results
 *
 * These types match our Rust Tauri backend structure,
 * ensuring type safety across the entire application stack.
 * Updated for Tauri v2.4.0 compatibility.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRATEGY_OPTIONS = void 0;
// Strategy options for the UI
exports.STRATEGY_OPTIONS = [
    { value: 'PMCC', label: 'Poor Man\'s Covered Call' },
    { value: 'Wheel', label: 'The Wheel Strategy' },
    { value: 'CoveredCall', label: 'Covered Call' },
    { value: 'iron_condor', label: 'Iron Condor' },
    { value: 'bull_put_spread', label: 'Bull Put Spread' }
];
