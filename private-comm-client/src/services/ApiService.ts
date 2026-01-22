import { Platform } from 'react-native';

export interface RegisterResponse {
  status: string;
  user_id: string;
}

export interface KeyBundle {
  identity_key: string;
  signed_prekey: string;
  prekey_signature: string;
  one_time_prekey?: {
    key_id: number;
    public_key: string;
  };
}

export interface AuthTokenResponse {
  token: string;
  expires_in: number;
}

export interface TurnCredentialsResponse {
  urls: string[];
  username: string;
  credential: string;
  ttl?: number;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = Platform.select({
      ios: 'http://localhost:8000',
      android: 'http://10.0.2.2:8000',
      default: 'http://localhost:8000',
    });
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} ${error}`);
    }

    return response.json();
  }

  async register(
    phoneHash: string,
    identityKey: string,
    signedPreKey: string,
    preKeySignature: string,
    oneTimePreKeys: Array<{ key_id: number; public_key: string }>
  ): Promise<RegisterResponse> {
    return this.request<RegisterResponse>('/api/v1/register', {
      method: 'POST',
      body: JSON.stringify({
        phone_hash: phoneHash,
        identity_key: identityKey,
        signed_prekey: signedPreKey,
        prekey_signature: preKeySignature,
        one_time_prekeys: oneTimePreKeys,
      }),
    });
  }

  async getKeyBundle(phoneHash: string): Promise<KeyBundle> {
    return this.request<KeyBundle>(`/api/v1/keys/${phoneHash}`, {
      method: 'GET',
    });
  }

  async getWebSocketToken(userId: string): Promise<AuthTokenResponse> {
    return this.request<AuthTokenResponse>(`/api/v1/auth/token?user_id=${userId}`, {
      method: 'POST',
    });
  }

  async getTurnCredentials(): Promise<TurnCredentialsResponse> {
    try {
      return await this.request<TurnCredentialsResponse>('/api/v1/turn-credentials', {
        method: 'GET',
      });
    } catch (error) {
      throw new Error(`Failed to fetch TURN credentials from server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }
}

export const apiService = new ApiService();
