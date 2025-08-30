/**
 * Backend Health Monitoring Hook
 * 
 * Monitors backend health by pinging every 10 seconds with a 2-second timeout.
 * Provides real-time status updates for UI indicators.
 * 
 * Features:
 * - Automatic ping every 10 seconds
 * - 2-second timeout for each ping
 * - Response time tracking
 * - Status classification (healthy, slow, error)
 * - Automatic retry on failures
 * - Cleanup on unmount
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TauriAPI } from '../lib/tauri';

export type HealthStatus = 'healthy' | 'slow' | 'error' | 'unknown';

export interface HealthState {
  status: HealthStatus;
  responseTime: number | null;
  lastPing: Date | null;
  error: string | null;
  isOnline: boolean;
}

export interface PingResponse {
  ok: boolean;
  ts: number;
}

const PING_INTERVAL = 10000; // 10 seconds
const PING_TIMEOUT = 2000;   // 2 seconds
const SLOW_THRESHOLD = 500;  // 500ms threshold for "slow" status

export function useBackendHealth() {
  const [healthState, setHealthState] = useState<HealthState>({
    status: 'unknown',
    responseTime: null,
    lastPing: null,
    error: null,
    isOnline: false
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const ping = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Ping timeout'));
        }, PING_TIMEOUT);
      });

      // Race between ping and timeout
      const pingPromise = TauriAPI.ping();
      await Promise.race([pingPromise, timeoutPromise]);

      // Clear timeout if ping succeeded
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const responseTime = Date.now() - startTime;
      const now = new Date();

      if (!mountedRef.current) return;

      // Determine status based on response time
      let status: HealthStatus = 'healthy';
      if (responseTime > SLOW_THRESHOLD) {
        status = 'slow';
      }

      setHealthState({
        status,
        responseTime,
        lastPing: now,
        error: null,
        isOnline: true
      });

    } catch (error) {
      // Clear timeout if it exists
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!mountedRef.current) return;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const responseTime = Date.now() - startTime;

      setHealthState({
        status: 'error',
        responseTime: responseTime < PING_TIMEOUT ? responseTime : null,
        lastPing: new Date(),
        error: errorMessage,
        isOnline: false
      });
    }
  }, []);

  // Start health monitoring
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Ping immediately
    ping();

    // Set up interval for regular pings
    intervalRef.current = setInterval(ping, PING_INTERVAL);
  }, [ping]);

  // Stop health monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Manual ping for testing
  const manualPing = useCallback(async () => {
    await ping();
  }, [ping]);

  // Initialize monitoring on mount
  useEffect(() => {
    mountedRef.current = true;
    startMonitoring();

    return () => {
      mountedRef.current = false;
      stopMonitoring();
    };
  }, [startMonitoring, stopMonitoring]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    ...healthState,
    startMonitoring,
    stopMonitoring,
    manualPing,
    // Computed properties for convenience
    isHealthy: healthState.status === 'healthy',
    isSlow: healthState.status === 'slow',
    isError: healthState.status === 'error',
    isUnknown: healthState.status === 'unknown',
    // Status colors for UI
    statusColor: {
      healthy: 'green',
      slow: 'yellow', 
      error: 'red',
      unknown: 'gray'
    }[healthState.status],
    // Status text for display
    statusText: {
      healthy: 'Online',
      slow: 'Slow',
      error: 'Offline',
      unknown: 'Checking...'
    }[healthState.status]
  };
}

// Types are already exported above
