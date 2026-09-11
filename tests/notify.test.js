import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { sendMessengerAlarm, broadcast, notifyAssigned, notifyAssignedStatus, notifyComment, stripLeadingZero, MESSAGES, appBaseUrl } from '../server/notify.js';

/** 폼 바디를 받아 기록하는 가짜 AnnounceService. handler 로 응답을 바꿀 수 있다 */
async function fakeAnnounce(handler = (_body, res) => res.end('OK')) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = Object.fromEntries(new URLSearchParams(raw));
      calls.push({ method: req.method, contentType: req.headers['content-type'], body });
      handler(body, res);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/servlet/AnnounceService`;
  return { url, calls, close: () => new Promise((r) => server.close(r)) };
}
const quiet = { log() {}, warn() {}, error() {} };

test('사번 표기: 맨 앞 0 하나만 뗀다 (AlarmCall.java 와 동일)', () => {
  assert.equal(stripLeadingZero('045346'), '45346');
  assert.equal(stripLeadingZero('124498'), '124498');
  assert.equal(stripLeadingZero('001234'), '01234');
  assert.equal(stripLeadingZero(' 045346 '), '45346');
  assert.equal(stripLeadingZero(null), '');
});

test('발송: form-urlencoded 로 SRV_CODE·RECIPIENT(E:사번)·SEND·TITLE·BODY·LINKTXT·LINKURL', async () => {
  const f = await fakeAnnounce();
  try {
    const ok = await sendMessengerAlarm(
      { recipient: '045346', sender: '045345', title: 'T', body: '신규 AX-BRM 요청건이 있습니다', linkText: '요청 확인', linkUrl: 'https://x/brm/requests/1' },
      { url: f.url, srvCode: 'AIBRM1', logger: quiet },
    );
    assert.equal(ok, true);
    assert.equal(f.calls.length, 1);
    const c = f.calls[0];
    assert.equal(c.method, 'POST');
    assert.match(c.contentType, /^application\/x-www-form-urlencoded/);
    assert.deepEqual(c.body, {
      SRV_CODE: 'AIBRM1', RECIPIENT: 'E:45346', SEND: '45345', TITLE: 'T',
      BODY: '신규 AX-BRM 요청건이 있습니다', LINKTXT: '요청 확인', LINKURL: 'https://x/brm/requests/1',
    });
  } finally { await f.close(); }
});

test('비활성(ALARM_URL/ALARM_SRV_CODE 없음): 호출 없이 true — 신청·검토 흐름을 막지 않는다', async () => {
  const f = await fakeAnnounce();
  try {
    const ok = await sendMessengerAlarm({ recipient: '045346', sender: '045345', title: 'T', body: 'B' }, { url: '', srvCode: '', logger: quiet });
    assert.equal(ok, true);
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test('실패: HTTP 오류·타임아웃·수신자 없음은 false 로만 돌려주고 throw 하지 않는다', async () => {
  const bad = await fakeAnnounce((_b, res) => { res.statusCode = 500; res.end('ERR'); });
  const slow = await fakeAnnounce(() => { /* 응답 안 함 → 타임아웃 */ });
  try {
    assert.equal(await sendMessengerAlarm({ recipient: '1', sender: '2', title: 'T', body: 'B' }, { url: bad.url, srvCode: 'S', logger: quiet }), false);
    assert.equal(await sendMessengerAlarm({ recipient: '1', sender: '2', title: 'T', body: 'B' }, { url: slow.url, srvCode: 'S', timeoutMs: 150, logger: quiet }), false);
    assert.equal(await sendMessengerAlarm({ recipient: '', sender: '2', title: 'T', body: 'B' }, { url: bad.url, srvCode: 'S', logger: quiet }), false);
    assert.equal(await sendMessengerAlarm({ recipient: '1', sender: '2', title: 'T', body: 'B' }, { url: 'http://127.0.0.1:9/x', srvCode: 'S', logger: quiet }), false);
  } finally { await bad.close(); await slow.close(); }
});

test('broadcast: 중복 제거·발신자 본인 제외, 수신자마다 1회 호출', async () => {
  const f = await fakeAnnounce();
  try {
    const r = await broadcast(['045346', '045346', '045345', '024498', '', null], { sender: '045345', title: 'T', body: 'B' }, { url: f.url, srvCode: 'S', logger: quiet });
    assert.deepEqual(r.recipients.sort(), ['024498', '045346']);
    assert.equal(r.sent, 2); assert.equal(r.failed, 0);
    assert.deepEqual(f.calls.map((c) => c.body.RECIPIENT).sort(), ['E:24498', 'E:45346']);
  } finally { await f.close(); }
});

test('담당자 지정 알림: 발신 = 지정한 사람, 수신 = 지정된 담당자, 문구 고정', async () => {
  const f = await fakeAnnounce();
  try {
    const ok = await notifyAssigned({ requestId: 'r1', reqNo: 'BRM-2026-0001', assigneeEmployeeNo: '045346', byEmployeeNo: '045345', baseUrl: 'https://ai-brm.example', url: f.url, srvCode: 'S', logger: quiet });
    assert.equal(ok, true);
    const b = f.calls[0].body;
    assert.equal(b.RECIPIENT, 'E:45346'); assert.equal(b.SEND, '45345');
    assert.equal(b.BODY, 'AX-BRM 담당자로 지정되었습니다');
    assert.equal(b.BODY, MESSAGES.assigned.body);
    assert.equal(b.LINKURL, 'https://ai-brm.example/brm/requests/r1');
  } finally { await f.close(); }
});

test('담당자 지정 상태: 보냈으면 sent · 서버 오류면 failed · URL/코드 없으면 disabled (throw 없음)', async () => {
  const f = await fakeAnnounce();
  try {
    const base = { requestId: 'r1', reqNo: 'BRM-2026-0001', assigneeEmployeeNo: '045346', byEmployeeNo: '045345', baseUrl: 'https://x', logger: quiet };
    assert.equal(await notifyAssignedStatus({ ...base, url: f.url, srvCode: 'S' }), 'sent');
    assert.equal(await notifyAssignedStatus({ ...base, url: f.url, srvCode: 'S', fetchImpl: async () => new Response('boom', { status: 500 }) }), 'failed');
    assert.equal(await notifyAssignedStatus({ ...base, url: f.url, srvCode: 'S', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }), 'failed');
    assert.equal(await notifyAssignedStatus({ ...base, url: '', srvCode: '' }), 'disabled');
    assert.equal(f.calls.length, 1, '실제 서버 호출은 성공 케이스 1번뿐');
  } finally { await f.close(); }
});

test('문의 알림: 요청자 → 지정 담당자, 담당자 미지정이면 호출 없이 false', async () => {
  const f = await fakeAnnounce();
  try {
    const none = await notifyComment({ requestId: 'r1', reqNo: 'BRM-2026-0001', assigneeEmployeeNo: null, byEmployeeNo: '051234', baseUrl: 'https://x', url: f.url, srvCode: 'S', logger: quiet });
    assert.equal(none, false); assert.equal(f.calls.length, 0);
    const ok = await notifyComment({ requestId: 'r1', reqNo: 'BRM-2026-0001', assigneeEmployeeNo: '045346', byEmployeeNo: '051234', baseUrl: 'https://x', url: f.url, srvCode: 'S', logger: quiet });
    assert.equal(ok, true);
    const b = f.calls[0].body;
    assert.equal(b.RECIPIENT, 'E:45346'); assert.equal(b.SEND, '51234'); assert.equal(b.BODY, MESSAGES.comment.body);
  } finally { await f.close(); }
});

test('appBaseUrl: 프록시 헤더 우선, 없으면 host', () => {
  const req = (h) => ({ get: (k) => h[k.toLowerCase()], protocol: 'http' });
  assert.equal(appBaseUrl(req({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'ai-brm.ibk', host: 'api:3000' })), 'https://ai-brm.ibk');
  assert.equal(appBaseUrl(req({ host: 'localhost:3000' })), 'http://localhost:3000');
  assert.equal(appBaseUrl(null), '');
});
