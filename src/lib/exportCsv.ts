/**
 * CSV Export Utility
 * 
 * Professional CSV export functionality for backtest results.
 * Generates properly formatted CSV files compatible with Excel/Numbers.
 * 
 * Features:
 * - Equity curve data export
 * - Top-level metrics summary
 * - Proper CSV formatting with headers
 * - Excel/Numbers compatibility
 * - Automatic file download
 */

import { BacktestSummary } from '../types/backtest';
import { parseMMDDYYYY, toMMDDYYYY, normalizeToMMDDYYYY } from './date';
import { calculateAllMetrics } from './metrics';

/**
 * CSV export configuration
 */
interface CsvExportConfig {
  includeMetadata?: boolean;
  dateFormat?: 'MM/DD/YYYY' | 'YYYY-MM-DD';
  decimalPlaces?: number;
  delimiter?: string;
}

/**
 * Default export configuration
 */
const DEFAULT_CONFIG: CsvExportConfig = {
  includeMetadata: true,
  dateFormat: 'MM/DD/YYYY',
  decimalPlaces: 2,
  delimiter: ','
};

/**
 * Format number for CSV export
 */
const formatNumber = (value: number, decimalPlaces: number = 2): string => {
  if (isNaN(value) || !isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(decimalPlaces);
};

/**
 * Format percentage for CSV export
 */
const formatPercentage = (value: number, decimalPlaces: number = 2): string => {
  return formatNumber(value * 100, decimalPlaces);
};

/**
 * Format currency for CSV export
 */
const formatCurrency = (value: number, decimalPlaces: number = 2): string => {
  return formatNumber(value, decimalPlaces);
};

/**
 * Escape CSV field value
 */
const escapeCsvField = (value: string | number): string => {
  const stringValue = String(value);
  
  // If the field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
};

/**
 * Generate filename for CSV export
 */
const generateFilename = (summary: BacktestSummary): string => {
  // Clean strategy name for filename
  const cleanStrategy = summary.strategy
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .toLowerCase();

  // Clean symbol for filename
  const cleanSymbol = (summary.symbol || 'UNKNOWN')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .toUpperCase();

  // Convert dates to filename-safe format (ensure MM/DD/YYYY first)
  const normalizedStart = normalizeToMMDDYYYY(summary.start);
  const normalizedEnd = normalizeToMMDDYYYY(summary.end);
  const cleanStartDate = normalizedStart.replace(/\//g, '-');
  const cleanEndDate = normalizedEnd.replace(/\//g, '-');

  return `backtest_${cleanStrategy}_${cleanSymbol}_${cleanStartDate}_${cleanEndDate}.csv`;
};

/**
 * Generate CSV content from backtest summary
 */
export const generateCsvContent = (
  summary: BacktestSummary, 
  config: CsvExportConfig = DEFAULT_CONFIG
): string => {
  const { includeMetadata, decimalPlaces, delimiter } = { ...DEFAULT_CONFIG, ...config };
  const lines: string[] = [];
  
  // Add metadata section if requested
  if (includeMetadata) {
    lines.push('# Backtest Results Export');
    lines.push(`# Generated: ${new Date().toLocaleString()}`);
    lines.push('');
    
    // Top-level metrics section
    lines.push('# Summary Metrics');
    lines.push(`Strategy${delimiter}${escapeCsvField(summary.strategy)}`);
    lines.push(`Symbol${delimiter}${escapeCsvField(summary.symbol || 'N/A')}`);
    lines.push(`Date Range${delimiter}${escapeCsvField(summary.start)} to ${escapeCsvField(summary.end)}`);
    lines.push(`Total Trades${delimiter}${summary.trades}`);
    lines.push(`Win Rate (%)${delimiter}${formatPercentage(summary.win_rate, decimalPlaces)}`);
    lines.push(`CAGR (%)${delimiter}${formatPercentage(summary.cagr, decimalPlaces)}`);
    lines.push(`Max Drawdown (%)${delimiter}${formatPercentage(Math.abs(summary.max_dd), decimalPlaces)}`);

    // Calculate additional metrics using the metrics library
    const advancedMetrics = calculateAllMetrics(summary.equity_curve, summary.trade_log);
    lines.push(`Sharpe Ratio${delimiter}${formatNumber(advancedMetrics.sharpe, 3)}`);
    lines.push(`Sortino Ratio${delimiter}${formatNumber(advancedMetrics.sortino, 3)}`);
    lines.push(`Profit Factor${delimiter}${formatNumber(advancedMetrics.profitFactor, 3)}`);
    lines.push(`Volatility (%)${delimiter}${formatPercentage(advancedMetrics.volatility, decimalPlaces)}`);

    // Enhanced metrics from new backtest engine (if available)
    if ((summary as any).sharpeRatio !== undefined) {
      lines.push(`Sharpe Ratio (Enhanced)${delimiter}${formatNumber((summary as any).sharpeRatio, 3)}`);
    }
    if ((summary as any).sortinoRatio !== undefined) {
      lines.push(`Sortino Ratio (Enhanced)${delimiter}${formatNumber((summary as any).sortinoRatio, 3)}`);
    }
    if ((summary as any).profitFactor !== undefined) {
      lines.push(`Profit Factor (Enhanced)${delimiter}${formatNumber((summary as any).profitFactor, 3)}`);
    }
    if ((summary as any).calmarRatio !== undefined) {
      lines.push(`Calmar Ratio${delimiter}${formatNumber((summary as any).calmarRatio, 3)}`);
    }
    if ((summary as any).var95 !== undefined) {
      lines.push(`VaR 95% (%)${delimiter}${formatPercentage((summary as any).var95, decimalPlaces)}`);
    }
    if ((summary as any).expectedShortfall !== undefined) {
      lines.push(`Expected Shortfall (%)${delimiter}${formatPercentage((summary as any).expectedShortfall, decimalPlaces)}`);
    }
    if ((summary as any).statisticalPower !== undefined) {
      lines.push(`Statistical Power (%)${delimiter}${formatPercentage((summary as any).statisticalPower, decimalPlaces)}`);
    }

    // Calculate additional metrics
    const initialCapital = summary.equity_curve[0]?.equity || summary.capital || 100000;
    const finalCapital = summary.equity_curve[summary.equity_curve.length - 1]?.equity || 0;
    const totalReturn = initialCapital > 0 ? (finalCapital - initialCapital) / initialCapital : 0;

    lines.push(`Initial Capital${delimiter}"${formatCurrency(initialCapital, 0)}"`); // Quoted for Excel comma formatting
    lines.push(`Final Capital${delimiter}"${formatCurrency(finalCapital, 0)}"`);
    lines.push(`Total Return (%)${delimiter}${formatPercentage(totalReturn, decimalPlaces)}`);
    lines.push(`Total P&L${delimiter}"${formatCurrency(finalCapital - initialCapital, 0)}"`);
    lines.push(`Data Points${delimiter}${summary.equity_curve.length}`);

    // Statistical warnings (if available)
    if ((summary as any).warnings && Array.isArray((summary as any).warnings)) {
      lines.push('');
      lines.push('# Statistical Warnings');
      (summary as any).warnings.forEach((warning: string, i: number) => {
        lines.push(`Warning ${i + 1}${delimiter}${escapeCsvField(warning)}`);
      });
    }
    lines.push('');
  }
  
  // Equity curve data section
  lines.push('# Time Series Data');

  // Headers for equity curve
  const headers = [
    'Date',
    'Equity',
    'Daily Return (%)',
    'Cumulative Return (%)',
    'Drawdown (%)',
    'Running Max'
  ];
  lines.push(headers.map(h => escapeCsvField(h)).join(delimiter));

  // Data rows with enhanced calculations
  const initialValue = summary.equity_curve[0]?.equity || summary.capital || 100000;
  let runningMax = initialValue;
  let previousEquity = initialValue;

  summary.equity_curve.forEach((point, index) => {
    // Update running maximum
    if (point.equity > runningMax) {
      runningMax = point.equity;
    }

    // Calculate daily return
    const dailyReturn = index > 0 && previousEquity > 0
      ? (point.equity - previousEquity) / previousEquity
      : 0;

    // Calculate cumulative return
    const cumulativeReturn = initialValue > 0 ? (point.equity - initialValue) / initialValue : 0;

    // Calculate drawdown from running max
    const drawdown = runningMax > 0 ? (point.equity - runningMax) / runningMax : 0;

    const row = [
      escapeCsvField(point.t),
      `"${formatCurrency(point.equity, 0)}"`, // Quoted for Excel comma formatting
      formatPercentage(dailyReturn, 4),
      formatPercentage(cumulativeReturn, decimalPlaces),
      formatPercentage(Math.abs(drawdown), decimalPlaces),
      `"${formatCurrency(runningMax, 0)}"`
    ];

    lines.push(row.join(delimiter));
    previousEquity = point.equity;
  });
  
  // Add trade log section if available
  if (summary.trade_log && summary.trade_log.length > 0) {
    lines.push('');
    lines.push('# Trade Log');

    const tradeHeaders = [
      'Date',
      'Action',
      'Quantity',
      'Price',
      'Trade P&L',
      'Cumulative P&L',
      'Note'
    ];
    lines.push(tradeHeaders.map(h => escapeCsvField(h)).join(delimiter));

    summary.trade_log.forEach(trade => {
      const row = [
        escapeCsvField(trade.date),
        escapeCsvField(trade.side),
        trade.qty.toString(),
        `"${formatCurrency(trade.price, decimalPlaces)}"`,
        `"${formatCurrency(trade.pnl, decimalPlaces)}"`,
        `"${formatCurrency(trade.cum_pnl, decimalPlaces)}"`,
        escapeCsvField(trade.note || '')
      ];

      lines.push(row.join(delimiter));
    });
  }

  return lines.join('\n');
};

/**
 * Export backtest summary to CSV file
 */
export const exportBacktestToCsv = (
  summary: BacktestSummary,
  config: CsvExportConfig = DEFAULT_CONFIG
): void => {
  try {
    // Generate CSV content
    const csvContent = generateCsvContent(summary, config);
    
    // Create blob with proper MIME type for Excel compatibility
    const blob = new Blob([csvContent], { 
      type: 'text/csv;charset=utf-8;' 
    });
    
    // Generate filename
    const filename = generateFilename(summary);
    
    // Create download link and trigger download
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    // Add to DOM, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up object URL
    URL.revokeObjectURL(url);
    
    console.log(`CSV exported successfully: ${filename}`);
    
  } catch (error) {
    console.error('Failed to export CSV:', error);
    throw new Error('Failed to export CSV file. Please try again.');
  }
};

/**
 * Validate backtest summary for export
 */
export const validateSummaryForExport = (summary: BacktestSummary): boolean => {
  if (!summary) {
    throw new Error('No backtest data available for export');
  }
  
  if (!summary.equity_curve || summary.equity_curve.length === 0) {
    throw new Error('No equity curve data available for export');
  }
  
  if (!summary.strategy || !summary.start || !summary.end) {
    throw new Error('Incomplete backtest metadata for export');
  }
  
  return true;
};

/**
 * Export with validation and error handling
 */
export const safeExportBacktestToCsv = (
  summary: BacktestSummary,
  config: CsvExportConfig = DEFAULT_CONFIG
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      // Validate data
      validateSummaryForExport(summary);
      
      // Export CSV
      exportBacktestToCsv(summary, config);
      
      resolve();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Preview CSV content (for debugging)
 */
export const previewCsvContent = (
  summary: BacktestSummary,
  config: CsvExportConfig = DEFAULT_CONFIG
): string => {
  try {
    validateSummaryForExport(summary);
    return generateCsvContent(summary, config);
  } catch (error) {
    return `Error generating CSV preview: ${error}`;
  }
};

/**
 * Get export statistics
 */
export const getExportStats = (summary: BacktestSummary): {
  filename: string;
  dataPoints: number;
  estimatedSize: string;
  duration: string;
} => {
  const filename = generateFilename(summary);
  const dataPoints = summary.equity_curve.length;
  
  // Estimate file size (rough calculation)
  const avgRowSize = 50; // bytes per row
  const headerSize = 500; // bytes for headers and metadata
  const estimatedBytes = (dataPoints * avgRowSize) + headerSize;
  const estimatedSize = estimatedBytes < 1024 
    ? `${estimatedBytes} B`
    : `${(estimatedBytes / 1024).toFixed(1)} KB`;
  
  // Calculate duration
  const startDate = new Date(summary.start);
  const endDate = new Date(summary.end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const duration = diffDays < 30 
    ? `${diffDays} days`
    : diffDays < 365 
    ? `${Math.round(diffDays / 30)} months`
    : `${Math.round(diffDays / 365)} years`;
  
  return {
    filename,
    dataPoints,
    estimatedSize,
    duration
  };
};

/**
 * Export allocation data to CSV
 */
export const exportAllocationToCsv = (
  allocations: Record<string, number>,
  filename: string = 'allocation.csv'
): void => {
  const header = 'Strategy,Allocation (%)';
  const rows = Object.entries(allocations)
    .map(([strategy, allocation]) => `${escapeCsvField(strategy)},${formatPercentage(allocation, 2)}`)
    .join('\n');

  const csvContent = `${header}\n${rows}`;

  // Create and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export comprehensive backtest results with all metrics and data
 * This is the main export function that includes everything
 */
export const exportCompleteBacktestResults = (
  summary: BacktestSummary,
  options: {
    includeMetrics?: boolean;
    includeEquityCurve?: boolean;
    includeTradeLog?: boolean;
    delimiter?: string;
    decimalPlaces?: number;
  } = {}
): void => {
  const {
    includeMetrics = true,
    includeEquityCurve = true,
    includeTradeLog = true,
    delimiter = ',',
    decimalPlaces = 2
  } = options;

  const csvContent = generateCsvContent(summary, { delimiter, decimalPlaces });
  const filename = generateFilename(summary);

  // Create and download the CSV file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export batch backtest results to CSV
 */
export const exportBatchResults = (
  items: import('@/types/batch').BatchBacktestItem[],
  options: Partial<import('@/types/batch').BatchCsvExportOptions> = {}
): void => {
  const {
    includeMetrics = true,
    includeTimestamps = true,
    includeErrors = true,
    sortBy = 'ticker',
    sortOrder = 'asc'
  } = options;

  // Filter completed items
  const completedItems = items.filter(item => item.status === 'completed' && item.result);

  if (completedItems.length === 0) {
    console.warn('No completed batch results to export');
    return;
  }

  // Sort items
  const sortedItems = [...completedItems].sort((a, b) => {
    let aValue: any, bValue: any;

    switch (sortBy) {
      case 'ticker':
        aValue = a.ticker;
        bValue = b.ticker;
        break;
      case 'strategy':
        aValue = a.strategy;
        bValue = b.strategy;
        break;
      case 'cagr':
        aValue = a.result?.cagr || 0;
        bValue = b.result?.cagr || 0;
        break;
      case 'win_rate':
        aValue = a.result?.win_rate || 0;
        bValue = b.result?.win_rate || 0;
        break;
      case 'duration':
        aValue = (a.endTime && a.startTime) ? a.endTime - a.startTime : 0;
        bValue = (b.endTime && b.startTime) ? b.endTime - b.startTime : 0;
        break;
      default:
        aValue = a.ticker;
        bValue = b.ticker;
    }

    const comparison = typeof aValue === 'string'
      ? aValue.localeCompare(bValue)
      : aValue - bValue;

    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Build CSV content
  const lines: string[] = [];
  const delimiter = ',';

  // Header
  lines.push('# Batch Backtest Results');
  lines.push(`Generated${delimiter}${new Date().toISOString()}`);
  lines.push(`Total Items${delimiter}${items.length}`);
  lines.push(`Successful${delimiter}${completedItems.length}`);
  lines.push(`Failed${delimiter}${items.filter(i => i.status === 'failed').length}`);
  lines.push('');

  // Column headers
  const headers = [
    'Ticker',
    'Strategy',
    'Start Date',
    'End Date',
    'Initial Capital',
  ];

  if (includeMetrics) {
    headers.push(
      'CAGR (%)',
      'Win Rate (%)',
      'Max Drawdown (%)',
      'Total Trades',
      'Final Capital',
      'Total Return (%)'
    );
  }

  if (includeTimestamps) {
    headers.push('Start Time', 'End Time', 'Duration (ms)');
  }

  if (includeErrors) {
    headers.push('Status', 'Error');
  }

  lines.push(headers.map(h => escapeCsvField(h)).join(delimiter));

  // Data rows
  sortedItems.forEach(item => {
    const row: string[] = [
      escapeCsvField(item.ticker),
      escapeCsvField(item.strategy),
      escapeCsvField(item.start_date),
      escapeCsvField(item.end_date),
      `"${formatCurrency(item.initial_capital, 0)}"`,
    ];

    if (includeMetrics && item.result) {
      const finalCapital = item.result.equity_curve[item.result.equity_curve.length - 1]?.equity || item.initial_capital;
      const totalReturn = (finalCapital - item.initial_capital) / item.initial_capital;

      row.push(
        formatPercentage(item.result.cagr, 2),
        formatPercentage(item.result.win_rate, 2),
        formatPercentage(Math.abs(item.result.max_dd), 2),
        item.result.trades.toString(),
        `"${formatCurrency(finalCapital, 0)}"`,
        formatPercentage(totalReturn, 2)
      );
    } else if (includeMetrics) {
      row.push('', '', '', '', '', '');
    }

    if (includeTimestamps) {
      row.push(
        item.startTime ? new Date(item.startTime).toISOString() : '',
        item.endTime ? new Date(item.endTime).toISOString() : '',
        (item.startTime && item.endTime) ? (item.endTime - item.startTime).toString() : ''
      );
    }

    if (includeErrors) {
      row.push(
        escapeCsvField(item.status),
        escapeCsvField(item.error || '')
      );
    }

    lines.push(row.join(delimiter));
  });

  // Generate filename
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `batch_backtest_results_${timestamp}.csv`;

  // Download
  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export enhanced trade log to CSV with tags and additional fields
 */
export const exportEnhancedTradesToCsv = (
  trades: any[],
  filename: string = 'enhanced_trade_log.csv'
): void => {
  if (trades.length === 0) {
    console.warn('No trades to export');
    return;
  }

  const lines: string[] = [];
  const delimiter = ',';

  // Header with enhanced fields
  const headers = [
    'Date',
    'Side',
    'Symbol',
    'Quantity',
    'Price',
    'P&L',
    'Cumulative P&L',
    'Entry Rule',
    'Exit Rule',
    'Market Regime',
    'Duration (Days)',
    'Max Profit',
    'Max Loss',
    'Tags'
  ];

  lines.push(headers.map(h => escapeCsvField(h)).join(delimiter));

  // Data rows with enhanced fields
  trades.forEach(trade => {
    const row = [
      escapeCsvField(trade.date || ''),
      escapeCsvField(trade.side || trade.action || ''),
      escapeCsvField(trade.symbol || ''),
      trade.quantity?.toString() || '0',
      trade.price?.toString() || '0',
      trade.pnl?.toString() || '0',
      trade.cumulative_pnl?.toString() || '0',
      escapeCsvField(trade.entry_rule || ''),
      escapeCsvField(trade.exit_rule || ''),
      escapeCsvField(trade.regime || ''),
      trade.duration_days?.toString() || '',
      trade.max_profit?.toString() || '',
      trade.max_loss?.toString() || '',
      escapeCsvField(trade.tags ? trade.tags.join('; ') : '')
    ];

    lines.push(row.join(delimiter));
  });

  // Generate and download
  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
