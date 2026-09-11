/**
 * SSO 토큰 접근은 **이 모듈 하나로만** 한다 (SSO연동가이드 §4).
 * 인증 로직과 API 호출부가 각자 sessionStorage 를 읽으면 한쪽만 바뀌는 사고가 난다.
 */
const KEY = 'aiBrmSsoToken';
const GUARD_KEY = 'aiBrmSsoRedirectAt';
/** 서버가 토큰을 거절해 폐기했을 때 api.ts 가 올리는 이벤트 — session.ts 가 받아 안내 화면으로 바꾼다 */
export const AUTH_REJECTED_EVENT = 'aibrm:auth-rejected';

export function getToken(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

/** 토큰 폐기 — 서버가 토큰을 거절(401/400)했을 때만 호출한다 (§7). 네트워크 오류·5xx 로는 절대 호출 금지. */
export function discardToken(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
}

/**
 * 포탈로 재인증 이동 — index.html IIFE 와 같은 규칙.
 * **토큰이 남아 있으면 이동하지 않는다** (force 제외). 토큰을 들고 있는 상태에서 포탈로 되돌려 보내면 포탈이 다시 토큰을 붙여 보내고,
 * 그 토큰이 또 거절되면 끝없이 오가게 된다. 거절된 토큰은 api.ts 가 먼저 폐기하므로, 자동 호출 경로에서는 토큰이 없을 때만 이동한다.
 * @param opts.force 사용자가 "포탈로 이동"·"로그아웃"을 직접 눌렀을 때 — 토큰·루프 가드와 무관하게 이동
 */
export function redirectToPortal(opts: { force?: boolean } = {}): void {
  try {
    if (!opts.force && getToken()) return; // 토큰이 있으면 자동 이동 금지
    const last = Number(sessionStorage.getItem(GUARD_KEY) || 0);
    if (!opts.force && last && Date.now() - last < 15000) return; // 루프 가드
    const host = window.location.hostname;
    // 포탈 팝업 경로 — 개발계 devaiportal / 운영계 aiportal (2026-09-07 포탈 운영팀 확정). .env 로 바꿀 수 있고, 비어 있으면 아래 기본값
    const target = /^(localhost|127\.0\.0\.1)$/.test(host) ? '/popup.html'
      : host.includes('devai') ? (import.meta.env.VITE_SSO_PORTAL_DEV || 'http://devaiportal.ibk.co.kr/portal/link/aibrm/popup') : (import.meta.env.VITE_SSO_PORTAL_PROD || 'http://aiportal.ibk.co.kr/portal/link/aibrm/popup');
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    window.location.replace(target);
  } catch { /* noop */ }
}

export function loopDetected(): boolean {
  return Boolean((window as unknown as { __ssoLoopDetected?: boolean }).__ssoLoopDetected);
}
