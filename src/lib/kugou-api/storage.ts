import * as SecureStore from 'expo-secure-store';

const STORAGE_KEYS = {
  guid: 'moekoe.kugou.guid',
  dfid: 'moekoe.kugou.dfid',
  session: 'moekoe.kugou.session',
} as const;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures and keep runtime state usable.
  }
}

export async function readStoredGuid(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEYS.guid);
  } catch {
    return null;
  }
}

export async function writeStoredGuid(value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEYS.guid, value);
  } catch {
    // Ignore storage write failures and keep runtime state usable.
  }
}

export async function readStoredDfid(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEYS.dfid);
  } catch {
    return null;
  }
}

export async function writeStoredDfid(value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEYS.dfid, value);
  } catch {
    // Ignore storage write failures and keep runtime state usable.
  }
}

export async function readStoredSession(): Promise<Record<string, string>> {
  return (await readJson<Record<string, string>>(STORAGE_KEYS.session)) ?? {};
}

export async function writeStoredSession(session: Record<string, string>): Promise<void> {
  await writeJson(STORAGE_KEYS.session, session);
}

export async function clearStoredApiState(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.guid).catch(() => undefined),
    SecureStore.deleteItemAsync(STORAGE_KEYS.dfid).catch(() => undefined),
    SecureStore.deleteItemAsync(STORAGE_KEYS.session).catch(() => undefined),
  ]);
}
