import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import SQLite from 'react-native-sqlite-storage';
import { encryptData, decryptData } from './cryptoUtils';
import { SignalCrypto, isNativeModule } from './SignalCryptoBridge';
import Logger from '../utils/Logger';

const DB_NAME = 'privcomm_sessions.db';

interface SignalCryptoModule {
  generateIdentityKeyPair(): Promise<{ publicKey: string; privateKey: string }>;
  generateSignedPreKey(privateKey: string, keyId: number): Promise<{
    publicKey: string;
    signature: string;
    privateKey: string;
  }>;
  generatePreKey(keyId: number): Promise<{ publicKey: string; privateKey: string }>;
  createSession(
    identityPrivateKey: string,
    theirIdentityKey: string,
    theirSignedPreKey: string,
    theirPreKeySignature: string,
    theirOneTimePreKey?: string
  ): Promise<string>;
  encrypt(session: string, plaintext: string): Promise<{
    ciphertext: string;
    messageType: number;
    registrationId: number;
    updatedSession: string;
  }>;
  decrypt(
    session: string | null,
    identityPrivateKey: string,
    ciphertext: string,
    messageType: number
  ): Promise<{
    plaintext: string;
    updatedSession: string;
  }>;
}

declare global {
  var SignalCrypto: SignalCryptoModule;
}

export interface KeyBundle {
  identityKey: string;
  signedPreKey: string;
  preKeySignature: string;
  oneTimePreKey?: {
    keyId: number;
    publicKey: string;
  };
}

export interface EncryptedMessage {
  type: number;
  registrationId: number;
  deviceId: number;
  body: string;
}

interface DecryptionError extends Error {
  name: string;
}

class DecryptionError extends Error {
  name = 'DecryptionError';
}

class SignalProtocolManager {
  private sessionStore: Map<string, string> = new Map();
  private dbInitialized = false;
  private maintenanceInterval: NodeJS.Timeout | null = null;

  private async initDB(): Promise<void> {
    if (this.dbInitialized) {
      return;
    }

    try {
      await SQLite.openDatabase({ name: DB_NAME, location: 'default' });

      await SQLite.executeSql(`
        CREATE TABLE IF NOT EXISTS sessions (
          recipient_id TEXT PRIMARY KEY,
          session_data TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      await SQLite.executeSql(`
        CREATE INDEX IF NOT EXISTS idx_sessions_updated
        ON sessions(updated_at DESC)
      `);

      await this.loadSessions();
      this.dbInitialized = true;
      Logger.info('Signal protocol sessions database initialized');
    } catch (error) {
      Logger.error('Failed to initialize sessions database:', error);
      throw error;
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      const [results] = await SQLite.executeSql('SELECT * FROM sessions');

      for (const row of results.rows.raw()) {
        try {
          const decrypted = await decryptData(row.session_data);
          this.sessionStore.set(row.recipient_id, decrypted);
        } catch (error) {
          Logger.error(`Failed to decrypt session for ${row.recipient_id}:`, error);
        }
      }

      Logger.info(`Loaded ${results.rows.length} sessions from database`);
    } catch (error) {
      Logger.error('Failed to load sessions:', error);
    }
  }

  private async saveSession(recipientId: string, session: string): Promise<void> {
    if (!this.dbInitialized) {
      await this.initDB();
    }

    try {
      const encrypted = await encryptData(session);

      await SQLite.executeSql(
        'INSERT OR REPLACE INTO sessions (recipient_id, session_data, updated_at) VALUES (?, ?, strftime(\'%s\', \'now\'))',
        [recipientId, encrypted]
      );
    } catch (error) {
      Logger.error(`Failed to save session for ${recipientId}:`, error);
    }
  }

  async generateIdentity(): Promise<{ publicKey: string; privateKey: string }> {
    if (!SignalCrypto) {
      throw new Error('SignalCrypto module not available');
    }

    if (!isNativeModule()) {
      console.warn('WARNING: Using MOCK SignalCrypto - NOT SECURE FOR PRODUCTION');
    }

    const keyPair = await SignalCrypto.generateIdentityKeyPair();

    await Keychain.setGenericPassword(
      'identity_private_key',
      keyPair.privateKey,
      {
        service: 'privcomm_identity',
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }
    );

    return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  }

  async generateSignedPreKey(identityPrivateKey: string): Promise<{
    publicKey: string;
    signature: string;
    keyId: number;
  }> {
    if (!SignalCrypto) {
      throw new Error('SignalCrypto module not available');
    }

    const keyId = Math.floor(Math.random() * 0xFFFFFF);
    const result = await SignalCrypto.generateSignedPreKey(identityPrivateKey, keyId);

    await Keychain.setGenericPassword(
      `signed_prekey_${keyId}`,
      result.privateKey,
      { service: 'privcomm_prekeys' }
    );

    return {
      publicKey: result.publicKey,
      signature: result.signature,
      keyId,
    };
  }

  async generateOneTimePreKeys(count: number = 100): Promise<Array<{
    keyId: number;
    publicKey: string;
  }>> {
    if (!SignalCrypto) {
      throw new Error('SignalCrypto module not available');
    }

    const preKeys: Array<{ keyId: number; publicKey: string }> = [];
    const BATCH_SIZE = 10; // Process in batches to prevent UI blocking

    for (let i = 0; i < count; i += BATCH_SIZE) {
      const batch = [];
      for (let j = 0; j < BATCH_SIZE && i + j < count; j++) {
        const keyId = Date.now() + (i + j);
        batch.push({ keyId });
      }

      // Generate keys in parallel within batch
      const batchResults = await Promise.all(
        batch.map(async ({ keyId }) => {
          const keyPair = await SignalCrypto.generatePreKey(keyId);
          await Keychain.setGenericPassword(
            `onetime_prekey_${keyId}`,
            keyPair.privateKey,
            { service: 'privcomm_otpk' }
          );
          return { keyId, publicKey: keyPair.publicKey };
        })
      );

      preKeys.push(...batchResults);
    }

    return preKeys;
  }

  async initSession(recipientId: string, theirBundle: KeyBundle): Promise<void> {
    const credentials = await Keychain.getGenericPassword({ service: 'privcomm_identity' });
    if (!credentials) {
      throw new Error('Identity key not found');
    }

    if (!SignalCrypto) {
      throw new Error('SignalCrypto module not available');
    }

    const session = await SignalCrypto.createSession(
      credentials.password,
      theirBundle.identityKey,
      theirBundle.signedPreKey,
      theirBundle.preKeySignature,
      theirBundle.oneTimePreKey?.publicKey
    );

    this.sessionStore.set(recipientId, session);
    await this.saveSession(recipientId, session);
  }

  async encrypt(recipientId: string, plaintext: string): Promise<EncryptedMessage> {
    let session = this.sessionStore.get(recipientId);

    if (!session) {
      throw new Error('No session established. Call initSession first.');
    }

    if (!SignalCrypto) {
      throw new Error('SignalCrypto module not available');
    }

    const result = await SignalCrypto.encrypt(session, plaintext);

    this.sessionStore.set(recipientId, result.updatedSession);
    await this.saveSession(recipientId, result.updatedSession);

    return {
      type: result.messageType,
      registrationId: result.registrationId,
      deviceId: 1,
      body: result.ciphertext,
    };
  }

  async decrypt(senderId: string, message: EncryptedMessage): Promise<string> {
    let session = this.sessionStore.get(senderId);

    const credentials = await Keychain.getGenericPassword({ service: 'privcomm_identity' });
    if (!credentials) {
      throw new Error('Identity key not found');
    }

    if (!SignalCrypto) {
      throw new Error('SignalCrypto module not available');
    }

    const result = await SignalCrypto.decrypt(
      session,
      credentials.password,
      message.body,
      message.type
    );

    this.sessionStore.set(senderId, result.updatedSession);
    await this.saveSession(senderId, result.updatedSession);

    return result.plaintext;
  }

  private async getAvailablePrekeyCount(): Promise<number> {
    const credentials = await Keychain.getGenericPassword({
      service: 'privcomm_otpk',
    });

    if (!credentials) {
      return 0;
    }

    const allKeys = await Keychain.getAllGenericPasswordServices();
    const otpkServices = allKeys.filter((service) =>
      service.startsWith('onetime_prekey_')
    );

    return otpkServices.length;
  }

  async uploadPrekeysToServer(preKeys: Array<{ keyId: number; publicKey: string }>): Promise<void> {
    const { apiService } = await import('../services/ApiService');
    const userId = await Keychain.getGenericPassword({ service: 'privcomm_identity' });

    if (!userId) {
      throw new Error('User not registered');
    }

    await apiService.register(
      '',
      '',
      '',
      '',
      preKeys
    );
  }

  async checkAndRefillPrekeys(): Promise<void> {
    const currentCount = await this.getAvailablePrekeyCount();

    if (currentCount < 20) {
      Logger.info(`Prekey count low (${currentCount}), generating 100 more...`);
      const newPreKeys = await this.generateOneTimePreKeys(100);

      try {
        await this.uploadPrekeysToServer(newPreKeys);
        Logger.info(`Uploaded ${newPreKeys.length} new prekeys to server`);
      } catch (error) {
        Logger.error('Failed to upload prekeys:', error);
        throw error;
      }
    } else {
      Logger.info(`Prekey count OK: ${currentCount}`);
    }
  }

  async startPrekeyMaintenance(): Promise<void> {
    const REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

    // Clear any existing interval
    this.stopPrekeyMaintenance();

    this.maintenanceInterval = setInterval(() => {
      this.checkAndRefillPrekeys();
    }, REFRESH_INTERVAL);

    await this.checkAndRefillPrekeys();
  }

  stopPrekeyMaintenance(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
  }
}

export const signalProtocol = new SignalProtocolManager();
