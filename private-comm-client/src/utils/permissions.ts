import { PermissionsAndroid, Platform, Alert } from 'react-native';

type PermissionType = 'microphone' | 'contacts' | 'sms' | 'camera';

const PERMISSION_MAP: Record<PermissionType, string> = {
  microphone: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  contacts: PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
  sms: PermissionsAndroid.PERMISSIONS.READ_SMS,
  camera: PermissionsAndroid.PERMISSIONS.CAMERA,
};

const PERMISSION_RATIONALE: Record<PermissionType, { title: string; message: string }> = {
  microphone: {
    title: 'Microphone Access Required',
    message: 'Private Comm needs microphone access to make encrypted voice calls.',
  },
  contacts: {
    title: 'Contacts Access',
    message: 'Allow access to find friends who also use Private Comm. Contact data never leaves your device unencrypted.',
  },
  sms: {
    title: 'SMS Verification',
    message: 'Used only for automatic verification code detection.',
  },
  camera: {
    title: 'Camera Access',
    message: 'Required for future video calling feature.',
  },
};

export async function requestPermission(type: PermissionType): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const permission = PERMISSION_MAP[type];
  const rationale = PERMISSION_RATIONALE[type];

  try {
    const granted = await PermissionsAndroid.request(permission, rationale);

    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      return true;
    } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      Alert.alert(
        'Permission Required',
        `Please enable ${type} permission in Settings to use this feature.`,
        [{ text: 'OK' }]
      );
      return false;
    }

    return false;
  } catch (err) {
    console.error(`Permission request failed for ${type}:`, err);
    return false;
  }
}

export async function requestMultiplePermissions(types: PermissionType[]): Promise<Record<PermissionType, boolean>> {
  const results: Record<PermissionType, boolean> = {} as any;

  for (const type of types) {
    results[type] = await requestPermission(type);
  }

  return results;
}

export async function checkPermission(type: PermissionType): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const permission = PERMISSION_MAP[type];
  const result = await PermissionsAndroid.check(permission);
  return result;
}
