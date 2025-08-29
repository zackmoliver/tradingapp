/**
 * Utility functions for formatting numbers, currencies, percentages, and dates
 * Used throughout the application for consistent data presentation
 */

import { format, parseISO } from 'date-fns';

/**
 * Format a number as currency
 */
export const formatCurrency = (
  value: number, 
  style: 'full' | 'compact' = 'full',
  currency: string = 'USD'
): string => {
  if (style === 'compact') {
    if (Math.abs(value) >= 1e9) {
      return `$${(value / 1e9).toFixed(1)}B`;
    } else if (Math.abs(value) >= 1e6) {
      return `$${(value / 1e6).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1e3) {
      return `$${(value / 1e3).toFixed(1)}K`;
    }
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Format a number as percentage
 */
export const formatPercentage = (
  value: number, 
  decimals: number = 2,
  showSign: boolean = false
): string => {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  if (showSign && value > 0) {
    return `+${formatted}`;
  }

  return formatted;
};

/**
 * Format a regular number
 */
export const formatNumber = (
  value: number, 
  decimals: number = 0,
  style: 'full' | 'compact' = 'full'
): string => {
  if (style === 'compact') {
    if (Math.abs(value) >= 1e9) {
      return `${(value / 1e9).toFixed(1)}B`;
    } else if (Math.abs(value) >= 1e6) {
      return `${(value / 1e6).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1e3) {
      return `${(value / 1e3).toFixed(1)}K`;
    }
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Format a date string
 */
export const formatDate = (
  dateString: string, 
  style: 'full' | 'short' | 'medium' = 'medium'
): string => {
  try {
    const date = parseISO(dateString);
    
    switch (style) {
      case 'full':
        return format(date, 'MMMM dd, yyyy');
      case 'short':
        return format(date, 'MM/dd');
      case 'medium':
      default:
        return format(date, 'MMM dd, yyyy');
    }
  } catch (error) {
    return dateString; // Return original string if parsing fails
  }
};

/**
 * Format a ratio with appropriate precision
 */
export const formatRatio = (value: number, decimals: number = 2): string => {
  return formatNumber(value, decimals);
};

/**
 * Format duration in days to human readable format
 */
export const formatDuration = (days: number): string => {
  if (days < 7) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    if (remainingDays === 0) {
      return `${weeks} week${weeks !== 1 ? 's' : ''}`;
    } else {
      return `${weeks}w ${remainingDays}d`;
    }
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    if (remainingDays === 0) {
      return `${months} month${months !== 1 ? 's' : ''}`;
    } else {
      return `${months}m ${remainingDays}d`;
    }
  } else {
    const years = Math.floor(days / 365);
    const remainingDays = days % 365;
    if (remainingDays === 0) {
      return `${years} year${years !== 1 ? 's' : ''}`;
    } else {
      return `${years}y ${remainingDays}d`;
    }
  }
};

/**
 * Format execution time in seconds to human readable format
 */
export const formatExecutionTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${remainingMinutes}m`;
  }
};

/**
 * Get color class based on value and thresholds
 */
export const getPerformanceColor = (
  value: number,
  type: 'return' | 'ratio' | 'drawdown' = 'return'
): 'success' | 'danger' | 'warning' | 'neutral' => {
  switch (type) {
    case 'return':
      if (value > 0.1) return 'success';
      if (value > 0) return 'success';
      if (value > -0.05) return 'warning';
      return 'danger';
    
    case 'ratio':
      if (value > 2) return 'success';
      if (value > 1) return 'success';
      if (value > 0.5) return 'warning';
      return 'danger';
    
    case 'drawdown':
      const absValue = Math.abs(value);
      if (absValue < 0.05) return 'success';
      if (absValue < 0.1) return 'warning';
      return 'danger';
    
    default:
      return 'neutral';
  }
};

/**
 * Format large numbers with appropriate suffixes
 */
export const formatLargeNumber = (value: number): string => {
  const absValue = Math.abs(value);
  
  if (absValue >= 1e12) {
    return `${(value / 1e12).toFixed(1)}T`;
  } else if (absValue >= 1e9) {
    return `${(value / 1e9).toFixed(1)}B`;
  } else if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`;
  } else {
    return formatNumber(value, 0);
  }
};

/**
 * Format a value based on its type with automatic detection
 */
export const formatValue = (
  value: number,
  type?: 'currency' | 'percentage' | 'number' | 'ratio'
): string => {
  if (type) {
    switch (type) {
      case 'currency':
        return formatCurrency(value);
      case 'percentage':
        return formatPercentage(value);
      case 'ratio':
        return formatRatio(value);
      case 'number':
      default:
        return formatNumber(value);
    }
  }

  // Auto-detect format based on value range
  if (value >= 1000 || value <= -1000) {
    return formatCurrency(value);
  } else if (value >= -1 && value <= 1 && value !== 0) {
    return formatPercentage(value);
  } else {
    return formatNumber(value, 2);
  }
};
