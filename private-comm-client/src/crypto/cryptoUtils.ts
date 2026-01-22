import { NativeModules, Platform } from 'react-native';

const { AesCrypto } = NativeModules;

interface AesCryptoModule {
  encrypt(data: string, key: string): Promise<string>;
  decrypt(data: string, key: string): Promise<string>;
  generateKey(): Promise<string>;
}

declare global {
  var AesCrypto: AesCryptoModule;
}

const SESSION_ENCRYPTION_KEY = 'privcomm_session_key_v1';

let encryptionKey: string | null = null;

async function getEncryptionKey(): Promise<string> {
  if (encryptionKey) {
    return encryptionKey;
  }

  if (!AesCrypto) {
    throw new Error('AesCrypto module not available');
  }

  if (!encryptionKey) {
    encryptionKey = await AesCrypto.generateKey();
  }

  return encryptionKey;
}

export async function encryptData(data: string): Promise<string> {
  const key = await getEncryptionKey();
  if (!AesCrypto) {
    throw new Error('AesCrypto module not available');
  }
  return AesCrypto.encrypt(data, key);
}

export async function decryptData(data: string): Promise<string> {
  const key = await getEncryptionKey();
  if (!AesCrypto) {
    throw new Error('AesCrypto module not available');
  }
  return AesCrypto.decrypt(data, key);
}
