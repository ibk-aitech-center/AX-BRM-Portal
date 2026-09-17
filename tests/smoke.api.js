/**
 * API 스모크 테스트 — 서버(localhost:3000)가 떠 있고 public/popup.html 이 생성돼 있어야 한다.
 *   node tests/smoke.api.js
 * 요청자 → 초안 → 자동저장 → 신청 → BRM 검토 → 목업 업로드 → 미리보기 → 통계 → CSV 순으로 전 구간을 훑는다.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:3000';
const html = fs.readFileSync('public/popup.html', 'utf8');
const tokens = [...html.matchAll(/go\('([^']+)'\)/g)].map((m) => m[1]);
assert.ok(tokens.length >= 2, 'popup.html 에 토큰이 2개 이상 있어야 함');
// 목업 로그인 버튼 순서에 의존하지 않고 사번으로 고른다 — 045345 김브름(BRM, 팀코드 8476), 051234 이현업(요청자)
const empNoOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).id;
const brmToken = tokens.find((t) => empNoOf(t) === '045345');
const reqToken = tokens.find((t) => empNoOf(t) === '051234');
const adminToken = tokens.find((t) => empNoOf(t) === '024498'); // 시스템 관리자(초기 시드)
assert.ok(brmToken && reqToken, 'popup.html 에 045345(BRM)·051234(요청자) 토큰이 있어야 함');

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
const step = (name) => console.log('•', name);

// 1) 로그인
step('로그인(요청자·BRM)');
let r = await api('POST', '/api/auth/sso', { token: reqToken });
assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.user.role, 'requester');
r = await api('POST', '/api/auth/sso', { token: brmToken });
assert.equal(r.status, 200); assert.ok(['brm', 'admin'].includes(r.json.user.role), '045345 는 BRM 이어야 함');
r = await api('POST', '/api/auth/sso', { token: 'a.b.c' }); assert.equal(r.status, 401);
r = await api('GET', '/api/requests'); assert.equal(r.status, 401);

// 2) 초안 → 자동저장 → 신청
step('초안 생성·자동저장');
r = await api('POST', '/api/requests', { answers: { q7_kind: 'dev' } }, reqToken);
assert.equal(r.status, 201); const id = r.json.request.id; assert.equal(r.json.request.status, 'draft');
const answers = {
  q1_title: '지점별 실적 엑셀 취합 자동화', q2_channel: 'ch1', q3_current: '매일 9시 A시스템 조회 → 엑셀 붙이기', q4_time: '매일 40분',
  q5_users: 'team', q6_freq: 'daily', q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q12_source: '정보계 마트',
  q13_online: 'batch', q14_volume: 'large', q16_embed: 'standalone', q17_special: 'no',
  q24_ownsys: 'yes', q25_itstaff: 'no',
  q18_owner: 'me', q19_manager: 'no', q20_participate: 'yes', q21_goal: '40분 → 1분', q22_when: 'year', q23_refs: '',
};
r = await api('PUT', `/api/requests/${id}`, { answers: { ...answers, q21_goal: undefined } }, reqToken); assert.equal(r.status, 200);
step('미완성 신청은 400');
r = await api('POST', `/api/requests/${id}/submit`, {}, reqToken); assert.equal(r.status, 400, JSON.stringify(r.json));
step('신청 확정 → 접수번호·판정 스냅샷');
r = await api('POST', `/api/requests/${id}/submit`, { answers }, reqToken);
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.match(r.json.request.reqNo, /^BRM-\d{4}-\d{4}$/); assert.equal(r.json.request.status, 'submitted');
assert.equal(r.json.request.judgement.integration, 'bdp'); assert.equal(r.json.request.judgement.dataCase, 'B');
step('신청 후 수정 불가(409), 타인 열람 불가(403)');
r = await api('PUT', `/api/requests/${id}`, { answers }, reqToken); assert.equal(r.status, 409);
r = await api('GET', `/api/requests?scope=all`, null, reqToken); assert.equal(r.status, 403);

// 3) BRM 검토
step('BRM 접수함 · 검토 의견 · 상태 전이');
r = await api('GET', '/api/requests?scope=all', null, brmToken); assert.equal(r.status, 200); assert.ok(r.json.items.some((x) => x.id === id));
assert.equal(r.json.items.find((x) => x.id === id).unread, 'new', '아직 안 연 건은 new');
r = await api('GET', '/api/requests/unread-count', null, brmToken); assert.equal(r.status, 200); assert.ok(r.json.all >= 1, '신규 건수 배지');
r = await api('POST', `/api/requests/${id}/reviews`, { decision: 'note', opinion: '1차 검토 시작' }, brmToken); assert.equal(r.status, 201); assert.equal(r.json.status, 'reviewing');
r = await api('POST', `/api/requests/${id}/reviews`, { decision: 'accept', feasible: 'yes', approach: 'BDP 일배치 + AI-HUB', opinion: '표준 경로로 진행 가능', estimatedWeeksMin: 10, estimatedWeeksMax: 14 }, brmToken);
assert.equal(r.status, 201); assert.equal(r.json.status, 'accepted');
r = await api('POST', `/api/requests/${id}/status`, { to: 'done' }, brmToken); assert.equal(r.status, 409, '허용되지 않은 전이');
r = await api('POST', `/api/requests/${id}/status`, { to: 'developing', note: '개발 착수' }, brmToken); assert.equal(r.status, 200);
step('완료 처리 — 종결 분류 필수 · 정정 · 되돌리면 비움');
r = await api('POST', `/api/requests/${id}/status`, { to: 'done' }, brmToken); assert.equal(r.status, 400); assert.equal(r.json.error, 'CLOSURE_REQUIRED');
r = await api('POST', `/api/requests/${id}/status`, { to: 'done', closure: { deploy: 'mars', form: 'poc' } }, brmToken); assert.equal(r.status, 400, '모르는 분류 키');
r = await api('POST', `/api/requests/${id}/closure`, { closure: { deploy: 'aihub', form: 'poc' } }, brmToken); assert.equal(r.status, 409, '완료 전엔 정정 불가');
r = await api('POST', `/api/requests/${id}/status`, { to: 'done', closure: { deploy: 'aihub', form: 'poc' }, note: '9월 오픈' }, brmToken);
assert.equal(r.status, 200); assert.deepEqual(r.json.closure, { deploy: 'aihub', form: 'poc' });
r = await api('GET', `/api/requests/${id}`, null, reqToken); assert.deepEqual(r.json.request.closure, { deploy: 'aihub', form: 'poc' }); assert.ok(r.json.request.closedAt);
assert.match(r.json.history.at(-1).note, /종결 분류: AI Hub 플랫폼 · 실데이터 PoC — 9월 오픈/);
r = await api('POST', `/api/requests/${id}/closure`, { closure: { deploy: 'vibelabs', form: 'service' } }, brmToken); assert.equal(r.status, 200); assert.equal(r.json.changed, true);
r = await api('POST', `/api/requests/${id}/closure`, { closure: { deploy: 'vibelabs', form: 'service' } }, brmToken); assert.equal(r.json.changed, false);
r = await api('POST', `/api/requests/${id}/closure`, { closure: { deploy: 'vibelabs' } }, reqToken); assert.equal(r.status, 403, '요청자는 분류 불가');
r = await api('GET', `/api/requests?scope=all&assignee=none`, null, brmToken); assert.equal(r.status, 200); assert.ok(r.json.items.some((x) => x.id === id), '미지정 필터');
r = await api('GET', `/api/requests?scope=all&assignee=000000`, null, brmToken); assert.ok(!r.json.items.some((x) => x.id === id), '담당자 필터');
r = await api('GET', `/api/requests/meta`, null, brmToken); assert.ok(typeof r.json.unassigned === 'number' && Array.isArray(r.json.assignees));
r = await api('POST', `/api/requests/${id}/status`, { to: 'developing', note: '보완 개발' }, brmToken); assert.equal(r.status, 200);
r = await api('GET', `/api/requests/${id}`, null, brmToken); assert.equal(r.json.request.closure, null); assert.equal(r.json.request.closedAt, null);
r = await api('POST', `/api/requests/${id}/status`, { to: 'done', closure: { deploy: 'geni', form: 'concept' } }, brmToken); assert.equal(r.status, 200);

// 4) 첨부(목업)
step('목업 HTML 업로드 · 버전 · 미리보기 원문 · 권한');
const mock = '<!doctype html><html><body><h1>목업 v1</h1><script>document.title="m"</script></body></html>';
r = await api('POST', `/api/requests/${id}/attachments`, { kind: 'mockup', fileName: 'concept.html', mime: 'text/html', contentBase64: Buffer.from(mock).toString('base64'), note: '1차' }, brmToken);
assert.equal(r.status, 201); assert.equal(r.json.version, 1); const attId = r.json.id;
r = await api('POST', `/api/requests/${id}/attachments`, { kind: 'mockup', fileName: 'concept-v2.html', mime: 'text/html', contentBase64: Buffer.from(mock).toString('base64') }, brmToken);
assert.equal(r.json.version, 2);
r = await api('POST', `/api/requests/${id}/attachments`, { kind: 'mockup', fileName: 'x.html', mime: 'text/html', contentBase64: 'PGI+' }, reqToken); assert.equal(r.status, 403, '요청자는 목업 불가');
r = await api('POST', `/api/requests/${id}/attachments`, { kind: 'reference', fileName: 'ref.txt', mime: 'text/plain', contentBase64: Buffer.from('참고').toString('base64') }, reqToken); assert.equal(r.status, 201);
r = await api('POST', `/api/attachments/${attId}/view-ticket`, {}, reqToken); assert.equal(r.status, 200); const viewUrl = r.json.url; assert.ok(viewUrl.startsWith(`/api/attachments/${attId}/view?t=`));
r = await api('GET', viewUrl, null, null); assert.equal(r.status, 200, '티켓만으로 열린다'); assert.match(r.headers.get('content-type'), /text\/html/); assert.ok(String(r.json).includes('목업 v1'));
r = await api('GET', `/api/attachments/${attId}/view?t=bogus`, null, null); assert.equal(r.status, 403, '잘못된 티켓은 안내 페이지');
r = await api('GET', `/api/attachments/${attId}/download`, null, reqToken); assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /attachment/);

// 5) 상세·코멘트
step('상세 · 코멘트 · 이력');
r = await api('POST', `/api/requests/${id}/comments`, { body: '목업 확인했어요. 지점 필터가 있으면 좋겠어요.' }, reqToken); assert.equal(r.status, 201);
r = await api('GET', `/api/requests/${id}`, null, reqToken); assert.equal(r.status, 200);
assert.equal(r.json.reviews.length, 2); assert.equal(r.json.attachments.length, 3); assert.equal(r.json.comments.length, 1);
assert.deepEqual(r.json.history.map((h) => h.to), ['submitted', 'reviewing', 'accepted', 'developing', 'done', 'done', 'developing', 'done']);

// 6) 통계·CSV·관리
step('통계 · CSV · 사용자 관리');
r = await api('GET', '/api/stats', null, brmToken); assert.equal(r.status, 200); assert.ok(r.json.totals.submitted >= 1); assert.ok(r.json.byOrg.length >= 1);
assert.ok(r.json.byAssignee.some((a) => a.key === 'none' && a.n >= 1), '미지정 묶음');
assert.equal(r.json.closure.byDeploy.length, 5); assert.equal(r.json.closure.byForm.length, 3); assert.equal(r.json.closure.matrix.length, 5);
assert.ok(r.json.closure.byDeploy.find((b) => b.key === 'geni').n >= 1); assert.ok(r.json.closure.withMockup >= 1, '목업 첨부 건은 제공으로');
r = await api('GET', '/api/stats', null, reqToken); assert.equal(r.status, 403);
r = await api('GET', '/api/stats/export.csv', null, brmToken); assert.equal(r.status, 200); assert.ok(String(r.json).includes('접수번호')); assert.ok(String(r.json).includes('배포위치'));
r = await api('GET', '/api/admin/users', null, reqToken); assert.equal(r.status, 403, '담당자 관리는 시스템 관리자만 (일반 사용자 403)'); // 045345 는 8476 팀 규칙으로 admin 이 될 수 있어 요청자 토큰으로 검사 (2026-09-09)
if (adminToken) {
  r = await api('POST', '/api/auth/sso', { token: adminToken }); assert.equal(r.status, 200); assert.equal(r.json.user.role, 'admin');
  r = await api('GET', '/api/admin/users', null, adminToken); assert.equal(r.status, 200); assert.ok(r.json.users.length >= 2);
  const me = r.json.users.find((u) => u.employeeNo === '045345'); assert.equal(me?.teamCd, '8476'); assert.ok(me?.deptNm && me?.teamNm, '부서명·팀명이 미러에서 붙어야 함');
}

console.log('\n✔ smoke OK — request', id);
