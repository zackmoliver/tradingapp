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
  
  // Convert dates to filename-safe format
  const cleanStartDate = summary.start.replace(/\//g, '-');
  const cleanEndDate = summary.end.replace(/\//g, '-');
  
  return `backtest_${cleanStrategy}_${cleanStartDate}_${cleanEndDate}.csv`;
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
    lines.push(`Start Date${delimiter}${escapeCsvField(summary.start)}`);
    lines.push(`End Date${delimiter}${escapeCsvField(summary.end)}`);
    lines.push(`Total Trades${delimiter}${summary.trades}`);
    lines.push(`Win Rate (%)${delimiter}${formatPercentage(summary.win_rate, decimalPlaces)}`);
    lines.push(`CAGR (%)${delimiter}${formatPercentage(summary.cagr, decimalPlaces)}`);
    lines.push(`Max Drawdown (%)${delimiter}${formatPercentage(Math.abs(summary.max_dd), decimalPlaces)}`);
    
    // Calculate additional metrics
    const initialCapital = summary.equity_curve[0]?.equity || 0;
    const finalCapital = summary.equity_curve[summary.equity_curve.length - 1]?.equity || 0;
    const totalReturn = initialCapital > 0 ? (finalCapital - initialCapital) / initialCapital : 0;
    
    lines.push(`Initial Capital${delimiter}${formatCurrency(initialCapital, decimalPlaces)}`);
    lines.push(`Final Capital${delimiter}${formatCurrency(finalCapital, decimalPlaces)}`);
    lines.push(`Total Return (%)${delimiter}${formatPercentage(totalReturn, decimalPlaces)}`);
    lines.push(`Data Points${delimiter}${summary.equity_curve.length}`);
    lines.push('');
  }
  
  // Equity curve data section
  lines.push('# Equity Curve Data');
  
  // Headers for equity curve
  const headers = [
    'Date',
    'Portfolio Value',
    'Cumulative Return (%)',
    'Drawdown (%)'
  ];
  lines.push(headers.map(h => escapeCsvField(h)).join(delimiter));
  
  // Data rows
  const initialValue = summary.equity_curve[0]?.equity || 100000;
  
  summary.equity_curve.forEach(point => {
    const cumulativeReturn = initialValue > 0 ? (point.equity - initialValue) / initialValue : 0;
    
    const row = [
      escapeCsvField(point.t),
      formatCurrency(point.equity, decimalPlaces),
      formatPercentage(cumulativeReturn, decimalPlaces),
      formatPercentage(Math.abs(point.drawdown), decimalPlaces)
    ];
    
    lines.push(row.join(delimiter));
  });
  
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
