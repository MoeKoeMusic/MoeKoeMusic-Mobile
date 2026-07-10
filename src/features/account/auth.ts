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

/** kugou-api 模块业务失败时抛出的是 MobileApiResult 形状的对象（非 Error），从中取响应体。 */
export function readThrownApiBody(error: unknown): unknown {
  if (!error || typeof error !== 'object' || error instanceof Error) {
    return null;
  }

  const record = error as { status?: unknown; body?: unknown };
  return typeof record.status === 'number' && 'body' in record ? (record.body ?? null) : null;
}

/** 统一登录类错误文案：兼容抛出的 MobileApiResult、Error 与未知值。 */
export function describeAuthError(error: unknown, fallback: string) {
  const body = readThrownApiBody(error);
  if (body) {
    return describeApiFailure(body, fallback);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export type KugouAccountOption = {
  userid: string;
  nickname: string;
  pic: string;
  grade: string;
};

/** 手机号绑定多个账号时，登录失败响应的 data.info_list 携带候选账号列表。 */
export function readAccountOptions(body: unknown): KugouAccountOption[] {
  const data = toRecord(toRecord(body).data);
  const list = Array.isArray(data.info_list) ? data.info_list : [];

  return list
    .map((item) => {
      const record = toRecord(item);
      return {
        userid: pickText(record.userid),
        nickname: pickText(record.nickname),
        pic: pickText(record.pic),
        grade: pickText(record.p_grade),
      };
    })
    .filter((item) => item.userid && item.userid !== '0');
}

export type SsaChallenge = {
  eventId: string;
  sid: string;
  edt: string;
};

/** 密码登录触发二次安全验证（错误码 20028）时，请求层会把 ssaCode 与配套的 sid/edt 指纹附在响应体上。 */
export function readSsaChallenge(body: unknown): SsaChallenge | null {
  const data = toRecord(body);
  const eventId = pickText(data.ssaCode);
  if (!eventId) {
    return null;
  }

  return { eventId, sid: pickText(data.sid), edt: pickText(data.edt) };
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
