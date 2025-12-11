// LervIT final hardening: Resilient polling hook with exponential backoff
// Replaces simple refetchInterval with smarter retry logic

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

interface ResilientPollingConfig {
  /** Base polling interval in ms (default: 5000) */
  baseInterval: number;
  /** Max interval after backoff in ms (default: 30000) */
  maxInterval: number;
  /** Number of consecutive failures before backing off (default: 2) */
  failureThreshold: number;
  /** Whether polling is enabled (default: true) */
  enabled: boolean;
}

interface ResilientPollingState {
  /** Current polling interval */
  currentInterval: number;
  /** Number of consecutive failures */
  failureCount: number;
  /** Whether we're in degraded mode (backed off) */
  isDegraded: boolean;
  /** Last successful fetch timestamp */
  lastSuccess: Date | null;
  /** Connection status */
  status: 'connected' | 'degraded' | 'disconnected';
}

const DEFAULT_CONFIG: ResilientPollingConfig = {
  baseInterval: 5000,
  maxInterval: 30000,
  failureThreshold: 2,
  enabled: true,
};

/**
 * Hook for resilient polling with exponential backoff
 * 
 * Features:
 * - Automatic backoff on consecutive failures
 * - Recovery to normal interval on success
 * - Connection status tracking
 * - Graceful degradation instead of complete failure
 */
export function useResilientPolling<TData>(
  queryKey: unknown[],
  options?: Omit<UseQueryOptions<TData>, 'queryKey' | 'refetchInterval'>,
  config?: Partial<ResilientPollingConfig>
): UseQueryResult<TData> & { pollingState: ResilientPollingState } {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [pollingState, setPollingState] = useState<ResilientPollingState>({
    currentInterval: finalConfig.baseInterval,
    failureCount: 0,
    isDegraded: false,
    lastSuccess: null,
    status: 'connected',
  });

  const failureCountRef = useRef(0);
  const currentIntervalRef = useRef(finalConfig.baseInterval);

  // Calculate backoff interval
  const calculateBackoffInterval = useCallback((failures: number): number => {
    if (failures < finalConfig.failureThreshold) {
      return finalConfig.baseInterval;
    }
    
    // Exponential backoff: baseInterval * 2^(failures - threshold)
    const backoffMultiplier = Math.pow(2, failures - finalConfig.failureThreshold);
    const newInterval = finalConfig.baseInterval * backoffMultiplier;
    
    return Math.min(newInterval, finalConfig.maxInterval);
  }, [finalConfig.baseInterval, finalConfig.maxInterval, finalConfig.failureThreshold]);

  // Handle successful fetch
  const handleSuccess = useCallback(() => {
    failureCountRef.current = 0;
    currentIntervalRef.current = finalConfig.baseInterval;
    
    setPollingState(prev => ({
      ...prev,
      failureCount: 0,
      currentInterval: finalConfig.baseInterval,
      isDegraded: false,
      lastSuccess: new Date(),
      status: 'connected',
    }));
  }, [finalConfig.baseInterval]);

  // Handle failed fetch
  const handleError = useCallback(() => {
    failureCountRef.current += 1;
    const newInterval = calculateBackoffInterval(failureCountRef.current);
    currentIntervalRef.current = newInterval;
    
    const isDegraded = failureCountRef.current >= finalConfig.failureThreshold;
    const isDisconnected = failureCountRef.current >= finalConfig.failureThreshold * 2;
    
    setPollingState(prev => ({
      ...prev,
      failureCount: failureCountRef.current,
      currentInterval: newInterval,
      isDegraded,
      status: isDisconnected ? 'disconnected' : isDegraded ? 'degraded' : 'connected',
    }));
    
    if (isDegraded) {
      console.warn(`[ResilientPolling] Degraded mode: ${failureCountRef.current} consecutive failures, interval now ${newInterval}ms`);
    }
  }, [calculateBackoffInterval, finalConfig.failureThreshold]);

  // Use TanStack Query with dynamic refetch interval
  const query = useQuery<TData>({
    queryKey,
    ...options,
    refetchInterval: finalConfig.enabled ? currentIntervalRef.current : false,
  });

  // Track success/failure
  useEffect(() => {
    if (query.isSuccess) {
      handleSuccess();
    }
  }, [query.isSuccess, query.dataUpdatedAt, handleSuccess]);

  useEffect(() => {
    if (query.isError) {
      handleError();
    }
  }, [query.isError, query.errorUpdatedAt, handleError]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[ResilientPolling] Network online, resetting polling');
      failureCountRef.current = 0;
      currentIntervalRef.current = finalConfig.baseInterval;
      setPollingState(prev => ({
        ...prev,
        failureCount: 0,
        currentInterval: finalConfig.baseInterval,
        isDegraded: false,
        status: 'connected',
      }));
      query.refetch();
    };

    const handleOffline = () => {
      console.log('[ResilientPolling] Network offline');
      setPollingState(prev => ({
        ...prev,
        status: 'disconnected',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [finalConfig.baseInterval, query]);

  return {
    ...query,
    pollingState,
  };
}

/**
 * Connection status indicator component helper
 */
export function getConnectionStatusColor(status: ResilientPollingState['status']): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'disconnected':
      return 'bg-red-500';
  }
}

export function getConnectionStatusText(status: ResilientPollingState['status']): string {
  switch (status) {
    case 'connected':
      return 'Live';
    case 'degraded':
      return 'Slow connection';
    case 'disconnected':
      return 'Reconnecting...';
  }
}
