/**
 * 로컬 개발용 SSO 목업 팝업 생성 (SSO연동가이드 §9)
 *  - .env 의 SSO_JWT_SIGN 으로 서명한, 만료가 먼 미래인 토큰을 담은 public/popup.html 을 만든다.
 *  - 이 파일은 운영 산출물에 절대 포함되면 안 된다 → vite 빌드 플러그인이 dist/popup.html 을 자동 삭제.
 *  - 서버는 토큰을 발급하지 않는다. 이 스크립트는 "포탈 역할"을 흉내 내는 개발 도구일 뿐이다.
 */
import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { deriveKey } from '../ssoAuth.js';

const sign = process.env.SSO_JWT_SIGN || '';
if ((process.env.NODE_ENV || 'development') === 'production') {
  console.log('[gen-popup] production — 생성하지 않음');
  process.exit(0);
}
if (!sign || sign.startsWith('REPLACE_WITH')) {
  console.error('[gen-popup] .env 의 SSO_JWT_SIGN 을 설정하세요 (.env.example 참고)');
  process.exit(1);
}
const key = deriveKey(sign);
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', key).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365; // 1년 — 개발 전용
const employees = [
  // 024498 은 초기 시드 관리자(hrSync.INITIAL_ADMIN_EMPLOYEE_NOS) — 담당자 관리 화면을 로컬에서 보기 위한 개발용 로그인.
  { id: '024498', name: '시스템관리자', orgCd: 'D100', orgNm: 'AX디지털추진부', role: '시스템 관리자' },
  { id: '045345', name: '김브름', orgCd: 'D100', orgNm: 'AX디지털추진부', role: 'AX-BRM' },
  { id: '051234', name: '이현업', orgCd: 'D210', orgNm: '개인고객부', role: '요청자' },
  { id: '062211', name: '박영업', orgCd: 'B031', orgNm: '을지로지점', role: '요청자' },
  { id: '073322', name: '최기획', orgCd: 'D330', orgNm: '경영기획부', role: '요청자' },
  // DATA-BRM 은 수기 부여 — 로그인 후 관리자가 담당자 관리에서 'DATA-BRM' 으로 바꿔야 데이터 요청 메뉴가 보인다
  { id: '081100', name: '정데이터', orgCd: 'D410', orgNm: 'AX데이터혁신부', role: '요청자 → DATA-BRM(수기)' },
];

const buttons = employees.map((e) => {
  const token = makeToken({ id: e.id, name: e.name, sub: 'AiPortal Token', orgCd: e.orgCd, orgNm: e.orgNm, loginType: 'SSO', iat, exp });
  return `<button onclick="go('${token}')"><b>${e.name}</b> <span>${e.orgNm} · ${e.role}</span><code>${e.id}</code></button>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>[DEV] AiPortal 목업 로그인</title><link rel="icon" href="data:,">
<style>
body{font-family:system-ui,sans-serif;background:#F4F8F7;color:#1B2B2C;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #D9E3E2;border-radius:16px;padding:32px;width:420px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 20px;color:#5E7379;font-size:13px}
button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:14px 16px;margin:8px 0;border:1px solid #C9D6D6;border-radius:12px;background:#fff;font-size:15px;cursor:pointer}
button:hover{border-color:#17545A;background:#E8F3F2}button span{color:#5E7379;font-size:13px;flex:1}code{font-size:12px;color:#17545A}
.warn{margin-top:16px;font-size:12px;color:#A23425}
</style></head><body><div class="card">
<h1>AiPortal 로그인 (로컬 목업)</h1><p>직원을 선택하면 토큰과 함께 앱으로 돌아갑니다.</p>
${buttons}
<div class="warn">⚠ 개발 전용 파일. 빌드 시 자동 삭제됨 — 운영 산출물에 포함 금지.</div>
</div>
<script>function go(t){location.href='/?token='+encodeURIComponent(t)}</script>
</body></html>`;

const out = path.resolve('public', 'popup.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');
console.log(`[gen-popup] wrote ${out} (${employees.length} mock employees)`);
