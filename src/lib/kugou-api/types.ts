export type CookieValue = string | number | boolean;

export type CookieShape = Record<string, CookieValue>;

export type MobileApiParams = Record<string, unknown> & {
  cookie?: CookieShape | string;
};

export interface MobileApiResult {
  status: number;
  body: unknown;
  cookie: string[];
  headers?: Record<string, string>;
}

export interface UseAxiosOptions {
  method: 'GET' | 'POST' | 'get' | 'post';
  url: string;
  baseURL?: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string | number>;
  cookie?: CookieShape;
  encryptType?: 'android' | 'web' | 'register';
  encryptKey?: boolean;
  clearDefaultParams?: boolean;
  notSignature?: boolean;
  ip?: string;
  realIP?: string;
  responseType?: string;
}

export type UseAxios = (options: UseAxiosOptions) => Promise<MobileApiResult>;

export type RawApiModule = (
  params: MobileApiParams | undefined,
  useAxios: UseAxios
) => Promise<MobileApiResult> | MobileApiResult;
