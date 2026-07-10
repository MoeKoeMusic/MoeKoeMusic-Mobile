import type { MobileApiResult, UseAxiosOptions } from './types';

export type QrMatrix = {
  size: number;
  /** size*size 的点阵，按行排列，非 0 为深色模块 */
  data: Uint8Array;
};

export declare function createRequest(options: UseAxiosOptions): Promise<MobileApiResult>;
export declare function calculateMid(value: string): string;
export declare function generateWebGLHash(): string;
export declare function getGuid(): string;
export declare function createQrMatrix(text: string): QrMatrix;
