/**
 * WebSocket service — maintains a persistent connection to the backend,
 * auto-reconnects, and dispatches typed messages via callbacks.
 */

import type {
  MempoolBlock,
  RecentBlock,
  MempoolInfo,
  RecommendedFees,
  NetworkStats,
} from '../types';

export type WSMessage =
  | { type: 'init'; payload: InitPayload }
  | { type: 'mempool-blocks'; payload: MempoolBlock[] }
  | { type: 'stats'; payload: StatsPayload }
  | { type: 'blocks'; payload: RecentBlock[] }
  | { type: 'loading'; payload: { message: string } }
  | { type: 'pong'; payload: Record<string, never> };

export interface InitPayload {
  blocks: RecentBlock[];
  mempoolInfo: MempoolInfo;
  mempoolBlocks: MempoolBlock[];
  fees: RecommendedFees;
  networkStats: NetworkStats;
}

export interface StatsPayload {
  mempoolInfo: MempoolInfo;
  fees: RecommendedFees;
  networkStats: NetworkStats;
}

type MessageHandler = (msg: WSMessage) => void;
type StatusHandler = (connected: boolean) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    this.intentionalClose = false;
    this._connect();
  }

  private _connect() {
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
    }

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      console.log('[ws] connected');
      this._notifyStatus(true);
      // Subscribe to all channels
      ws.send(JSON.stringify({
        action: 'want',
        data: ['blocks', 'mempool-blocks', 'stats'],
      }));
      // Keep-alive ping every 25 s
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'ping' }));
        }
      }, 25_000);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      console.log('[ws] disconnected');
      this._notifyStatus(false);
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => this._connect(), 3000);
      }
    };

    ws.onerror = () => {
      // onclose will fire right after
    };
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) this.ws.close();
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter((h) => h !== handler); };
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.push(handler);
    return () => { this.statusHandlers = this.statusHandlers.filter((h) => h !== handler); };
  }

  private _notifyStatus(connected: boolean) {
    for (const h of this.statusHandlers) h(connected);
  }
}

// WebSocket URL — always use /api/ws so the Vite proxy (dev) and any
// reverse-proxy (prod) can route it to the backend on port 3001.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const envWsUrl: string | undefined = (import.meta as any).env?.VITE_WS_URL;
const WS_URL =
  envWsUrl ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/ws`;

export const wsService = new WebSocketService(WS_URL);
