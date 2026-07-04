import { Buffer } from 'buffer';

import { createRequest } from './runtime';
import type { MobileApiResult, UseAxios, UseAxiosOptions } from './types';

function normalizeBinaryBody(body: unknown): unknown {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'binary');
  }

  return body;
}

function isMobileApiResult(value: unknown): value is MobileApiResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MobileApiResult>;
  return typeof candidate.status === 'number' && Array.isArray(candidate.cookie);
}

function normalizeResult(options: UseAxiosOptions, result: MobileApiResult): MobileApiResult {
  if (options.responseType === 'arraybuffer') {
    result.body = normalizeBinaryBody(result.body);
  }

  return result;
}

let requestSequence = 0;

function describeTarget(options: UseAxiosOptions): string {
  const headers = (options.headers ?? {}) as Record<string, unknown>;
  const router = typeof headers['x-router'] === 'string' ? headers['x-router'] : '';
  const base = options.baseURL ?? (router ? `https://${router}` : '(gateway)');
  return `${options.method ?? 'GET'} ${base}${options.url ?? ''}`;
}

function compactBody(body: unknown): string {
  try {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    if (!text) {
      return '(empty)';
    }

    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  } catch {
    return '(unserializable body)';
  }
}

export const createMobileRequest: UseAxios = async (options) => {
  // login.user.kugou.com 仅支持 HTTP（无有效 TLS），不要重写为 https；
  // 明文流量已通过 app.json 的 usesCleartextTraffic / NSAllowsArbitraryLoads 放行。
  const requestId = __DEV__ ? ++requestSequence : 0;
  const startedAt = __DEV__ ? Date.now() : 0;

  if (__DEV__) {
    console.log(`[kugou-api #${requestId}] → ${describeTarget(options)}`);
  }

  try {
    const result = await createRequest(options);

    if (__DEV__) {
      console.log(
        `[kugou-api #${requestId}] ← ${result.status} (${Date.now() - startedAt}ms) ${compactBody(result.body)}`
      );
    }

    return normalizeResult(options, result);
  } catch (error) {
    if (__DEV__) {
      const detail = isMobileApiResult(error)
        ? `HTTP ${error.status} ${compactBody(error.body)}`
        : String(error);
      console.log(
        `[kugou-api #${requestId}] ✕ (${Date.now() - startedAt}ms) ${describeTarget(options)} — ${detail}`
      );
    }

    if (isMobileApiResult(error)) {
      throw normalizeResult(options, error);
    }

    throw error;
  }
};
