/**
 * Health Status Badge Component
 * 
 * Displays backend health status in the navbar with color-coded indicators.
 * Shows detailed information on hover and provides manual ping functionality.
 * 
 * Features:
 * - Color-coded status indicators (green/yellow/red)
 * - Hover tooltip with detailed information
 * - Response time display
 * - Last ping timestamp
 * - Manual ping button
 * - Smooth animations and transitions
 * - Accessible with proper ARIA attributes
 */

import React from 'react';
import { Wifi, WifiOff, Clock, RefreshCw } from 'lucide-react';
import { useBackendHealth } from '../hooks/useBackendHealth';

interface HealthStatusBadgeProps {
  className?: string;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const HealthStatusBadge: React.FC<HealthStatusBadgeProps> = ({
  className = '',
  showDetails = false,
  size = 'md'
}) => {
  const health = useBackendHealth();

  // Size classes
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  // Status colors
  const statusColors = {
    healthy: 'bg-green-500',
    slow: 'bg-yellow-500',
    error: 'bg-red-500',
    unknown: 'bg-gray-400'
  };

  // Status icons
  const StatusIcon = health.isOnline ? Wifi : WifiOff;

  // Format response time
  const formatResponseTime = (time: number | null): string => {
    if (time === null) return 'N/A';
    return `${time}ms`;
  };

  // Format last ping time
  const formatLastPing = (date: Date | null): string => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) { // Less than 1 minute
      return `${Math.floor(diff / 1000)}s ago`;
    } else if (diff < 3600000) { // Less than 1 hour
      return `${Math.floor(diff / 60000)}m ago`;
    } else {
      return date.toLocaleTimeString();
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {/* Status Badge */}
      <div className="relative group">
        {/* Status Indicator */}
        <div
          className={`
            ${sizeClasses[size]} 
            ${statusColors[health.status]}
            rounded-full 
            transition-all 
            duration-300 
            shadow-sm
            ${health.status === 'healthy' ? 'animate-pulse' : ''}
          `}
          role="status"
          aria-label={`Backend status: ${health.statusText}`}
        />

        {/* Hover Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <StatusIcon className="w-3 h-3" />
              <span className="font-medium">{health.statusText}</span>
            </div>
            
            {health.responseTime !== null && (
              <div className="flex items-center space-x-2 text-gray-300">
                <Clock className="w-3 h-3" />
                <span>{formatResponseTime(health.responseTime)}</span>
              </div>
            )}
            
            <div className="text-gray-400 text-xs">
              Last ping: {formatLastPing(health.lastPing)}
            </div>
            
            {health.error && (
              <div className="text-red-300 text-xs">
                Error: {health.error}
              </div>
            )}
          </div>
          
          {/* Tooltip Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
        </div>
      </div>

      {/* Detailed Status (Optional) */}
      {showDetails && (
        <div className="ml-2 flex items-center space-x-2 text-sm">
          <StatusIcon className="w-4 h-4 text-gray-600" />
          <span className="text-gray-700">{health.statusText}</span>
          
          {health.responseTime !== null && (
            <span className="text-gray-500">
              ({formatResponseTime(health.responseTime)})
            </span>
          )}
          
          {/* Manual Ping Button */}
          <button
            onClick={health.manualPing}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            title="Manual ping"
            aria-label="Ping backend manually"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default HealthStatusBadge;
