import type { MobileApiResult, UseAxiosOptions } from './types';

export declare function createRequest(options: UseAxiosOptions): Promise<MobileApiResult>;
export declare function calculateMid(value: string): string;
export declare function generateWebGLHash(): string;
export declare function getGuid(): string;
