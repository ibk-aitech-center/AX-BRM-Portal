import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifySsoToken, deriveKey, SsoError } from '../server/ssoAuth.js';

const SIGN = crypto.randomBytes(36).toString('base64'); // 48자 → 앞 32자 디코딩 = 24바이트
const key = deriveKey(SIGN);
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function sign(payload, header = { alg: 'HS256', typ: 'JWT' }, k = key) {
  const h = b64url(JSON.stringify(header)); const p = b64url(JSON.stringify(payload));
  return `${h}.${p}.${b64url(crypto.createHmac('sha256', k).update(`${h}.${p}`).digest())}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { id: '045345', name: '김브름', sub: 'AiPortal Token', orgCd: 'D100', orgNm: 'AX디지털추진부', role: 'PORTAL_ADMIN', iat: now, exp: now + 8 * 3600 };

test('키 유도 — 앞 32자 base64 → 24바이트', () => {
  assert.equal(key.length, 24);
});

test('정상 토큰 → 소비 클레임만 반환 (role/sub 는 버림)', () => {
  const r = verifySsoToken(sign(good), { sign: SIGN });
  assert.deepEqual(r, { employeeNo: '045345', name: '김브름', orgCd: 'D100', orgNm: 'AX디지털추진부' });
  assert.ok(!('role' in r) && !('sub' in r));
});

test('alg:none / HS512 치환 → INVALID', () => {
  assert.throws(() => verifySsoToken(sign(good, { alg: 'none' }), { sign: SIGN }), (e) => e instanceof SsoError && e.code === 'SSO_TOKEN_INVALID');
  assert.throws(() => verifySsoToken(sign(good, { alg: 'HS512' }), { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_INVALID');
});

test('다른 키로 서명 → INVALID (전체 sign 을 디코딩한 키도 실패해야 함)', () => {
  const wrong = Buffer.from(SIGN, 'base64');
  assert.throws(() => verifySsoToken(sign(good, undefined, wrong), { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_INVALID');
});

test('만료 → EXPIRED, skew 안이면 통과, exp 없으면 거부', () => {
  assert.throws(() => verifySsoToken(sign({ ...good, exp: now - 120 }), { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_EXPIRED');
  assert.ok(verifySsoToken(sign({ ...good, exp: now - 30 }), { sign: SIGN, clockSkewSeconds: 60 }));
  const { exp, ...noExp } = good;
  assert.throws(() => verifySsoToken(sign(noExp), { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_INVALID');
});

test('id/name 누락 → INVALID, 세그먼트 오류 → MALFORMED', () => {
  assert.throws(() => verifySsoToken(sign({ ...good, id: '' }), { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_INVALID');
  assert.throws(() => verifySsoToken(sign({ ...good, name: undefined }), { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_INVALID');
  assert.throws(() => verifySsoToken('abc.def', { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_MALFORMED');
  assert.throws(() => verifySsoToken(null, { sign: SIGN }), (e) => e.code === 'SSO_TOKEN_MALFORMED');
});

test('sign 미설정 → NOT_CONFIGURED(500)', () => {
  assert.throws(() => verifySsoToken(sign(good), { sign: '' }), (e) => e.code === 'SSO_NOT_CONFIGURED' && e.status === 500);
});
