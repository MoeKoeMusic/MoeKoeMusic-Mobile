import { readStoredDfid, readStoredSession, writeStoredDfid, writeStoredSession, clearStoredApiState } from './storage';

type SessionPatch = Record<string, string | null | undefined>;

let sessionState: Record<string, string> = {};
let hydrationPromise: Promise<void> | null = null;
let hydrated = false;

function parseCookieHeader(rawCookie: string): [string, string] | null {
  const firstSegment = rawCookie.split(';')[0]?.trim();
  if (!firstSegment) return null;

  const equalsIndex = firstSegment.indexOf('=');
  if (equalsIndex <= 0) return null;

  const key = firstSegment.slice(0, equalsIndex).trim();
  const value = firstSegment.slice(equalsIndex + 1).trim();
  if (!key) return null;

  return [key, value];
}

export async function ensureSessionHydrated(): Promise<void> {
  if (hydrated) return;

  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const [storedSession, storedDfid] = await Promise.all([readStoredSession(), readStoredDfid()]);
      sessionState = { ...storedSession };

      if (storedDfid && !sessionState.dfid) {
        sessionState.dfid = storedDfid;
      }

      hydrated = true;
      hydrationPromise = null;
    })().catch((error) => {
      hydrationPromise = null;
      throw error;
    });
  }

  await hydrationPromise;
}

export function getSessionSnapshot(): Record<string, string> {
  return { ...sessionState };
}

export function setSessionValues(patch: SessionPatch): boolean {
  let changed = false;

  for (const [key, value] of Object.entries(patch)) {
    if (!key) continue;

    if (value == null || value === '') {
      if (key in sessionState) {
        delete sessionState[key];
        changed = true;
      }
      continue;
    }

    const nextValue = String(value);
    if (sessionState[key] !== nextValue) {
      sessionState[key] = nextValue;
      changed = true;
    }
  }

  return changed;
}

export async function persistSession(): Promise<void> {
  await writeStoredSession(sessionState);

  if (sessionState.dfid) {
    await writeStoredDfid(sessionState.dfid);
  }
}

export async function mergeSessionCookies(cookieHeaders: string[] = []): Promise<void> {
  let changed = false;

  for (const rawCookie of cookieHeaders) {
    const parsed = parseCookieHeader(rawCookie);
    if (!parsed) continue;
    const [key, value] = parsed;
    changed = setSessionValues({ [key]: value }) || changed;
  }

  if (changed) {
    await persistSession();
  }
}

export async function clearSession(): Promise<void> {
  sessionState = {};
  hydrated = true;
  hydrationPromise = null;
  await clearStoredApiState();
}
