import * as Keychain from 'react-native-keychain';
import { createHash } from 'crypto';

export class KeyManager {
  private static IDENTITY_SERVICE = 'privcomm_identity';
  private static PREKEY_SERVICE = 'privcomm_prekeys';
  private static OTPK_SERVICE = 'privcomm_otpk';

  static async storeIdentityKey(privateKey: string): Promise<boolean> {
    return await Keychain.setGenericPassword(
      'identity_private_key',
      privateKey,
      {
        service: this.IDENTITY_SERVICE,
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }
    );
  }

  static async getIdentityKey(): Promise<string | null> {
    const credentials = await Keychain.getGenericPassword({
      service: this.IDENTITY_SERVICE,
    });
    return credentials ? credentials.password : null;
  }

  static async storeSignedPreKey(
    keyId: number,
    privateKey: string
  ): Promise<boolean> {
    return await Keychain.setGenericPassword(
      `signed_prekey_${keyId}`,
      privateKey,
      { service: this.PREKEY_SERVICE }
    );
  }

  static async getSignedPreKey(keyId: number): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: this.PREKEY_SERVICE,
      });
      if (!credentials) {
        console.warn(`Signed prekey ${keyId} not found in keychain`);
        return null;
      }
      return credentials.password;
    } catch (error) {
      console.error(`Failed to retrieve signed prekey ${keyId}:`, error);
      return null;
    }
  }

  static async storeOneTimePreKey(
    keyId: number,
    privateKey: string
  ): Promise<boolean> {
    return await Keychain.setGenericPassword(
      `onetime_prekey_${keyId}`,
      privateKey,
      { service: this.OTPK_SERVICE }
    );
  }

  static async getOneTimePreKey(keyId: number): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: this.OTPK_SERVICE,
      });
      if (!credentials) {
        console.warn(`One-time prekey ${keyId} not found in keychain`);
        return null;
      }
      return credentials.password;
    } catch (error) {
      console.error(`Failed to retrieve one-time prekey ${keyId}:`, error);
      return null;
    }
  }

  static async deleteOneTimePreKey(keyId: number): Promise<boolean> {
    return await Keychain.resetGenericPassword({
      service: this.OTPK_SERVICE,
    });
  }

  static async deleteAllKeys(): Promise<boolean> {
    const services = [
      this.IDENTITY_SERVICE,
      this.PREKEY_SERVICE,
      this.OTPK_SERVICE,
    ];

    for (const service of services) {
      try {
        await Keychain.resetGenericPassword({ service });
      } catch {
        // Ignore errors when deleting keys
      }
    }

    return true;
  }

  static hashPhoneNumber(phoneNumber: string, salt: string = 'privcomm-salt'): string {
    const hash = createHash('sha256');
    hash.update(phoneNumber + salt);
    return hash.digest('hex');
  }

  static async hasKeys(): Promise<boolean> {
    const identityKey = await this.getIdentityKey();
    return identityKey !== null;
  }
}
