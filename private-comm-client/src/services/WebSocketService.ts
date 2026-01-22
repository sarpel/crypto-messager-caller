import { Platform } from 'react-native';
import { EventEmitter } from 'events';
import { apiService } from './ApiService';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

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
    this.url = Platform.select({
      ios: 'ws://localhost:8000/ws',
      android: 'ws://10.0.2.2:8000/ws',
      default: 'ws://localhost:8000/ws',
    });
  }

  async connect(token: string): Promise<void> {
    if (this.state === 'connected') {
      console.warn('WebSocket already connected');
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
        console.log('WebSocket connected');
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.emit('connected');
        this.emit('stateChange', this.state);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.state = 'disconnected';
        this.emit('disconnected', { code: event.code, reason: event.reason });
        this.emit('stateChange', this.state);

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          this.state = 'error';
          this.emit('permanentFailure');
          this.emit('stateChange', this.state);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.state = 'error';
        this.emit('error', error);
        this.emit('stateChange', this.state);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          this.emit('message', message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
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

    console.log(
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
      console.warn('Cannot send message - WebSocket not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
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
