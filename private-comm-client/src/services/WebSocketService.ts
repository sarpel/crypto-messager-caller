import { Platform } from 'react-native';
import { EventEmitter } from 'events';
import { apiService } from './ApiService';
import Logger from '../utils/Logger';
import type { WebSocketMessage } from '../types/WebSocketMessage';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private state: ConnectionState = 'disconnected';

  constructor() {
    super();
    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = isProduction ? 'wss' : 'ws';
    const apiHost = isProduction
      ? 'your-domain.com'
      : Platform.select({
          ios: 'localhost:8000',
          android: '10.0.2.2:8000',
          default: 'localhost:8000/ws',
        });
    this.url = Platform.select({
      ios: `${protocol}://localhost:8000/ws`,
      android: `${protocol}://10.0.2.2:8000/ws`,
      default: `${protocol}://localhost:8000/ws`,
    });
  }

  async connect(token: string): Promise<void> {
    if (this.state === 'connected') {
      Logger.warn('WebSocket already connected');
      return;
    }

    this.token = token;
    this.shouldReconnect = true;
    this.state = 'connecting';
    this.emit('stateChange', this.state);

    try {
      const wsUrl = `${this.url}?token=${token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        Logger.info('WebSocket connected');
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.emit('connected');
        this.emit('stateChange', this.state);
      };

      this.ws.onclose = (event) => {
        Logger.info('WebSocket closed:', event.code, event.reason);
        this.state = 'disconnected';
        this.emit('disconnected', { code: event.code, reason: event.reason });
        this.emit('stateChange', this.state);

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          Logger.error('Max reconnection attempts reached');
          this.state = 'error';
          this.emit('permanentFailure');
          this.emit('stateChange', this.state);
        }
      };

      this.ws.onerror = (error) => {
        Logger.error('WebSocket error:', error);
        this.state = 'error';
        this.emit('error', error);
        this.emit('stateChange', this.state);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          this.emit('message', message);
        } catch (error) {
          Logger.error('Failed to parse WebSocket message:', error);
        }
      };

    } catch (error) {
      Logger.error('Failed to connect WebSocket:', error);
      this.state = 'error';
      this.emit('error', error);
      this.emit('stateChange', this.state);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    this.state = 'connecting';
    this.emit('reconnecting', { attempt: this.reconnectAttempts });
    this.emit('stateChange', this.state);

    Logger.info(
      `Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.token) {
        this.connect(this.token);
      }
    }, this.reconnectDelay);

    this.reconnectDelay *= 2;
    if (this.reconnectDelay > 30000) {
      this.reconnectDelay = 30000;
    }
  }

  send(message: WebSocketMessage): void {
    if (this.state !== 'connected' || !this.ws) {
      Logger.warn('Cannot send message - WebSocket not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      Logger.error('Failed to send WebSocket message:', error);
      this.emit('error', error);
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = 'disconnected';
    this.emit('disconnected', { code: 0, reason: 'User disconnected' });
    this.emit('stateChange', this.state);
  }

  getState(): ConnectionState {
    return this.state;
  }

  setUrl(url: string): void {
    this.url = url;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }
}

export const webSocketService = new WebSocketService();
