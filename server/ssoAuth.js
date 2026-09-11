/**
 * IBK AiPortal SSO 토큰 검증 모듈 — SSO연동가이드 §3·§5 를 스펙대로 구현.
 * 외부 의존성 0 (node 내장 crypto). 폐쇄망 전제.
 *
 * 대원칙: 우리는 토큰을 **검증만** 한다. 절대 발급하지 않는다.
 * 검증 순서 4단계는 운영 사고로 확정된 것이므로 생략·순서 변경 금지.
 */
import crypto from 'node:crypto';

export class SsoError extends Error {
  /** @param {'SSO_TOKEN_MALFORMED'|'SSO_TOKEN_INVALID'|'SSO_TOKEN_EXPIRED'|'SSO_NOT_CONFIGURED'} code */
  constructor(code, message) {
    super(message || code);
    this.code = code;
    this.status = code === 'SSO_NOT_CONFIGURED' ? 500 : 401;
  }
}

/**
 * HMAC 키 유도: sign 문자열의 앞 32자를 base64 디코딩한 24바이트.
 * (전체를 디코딩하거나 UTF-8 바이트를 그대로 쓰면 서명이 맞지 않는다 — 가장 많이 틀리는 지점)
 * @param {string} sign
 */
export function deriveKey(sign) {
  if (!sign || sign.length < 32) throw new SsoError('SSO_NOT_CONFIGURED', 'SSO_JWT_SIGN 이 없거나 32자 미만');
  const key = Buffer.from(sign.slice(0, 32), 'base64');
  if (key.length !== 24) {
    console.warn(`[sso] 경고: 유도된 키 길이가 ${key.length}바이트 (기대 24). sign 문자열을 확인하세요.`);
  }
  return key;
}

/** @param {string} seg */
function b64urlDecode(seg) {
  const pad = seg.length % 4 === 0 ? '' : '='.repeat(4 - (seg.length % 4));
  return Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/**
 * @param {string} token
 * @param {{ sign: string, clockSkewSeconds?: number, now?: number }} opts
 * @returns {{ employeeNo: string, name: string, orgCd: string|null, orgNm: string|null }}
 */
export function verifySsoToken(token, opts) {
  const key = deriveKey(opts.sign);
  const skew = opts.clockSkewSeconds ?? 60;
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  if (typeof token !== 'string') throw new SsoError('SSO_TOKEN_MALFORMED', '토큰 형식 오류');
  const parts = token.split('.');
  if (parts.length !== 3) throw new SsoError('SSO_TOKEN_MALFORMED', '토큰 세그먼트 오류');
  const [headerSeg, payloadSeg, sigSeg] = parts;

  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(headerSeg).toString('utf8'));
    payload = JSON.parse(b64urlDecode(payloadSeg).toString('utf8'));
  } catch {
    throw new SsoError('SSO_TOKEN_MALFORMED', '토큰 디코딩 실패');
  }

  // 1) 헤더 알고리즘 고정 — alg:none / HS512 치환 공격 차단
  if (!header || header.alg !== 'HS256') throw new SsoError('SSO_TOKEN_INVALID', '허용되지 않는 알고리즘');

  // 2) 서명 재계산 + 타이밍 세이프 비교 (길이 먼저 확인)
  const expected = crypto.createHmac('sha256', key).update(`${headerSeg}.${payloadSeg}`).digest();
  const actual = b64urlDecode(sigSeg);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new SsoError('SSO_TOKEN_INVALID', '서명 불일치');
  }

  // 3) 만료 검증 — exp 없는 토큰은 영구 토큰이 되므로 거부
  if (typeof payload.exp !== 'number') throw new SsoError('SSO_TOKEN_INVALID', 'exp 없음');
  if (now > payload.exp + skew) throw new SsoError('SSO_TOKEN_EXPIRED', '토큰 만료');
  if (typeof payload.nbf === 'number' && now + skew < payload.nbf) throw new SsoError('SSO_TOKEN_INVALID', '아직 유효하지 않은 토큰');

  // 4) 식별자는 claim `id`. 비어 있으면 거부. name 도 필수.
  const employeeNo = typeof payload.id === 'string' ? payload.id.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!employeeNo) throw new SsoError('SSO_TOKEN_INVALID', 'id 클레임 없음');
  if (!name) throw new SsoError('SSO_TOKEN_INVALID', 'name 클레임 없음');

  // 반환은 소비하는 클레임만. 포탈의 role/otp/sub 등은 버린다.
  return {
    employeeNo,
    name,
    orgCd: typeof payload.orgCd === 'string' ? payload.orgCd : null,
    orgNm: typeof payload.orgNm === 'string' ? payload.orgNm : null,
  };
}

/**
 * 요청에서 Bearer 토큰을 꺼낸다 (없으면 null)
 * @param {import('express').Request} req
 */
export function bearerFrom(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
