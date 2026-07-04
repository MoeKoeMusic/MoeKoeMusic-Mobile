type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
}

export function readApiMessage(body: unknown) {
  const data = toRecord(body);
  return pickText(data.error_msg, data.errmsg, data.msg, data.message, data.error, data.info);
}

export function isApiSuccess(body: unknown) {
  const data = toRecord(body);
  return Boolean(
    data.status === 1 || data.code === 200 || data.errcode === 0 || data.error_code === 0
  );
}

/** 接口失败时优先展示服务端消息，否则带上错误码方便排查。 */
export function describeApiFailure(body: unknown, fallback: string) {
  const message = readApiMessage(body);
  if (message) {
    return message;
  }

  const data = toRecord(body);
  const code = pickText(
    String(data.error_code ?? ''),
    String(data.errcode ?? ''),
    String(data.code ?? ''),
    String(data.status ?? '')
  );
  return code && code !== '0' ? `${fallback}（错误码 ${code}）` : fallback;
}

export function isValidPhone(value: string) {
  return /^1\d{10}$/.test(value);
}

export function maskPhone(value: string) {
  if (!isValidPhone(value)) {
    return value;
  }

  return `${value.slice(0, 3)}****${value.slice(7)}`;
}

export function compactSessionValue(value: string | undefined, keep = 6) {
  if (!value) {
    return '未写入';
  }

  if (value.length <= keep * 2) {
    return value;
  }

  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
