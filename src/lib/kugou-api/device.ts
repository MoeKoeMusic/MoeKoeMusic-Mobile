import * as Device from 'expo-device';

import { calculateMid, generateWebGLHash, getGuid } from './runtime';
import { getSessionSnapshot, persistSession, setSessionValues } from './session';
import { readStoredGuid, writeStoredGuid } from './storage';

type DeviceSessionValues = {
  KUGOU_API_GUID: string;
  KUGOU_API_MID: string;
  KUGOU_API_WEBGL: string;
};

let cachedSessionValues: DeviceSessionValues | null = null;

function pickGuid(source: Record<string, string>, storedGuid: string | null): string {
  return source.KUGOU_API_GUID || storedGuid || getGuid();
}

function buildDeviceSessionValues(source: Record<string, string>, storedGuid: string | null): DeviceSessionValues {
  const guid = pickGuid(source, storedGuid);
  const mid = source.KUGOU_API_MID || calculateMid(guid);
  const webgl = source.KUGOU_API_WEBGL || generateWebGLHash();

  return {
    KUGOU_API_GUID: guid,
    KUGOU_API_MID: mid,
    KUGOU_API_WEBGL: webgl,
  };
}

export async function ensureDeviceSessionValues(): Promise<DeviceSessionValues> {
  if (cachedSessionValues) {
    return cachedSessionValues;
  }

  const session = getSessionSnapshot();
  const storedGuid = await readStoredGuid();
  const values = buildDeviceSessionValues(session, storedGuid);

  if (values.KUGOU_API_GUID !== storedGuid) {
    await writeStoredGuid(values.KUGOU_API_GUID);
  }

  if (setSessionValues(values)) {
    await persistSession();
  }

  cachedSessionValues = values;
  return values;
}

export async function getRegisterDeviceParams(): Promise<Record<string, string | number | boolean>> {
  const values = await ensureDeviceSessionValues();

  return {
    availableRamSize: Device.totalMemory ?? 4_983_533_568,
    availableRomSize: 48_114_719,
    availableSDSize: 48_114_717,
    basebandVer: '',
    batteryLevel: 100,
    batteryStatus: 3,
    brand: Device.brand ?? Device.manufacturer ?? 'unknown',
    buildSerial: Device.osBuildId ?? 'unknown',
    device: Device.designName ?? Device.modelId ?? Device.modelName ?? 'unknown',
    imei: values.KUGOU_API_GUID,
    imsi: '',
    manufacturer: Device.manufacturer ?? Device.brand ?? 'unknown',
    uuid: values.KUGOU_API_GUID,
    accelerometer: false,
    accelerometerValue: '',
    gravity: false,
    gravityValue: '',
    gyroscope: false,
    gyroscopeValue: '',
    light: false,
    lightValue: '',
    magnetic: false,
    magneticValue: '',
    orientation: false,
    orientationValue: '',
    pressure: false,
    pressureValue: '',
    step_counter: false,
    step_counterValue: '',
    temperature: false,
    temperatureValue: '',
  };
}

export function resetDeviceSessionValues(): void {
  cachedSessionValues = null;
}
