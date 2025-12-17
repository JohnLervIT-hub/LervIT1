import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

interface JobNotification {
  type: 'job_notification' | 'booking_update' | 'message' | 'ping' | 'connected';
  bookingId?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  price?: string;
  estimatedTime?: string;
  expiresAt?: string;
  timestamp?: string;
  data?: any;
}

interface UseMoverWebSocketOptions {
  onJobNotification?: (notification: JobNotification) => void;
  enabled?: boolean;
}

async function fetchWebSocketToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/movers/me/ws-token', {
      credentials: 'include',
    });
    if (!response.ok) {
      console.error('[WebSocket] Failed to get token:', response.status);
      return null;
    }
    const data = await response.json();
    return data.token;
  } catch (err) {
    console.error('[WebSocket] Token fetch error:', err);
    return null;
  }
}

export function useMoverWebSocket(options: UseMoverWebSocketOptions = {}) {
  const { user } = useAuth();
  const { onJobNotification, enabled = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<JobNotification | null>(null);

  // Fetch mover profile to get moverId
  const { data: moverProfile } = useQuery<{ id: string; userId: string }>({
    queryKey: ['/api/movers/me'],
    enabled: !!user && user.role === 'mover' && enabled,
  });

  const connect = useCallback(async () => {
    if (!user || user.role !== 'mover' || !moverProfile?.id) return;

    // Fetch authenticated WebSocket token from server
    const token = await fetchWebSocketToken();
    if (!token) {
      console.error('[WebSocket] Could not obtain authentication token');
      // Retry after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[WebSocket] Retrying token fetch...');
        connect();
      }, 10000);
      return;
    }

    // Determine WebSocket URL with authenticated token
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/mover-notifications?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected to mover notifications');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: JobNotification = JSON.parse(event.data);
          
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          if (data.type === 'connected') {
            console.log('[WebSocket] Connection acknowledged');
            return;
          }

          if (data.type === 'job_notification') {
            console.log('[WebSocket] New job notification:', data);
            setLastNotification(data);
            onJobNotification?.(data);
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after 5 seconds
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocket] Attempting to reconnect...');
            connect();
          }, 5000);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
    }
  }, [user, moverProfile, enabled, onJobNotification]);

  useEffect(() => {
    if (enabled && user?.role === 'mover' && moverProfile?.id) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, user?.role, moverProfile?.id, connect]);

  return {
    isConnected,
    lastNotification,
  };
}
