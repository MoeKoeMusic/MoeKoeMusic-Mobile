import { prepareKugouApiRuntime, resetKugouApiRuntime } from './bootstrap';
import { ensureDeviceSessionValues, getRegisterDeviceParams } from './device';
import { generatedModuleNames, modules, type GeneratedModuleName } from './generated/modules';
import { clearSession, ensureSessionHydrated, getSessionSnapshot, mergeSessionCookies } from './session';
import { createMobileRequest } from './use-axios';
import type { CookieShape, MobileApiParams, MobileApiResult } from './types';

export { createQrMatrix, type QrMatrix } from './runtime';

type MobileApiClient = {
  [K in GeneratedModuleName]: (params?: MobileApiParams) => Promise<MobileApiResult>;
};

let bootstrapPromise: Promise<void> | null = null;

function parseCookieInput(cookie: MobileApiParams['cookie']): CookieShape {
  if (!cookie) {
    return {};
  }

  if (typeof cookie !== 'string') {
    return cookie;
  }

  return cookie
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<CookieShape>((accumulator, segment) => {
      const equalsIndex = segment.indexOf('=');
      if (equalsIndex <= 0) return accumulator;

      const key = segment.slice(0, equalsIndex).trim();
      const value = segment.slice(equalsIndex + 1).trim();
      if (!key) return accumulator;

      accumulator[key] = value;
      return accumulator;
    }, {});
}

function isMobileApiResult(value: unknown): value is MobileApiResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MobileApiResult>;
  return typeof candidate.status === 'number' && Array.isArray(candidate.cookie);
}

async function invokeModule(name: GeneratedModuleName, params: MobileApiParams = {}): Promise<MobileApiResult> {
  await prepareKugouApiRuntime();
  await ensureSessionHydrated();

  const mergedCookie = {
    ...getSessionSnapshot(),
    ...parseCookieInput(params.cookie),
  };

  try {
    const response = await Promise.resolve(modules[name]({ ...params, cookie: mergedCookie }, createMobileRequest));
    await mergeSessionCookies(response.cookie);
    return response;
  } catch (error) {
    if (isMobileApiResult(error)) {
      await mergeSessionCookies(error.cookie);
    }

    throw error;
  }
}

const client = {} as MobileApiClient;

for (const name of generatedModuleNames) {
  client[name] = (params) => invokeModule(name, params);
}

export const mobileApi: MobileApiClient = client;

export async function bootstrapMobileApi(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await prepareKugouApiRuntime();
      await ensureDeviceSessionValues();

      if (!getSessionSnapshot().dfid) {
        await mobileApi.register_dev(await getRegisterDeviceParams());
      }

      if (!getSessionSnapshot().dfid) {
        throw new Error('register_dev did not return dfid');
      }
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}

export function getApiSession(): Record<string, string> {
  return getSessionSnapshot();
}

export async function clearApiSession(): Promise<void> {
  bootstrapPromise = null;
  resetKugouApiRuntime();
  await clearSession();
}
