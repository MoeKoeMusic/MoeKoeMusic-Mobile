type UnknownRecord = Record<string, unknown>;

export function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

export function toRecords(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object');
}

export function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

export function pickStringLike(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
      return String(value);
    }
  }

  return '';
}

export function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

export function formatApiError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
