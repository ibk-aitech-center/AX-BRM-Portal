/**
 * API 래퍼 — "서버가 거절"과 "서버에 못 닿음"을 반드시 구분한다 (SSO연동가이드 §7).
 *  - ApiError.status 가 있으면 서버 응답(거절). 401/400(인증 코드)일 때만 토큰 폐기.
 *  - isNetworkError 이면 토큰을 건드리지 않는다. 5xx 도 폐기하지 않는다.
 */
import { getToken, discardToken, AUTH_REJECTED_EVENT } from './ssoToken';

export class ApiError extends Error {
  status: number | null;
  code: string;
  isNetworkError: boolean;
  constructor(message: string, status: number | null, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
    this.isNetworkError = status === null;
  }
}

const AUTH_CODES = new Set(['AUTH_REQUIRED', 'USER_NOT_PROVISIONED', 'SSO_TOKEN_MALFORMED', 'SSO_TOKEN_INVALID', 'SSO_TOKEN_EXPIRED', 'SSO_ID_FORMAT']);

/** 상태코드 → 사용자가 취할 행동 (DESIGN_GUIDELINES §6) */
export function humanMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.isNetworkError) return '서버에 연결하지 못했어요. 네트워크를 확인하고 잠시 후 다시 시도해 주세요.';
    if (e.status === 401) return '로그인이 만료됐어요. 다시 접속해 주세요.';
    if (e.status === 403) return e.message || '이 화면을 볼 권한이 없어요.';
    if (e.status === 404) return e.message || '찾을 수 없어요. 목록에서 다시 선택해 주세요.';
    if (e.status === 409) return e.message || '이미 처리된 요청이에요. 화면을 새로 고쳐 주세요.';
    if (e.status === 413) return e.message || '파일이 너무 커요. 20MB 이하로 줄여서 올려주세요.';
    if (e.status === 429) return '이용자가 많아 잠시 대기 중이에요. 30초쯤 뒤에 다시 시도해 주세요.';
    if (e.status && e.status >= 500) return '서버가 잠시 아파요. 잠시 후 다시 시도해 주세요.';
    return e.message || '요청을 처리하지 못했어요.';
  }
  return '알 수 없는 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}

interface Options { method?: string; body?: unknown; raw?: boolean; signal?: AbortSignal; keepalive?: boolean }

export async function request<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      keepalive: opts.keepalive,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError('network', null, 'NETWORK');
  }

  if (!res.ok) {
    let code = 'ERROR'; let message = res.statusText;
    try { const j = await res.json(); code = j.error || code; message = j.message || message; } catch { /* body 없음 */ }
    if ((res.status === 401 || res.status === 400) && AUTH_CODES.has(code)) {
      // 서버가 토큰을 거절했을 때만 폐기(§7). 포탈로 **자동 이동은 하지 않는다** — 토큰을 들고 왔는데도 되돌려 보내면
      // 포탈 ↔ 앱 사이를 오가는 루프가 되므로, 화면이 "로그인이 만료됐어요" 안내와 "포탈로 이동" 버튼을 보여 준다 (session.ts 가 이 이벤트를 받는다)
      discardToken();
      window.dispatchEvent(new CustomEvent(AUTH_REJECTED_EVENT, { detail: { code, message } }));
    }
    throw new ApiError(message, res.status, code);
  }
  if (opts.raw) return (await res.text()) as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(p: string, signal?: AbortSignal) => request<T>(p, { signal }),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: body ?? {} }),
  put: <T>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body: body ?? {} }),
  del: <T>(p: string, opts: { keepalive?: boolean } = {}) => request<T>(p, { method: 'DELETE', ...opts }),
  text: (p: string) => request<string>(p, { raw: true }),
};

/** 인증 헤더가 필요한 파일 다운로드 — URL 에 토큰을 싣지 않기 위해 fetch → blob */
export async function downloadWithAuth(path: string, fileName: string): Promise<void> {
  const token = getToken();
  let res: Response;
  try { res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} }); }
  catch { throw new ApiError('network', null, 'NETWORK'); }
  if (!res.ok) throw new ApiError('다운로드에 실패했어요', res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
