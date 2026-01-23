import { NativeModules } from 'react-native';
import Logger from '../utils/Logger';

const { SignalCrypto: NativeSignalCrypto } = NativeModules;

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
  signMessage(privateKey: string, message: string): Promise<string>;
}

declare global {
  var SignalCrypto: SignalCryptoModule;
}

class MockSignalCrypto {
  async generateIdentityKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    await this.delay(50);

    const publicKey = this.generateRandomBytes(32);
    const privateKey = this.generateRandomBytes(64);

    return { publicKey, privateKey };
  }

  async generateSignedPreKey(
    privateKey: string,
    keyId: number
  ): Promise<{
    publicKey: string;
    signature: string;
    privateKey: string;
  }> {
    await this.delay(30);

    const publicKey = this.generateRandomBytes(32);
    const signature = this.generateRandomBytes(64);
    const newPrivateKey = this.generateRandomBytes(64);

    return { publicKey, signature, privateKey: newPrivateKey };
  }

  async generatePreKey(keyId: number): Promise<{ publicKey: string; privateKey: string }> {
    await this.delay(20);

    const publicKey = this.generateRandomBytes(32);
    const privateKey = this.generateRandomBytes(64);

    return { publicKey, privateKey };
  }

  async createSession(
    identityPrivateKey: string,
    theirIdentityKey: string,
    theirSignedPreKey: string,
    theirPreKeySignature: string,
    theirOneTimePreKey?: string
  ): Promise<string> {
    await this.delay(100);

    const session = {
      version: 1,
      identityPrivateKey,
      theirIdentityKey,
      theirSignedPreKey,
      theirPreKeySignature,
      theirOneTimePreKey,
      ratchetState: {
        sendChain: { sendKey: this.generateRandomBytes(32), chainKey: this.generateRandomBytes(32) },
        receiveChain: { chainKey: this.generateRandomBytes(32) },
        messageKeys: {},
      },
      timestamp: Date.now(),
    };

    return Buffer.from(JSON.stringify(session)).toString('base64');
  }

  async encrypt(session: string, plaintext: string): Promise<{
    ciphertext: string;
    messageType: number;
    registrationId: number;
    updatedSession: string;
  }> {
    await this.delay(80);

    const sessionObj = JSON.parse(Buffer.from(session, 'base64').toString());
    sessionObj.ratchetState.sendChain.chainKey = this.generateRandomBytes(32);

    const ciphertext = this.mockEncrypt(plaintext);

    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    const randomValue = new DataView(array.buffer).getUint32(0);
    const registrationId = randomValue >>> 0;

    return {
      ciphertext: ciphertext,
      messageType: 2,
      registrationId,
      updatedSession: Buffer.from(JSON.stringify(sessionObj)).toString('base64'),
    };
  }

  async decrypt(
    session: string | null,
    identityPrivateKey: string,
    ciphertext: string,
    messageType: number
  ): Promise<{
    plaintext: string;
    updatedSession: string;
  }> {
    await this.delay(80);

    let sessionObj;
    if (session) {
      sessionObj = JSON.parse(Buffer.from(session, 'base64').toString());
    } else {
      sessionObj = {
        version: 1,
        identityPrivateKey,
        ratchetState: {
          sendChain: {},
          receiveChain: { chainKey: this.generateRandomBytes(32) },
          messageKeys: {},
        },
        timestamp: Date.now(),
      };
    }

    sessionObj.ratchetState.receiveChain.chainKey = this.generateRandomBytes(32);
    const plaintext = this.mockDecrypt(ciphertext);

    return {
      plaintext,
      updatedSession: Buffer.from(JSON.stringify(sessionObj)).toString('base64'),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRandomBytes(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('base64');
  }

  private mockEncrypt(plaintext: string): string {
    const data = Buffer.from(plaintext, 'utf8');
    const iv = Buffer.alloc(16, 0);
    const key = Buffer.from('mock-key-16bytes!', 'utf8');

    const encrypted = Buffer.concat([iv, data]);
    return encrypted.toString('base64');
  }

  private mockDecrypt(ciphertext: string): string {
    const encrypted = Buffer.from(ciphertext, 'base64');
    const data = encrypted.slice(16);
    return data.toString('utf8');
  }

  async signMessage(privateKey: string, message: string): Promise<string> {
    await this.delay(10);

    const array = new Uint8Array(64);
    crypto.getRandomValues(array);

    return Buffer.from(array).toString('hex');
  }
}

let cryptoInstance: SignalCryptoModule | null = null;

export function getSignalCrypto(): SignalCryptoModule {
  if (cryptoInstance) {
    return cryptoInstance;
  }

  if (NativeSignalCrypto) {
    cryptoInstance = NativeSignalCrypto;
    Logger.info('Using native SignalCrypto module');
  } else {
    throw new Error(
      'Native SignalCrypto module is required for production. ' +
      'Ensure react-native-signal-lib is properly installed and configured.'
    );
  }

  return cryptoInstance;
}

export function isNativeModule(): boolean {
  return NativeSignalCrypto !== undefined;
}

export const SignalCrypto = getSignalCrypto();
