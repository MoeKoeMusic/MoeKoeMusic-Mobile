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

export const createMobileRequest: UseAxios = async (options) => {
  try {
    const result = await createRequest(options);
    return normalizeResult(options, result);
  } catch (error) {
    if (isMobileApiResult(error)) {
      throw normalizeResult(options, error);
    }

    throw error;
  }
};
