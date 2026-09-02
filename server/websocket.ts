import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { logger } from './logger';
import crypto from 'crypto';

/**
 * WebSocket Authentication System:
 * Uses short-lived tokens issued by authenticated REST endpoints.
 * Tokens are valid for 5 minutes and tied to specific user IDs.
 */

interface ConnectedClient {
  ws: WebSocket;
  moverId: string;
  userId: string;
  lastPing: number;
}

interface WebSocketToken {
  userId: string;
  moverId: string;
  channel?: 'admin-voice';
  createdAt: number;
  expiresAt: number;
  used?: boolean;
}

// In-memory token store (tokens expire after 5 minutes)
const tokenStore = new Map<string, WebSocketToken>();
const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Clean up expired tokens every minute
setInterval(() => {
  const now = Date.now();
  tokenStore.forEach((token, key) => {
    if (token.expiresAt < now) {
      tokenStore.delete(key);
    }
  });
}, 60000);

/**
 * Generate a short-lived token for WebSocket authentication.
 * Called by authenticated REST endpoint.
 */
export function generateWebSocketToken(userId: string, moverId: string): string {
  const tokenId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  tokenStore.set(tokenId, {
    userId,
    moverId,
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS,
  });

  logger.info({ userId, moverId }, 'WebSocket token generated');
  return tokenId;
}

/** Generate a short-lived token for customer WebSocket connections. */
export function generateCustomerWebSocketToken(userId: string): string {
  return generateWebSocketToken(userId, '');
}

/** One-time token exclusively for the operator voice event channel. */
export function generateAdminVoiceWebSocketToken(userId: string): string {
  const tokenId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  tokenStore.set(tokenId, { userId, moverId: '', channel: 'admin-voice', createdAt: now, expiresAt: now + TOKEN_EXPIRY_MS });
  return tokenId;
}

/**
 * Validate a WebSocket token and return the associated user info.
 * Reusable within the TTL window — a single token can back multiple
 * connection attempts (initial connect, reconnect after transient
 * drop, etc.) until it expires. Marked `used` for observability;
 * eviction is done by the periodic sweeper above.
 */
function validateToken(token: string): WebSocketToken | null {
  const tokenData = tokenStore.get(token);
  if (!tokenData) return null;
  if (tokenData.expiresAt < Date.now()) {
    tokenStore.delete(token);
    return null;
  }
  tokenData.used = true;
  return tokenData;
}

class MoverWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/mover-notifications',
      verifyClient: (info, callback) => {
        // Basic origin validation
        const origin = info.origin || info.req.headers.origin;
        const host = info.req.headers.host;
        
        // Allow connections from same origin or Replit domains
        const validOrigin = !origin || 
          origin.includes(host || '') || 
          origin.includes('.replit.') ||
          origin.includes('localhost');
        
        if (!validOrigin) {
          logger.warn({ origin, host }, 'WebSocket connection rejected: invalid origin');
          callback(false, 403, 'Forbidden');
          return;
        }
        
        callback(true);
      }
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Missing authentication token');
        return;
      }
      
      // Validate the token
      const tokenData = validateToken(token);
      if (!tokenData) {
        ws.close(4003, 'Invalid or expired token');
        return;
      }
      
      const { userId, moverId } = tokenData;

      const clientId = `${userId}-${Date.now()}`;
      
      this.clients.set(clientId, {
        ws,
        moverId,
        userId,
        lastPing: Date.now()
      });

      logger.info({ moverId, userId, clientId }, 'Mover WebSocket connected');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'pong') {
            const client = this.clients.get(clientId);
            if (client) {
              client.lastPing = Date.now();
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info({ moverId, userId, clientId }, 'Mover WebSocket disconnected');
      });

      ws.on('error', (error) => {
        logger.error({ moverId, userId, error: error.message }, 'WebSocket error');
        this.clients.delete(clientId);
      });

      // Send connection acknowledgment
      try {
        ws.send(JSON.stringify({ type: 'connected', moverId, userId }));
      } catch (e) {
        logger.warn({ userId, moverId }, 'Failed to send WS connection ack');
      }
    });

    // Start ping interval to keep connections alive
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, clientId) => {
        if (now - client.lastPing > 60000) {
          // No pong for 60 seconds, close connection
          try { client.ws.close(4002, 'Ping timeout'); } catch (_) {}
          this.clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {
            this.clients.delete(clientId);
          }
        }
      });
    }, 30000);

    logger.info('Mover WebSocket server initialized');
  }

  /**
   * Notify a mover by their userId (not mover profile id).
   * Job notifications in the database use userId as moverId.
   */
  notifyMover(userId: string, notification: {
    type: 'job_notification' | 'booking_update' | 'message';
    bookingId?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    price?: string;
    estimatedTime?: string;
    estimatedEarnings?: string;
    expiresAt?: Date;
    isPriority?: boolean;
    data?: any;
  }) {
    let sentCount = 0;
    
    // Match by userId since job notifications use userId as the moverId
    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify({
            ...notification,
            timestamp: new Date().toISOString()
          }));
          sentCount++;
        } catch (e) {
          logger.warn({ userId, type: notification.type }, 'Failed to send WS notification to mover');
        }
      }
    });

    if (sentCount > 0) {
      logger.info({ userId, type: notification.type, sentCount }, 'WebSocket notification sent to mover');
    }

    return sentCount;
  }

  broadcast(message: object) {
    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (e) {
          logger.warn('Failed to broadcast WS message to a client');
        }
      }
    });
    return sentCount;
  }

  getConnectedMoversCount(): number {
    const uniqueMovers = new Set<string>();
    this.clients.forEach((client) => {
      uniqueMovers.add(client.moverId);
    });
    return uniqueMovers.size;
  }

  shutdown() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
    this.clients.clear();
  }
}

export const moverWebSocket = new MoverWebSocketServer();

interface ConnectedCustomer {
  ws: WebSocket;
  userId: string;
  lastPing: number;
}

class CustomerWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedCustomer> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/customer-notifications',
      verifyClient: (info, callback) => {
        const origin = info.origin || info.req.headers.origin;
        const host = info.req.headers.host;
        const validOrigin = !origin ||
          origin.includes(host || '') ||
          origin.includes('.replit.') ||
          origin.includes('localhost');
        if (!validOrigin) {
          callback(false, 403, 'Forbidden');
          return;
        }
        callback(true);
      },
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) { ws.close(4001, 'Missing authentication token'); return; }
      const tokenData = validateToken(token);
      if (!tokenData) { ws.close(4003, 'Invalid or expired token'); return; }

      const { userId } = tokenData;
      const clientId = `${userId}-${Date.now()}`;
      this.clients.set(clientId, { ws, userId, lastPing: Date.now() });
      logger.info({ userId, clientId }, 'Customer WebSocket connected');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'pong') {
            const client = this.clients.get(clientId);
            if (client) client.lastPing = Date.now();
          }
        } catch (_) {}
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info({ userId, clientId }, 'Customer WebSocket disconnected');
      });

      ws.on('error', (error) => {
        logger.error({ userId, error: error.message }, 'Customer WebSocket error');
        this.clients.delete(clientId);
      });

      try { ws.send(JSON.stringify({ type: 'connected', userId })); } catch (_) {}
    });

    this.pingInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, clientId) => {
        if (now - client.lastPing > 60000) {
          try { client.ws.close(4002, 'Ping timeout'); } catch (_) {}
          this.clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          try { client.ws.send(JSON.stringify({ type: 'ping' })); } catch (_) { this.clients.delete(clientId); }
        }
      });
    }, 30000);

    logger.info('Customer WebSocket server initialized');
  }

  notifyCustomer(userId: string, notification: { type: string; bookingId: string; status: string; updatedAt: string }) {
    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify({ ...notification, timestamp: new Date().toISOString() }));
          sentCount++;
        } catch (_) {}
      }
    });
    return sentCount;
  }

  shutdown() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.wss) this.wss.close();
    this.clients.clear();
  }
}

export const customerWebSocket = new CustomerWebSocketServer();

class AdminVoiceWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedCustomer>();

  initialize(server: Server) {
    this.wss = new WebSocketServer({
      server, path: '/admin-voice-ws',
      verifyClient: (info, callback) => {
        const origin = info.origin || info.req.headers.origin;
        const host = info.req.headers.host || '';
        const valid = !origin || origin.includes(host) || origin.includes('.replit.') || origin.includes('localhost');
        console.log('[ws/admin-voice] upgrade attempt:', { origin, host, valid });
        callback(valid, valid ? undefined : 403, valid ? undefined : 'Forbidden');
      },
    });
    console.log('[ws] admin-voice WebSocket initialized on /admin-voice-ws');
    this.wss.on('connection', (ws, req) => {
      console.log('[ws/admin-voice] connection opened');
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const data = token ? validateToken(token) : null;
      console.log('[ws/admin-voice] token validation:', {
        token: token?.substring(0, 8),
        valid: !!data,
        channel: data?.channel,
      });
      if (!data || data.channel !== 'admin-voice') return ws.close(4003, 'Invalid or expired token');
      const id = `${data.userId}-${Date.now()}`;
      this.clients.set(id, { ws, userId: data.userId, lastPing: Date.now() });
      // Protocol-level pings every 20s keep Railway's proxy from
      // reaping the socket after ~60s of app-layer silence.
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.ping(); } catch (_) { /* socket dying — close handler will clean up */ }
        }
      }, 20000);
      ws.on('close', (code, reason) => {
        console.log('[ws/admin-voice] closed:', { code, reason: reason.toString() });
        clearInterval(pingInterval);
        this.clients.delete(id);
      });
      ws.on('error', () => { clearInterval(pingInterval); this.clients.delete(id); });
      ws.on('pong', () => { const c = this.clients.get(id); if (c) c.lastPing = Date.now(); });
      ws.on('message', (raw) => {
        try { if (JSON.parse(raw.toString()).type === 'pong') this.clients.get(id)!.lastPing = Date.now(); } catch (_) {}
      });
      ws.send(JSON.stringify({ type: 'connected', channel: 'admin-voice' }));
    });
    logger.info('Admin voice WebSocket server initialized');
  }

  notify(notification: object) {
    this.clients.forEach((client, id) => {
      if (client.ws.readyState !== WebSocket.OPEN) { this.clients.delete(id); return; }
      try { client.ws.send(JSON.stringify({ ...notification, timestamp: new Date().toISOString() })); } catch (_) { this.clients.delete(id); }
    });
  }
}

export const adminVoiceWebSocket = new AdminVoiceWebSocketServer();
