import { Buffer } from 'buffer';

import { ensureDeviceSessionValues, resetDeviceSessionValues } from './device';
import { ensureSessionHydrated } from './session';

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

let runtimePreparationPromise: Promise<void> | null = null;

function installRuntimeGlobals(): void {
  if (!globalThis.Buffer) {
    globalThis.Buffer = Buffer;
  }

  const runtimeGlobal = globalThis as { process?: RuntimeProcess };
  if (!runtimeGlobal.process) {
    runtimeGlobal.process = {
      env: Object.create(null) as Record<string, string | undefined>,
    };
  }

  const processRef = runtimeGlobal.process;
  processRef.env ??= Object.create(null) as Record<string, string | undefined>;
  processRef.env.platform = 'lite';
}

async function prepareRuntime(): Promise<void> {
  installRuntimeGlobals();
  await ensureSessionHydrated();
  await ensureDeviceSessionValues();
}

export async function prepareKugouApiRuntime(): Promise<void> {
  if (!runtimePreparationPromise) {
    runtimePreparationPromise = prepareRuntime().catch((error) => {
      runtimePreparationPromise = null;
      throw error;
    });
  }

  await runtimePreparationPromise;
}

export function resetKugouApiRuntime(): void {
  runtimePreparationPromise = null;
  resetDeviceSessionValues();
}
