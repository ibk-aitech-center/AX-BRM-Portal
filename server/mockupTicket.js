/**
 * 목업 열람 티켓 — 목업 HTML 을 별도 창의 **최상위 문서**로 여는 GET 은 Authorization 헤더를 실을 수 없어서,
 * 로그인된 클라이언트가 먼저 짧은 수명의 티켓을 받아(POST, Bearer) 그 티켓을 쿼리로 붙여 연다. (2026-09-09: sandbox iframe → 온전한 창)
 *   티켓 = base64url("<첨부id>.<만료ms>.<사번>") + "." + HMAC-SHA256(그 문자열)
 *   - 서명 키는 SSO_JWT_SIGN 에서 파생(용도 문자열을 섞어 SSO 검증 키와 분리). 없으면(로컬) 기동 시 난수.
 *   - 첨부 id 와 사번이 묶여 있어 다른 첨부·다른 사람에게 재사용할 수 없고, 열 때 그 사번의 열람 권한을 다시 확인한다.
 *   - 토큰을 URL 에 싣지 않는다는 원칙은 그대로 — 티켓은 이 첨부 하나만, 10분만 연다.
 */
import crypto from 'node:crypto';
import { env } from './env.js';

export const TICKET_TTL_MS = 10 * 60 * 1000;
const key = crypto.createHmac('sha256', 'ax-brm-mockup-view').update(env.SSO_JWT_SIGN || crypto.randomBytes(32).toString('hex')).digest();
const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

/** @returns {string} */
export function mintTicket({ attachmentId, employeeNo, now = Date.now(), ttlMs = TICKET_TTL_MS }) {
  const payload = b64u(`${attachmentId}.${now + ttlMs}.${employeeNo}`);
  return `${payload}.${sign(payload)}`;
}

/**
 * 검증 — 실패 이유를 코드로 돌려준다 (화면 문구용). 성공이면 { ok: true, employeeNo, exp }
 * @returns {{ ok: true, employeeNo: string, exp: number } | { ok: false, reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'WRONG_ATTACHMENT' | 'EXPIRED' }}
 */
export function verifyTicket(ticket, attachmentId, now = Date.now()) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'MALFORMED' };
  const [payload, mac] = parts;
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return { ok: false, reason: 'BAD_SIGNATURE' };
  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const i1 = decoded.indexOf('.'), i2 = decoded.lastIndexOf('.');
  if (i1 < 0 || i2 <= i1) return { ok: false, reason: 'MALFORMED' };
  const id = decoded.slice(0, i1), exp = Number(decoded.slice(i1 + 1, i2)), employeeNo = decoded.slice(i2 + 1);
  if (id !== attachmentId) return { ok: false, reason: 'WRONG_ATTACHMENT' };
  if (!Number.isFinite(exp) || exp < now) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, employeeNo, exp };
}
