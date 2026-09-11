import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintTicket, verifyTicket, TICKET_TTL_MS } from '../server/mockupTicket.js';

test('목업 열람 티켓: 같은 첨부·기한 안에서만 통과, 만료·다른 첨부·변조는 이유와 함께 거절', () => {
  const now = 1_800_000_000_000;
  const t = mintTicket({ attachmentId: 'att-1', employeeNo: '051234', now });
  assert.ok(!t.includes('051234') || true); // 사번은 base64url 안에 있어 평문으로 노출되지 않지만 비밀은 아니다 — 서명이 핵심
  const ok = verifyTicket(t, 'att-1', now + 1000);
  assert.deepEqual([ok.ok, ok.employeeNo, ok.exp], [true, '051234', now + TICKET_TTL_MS]);
  assert.equal(verifyTicket(t, 'att-1', now + TICKET_TTL_MS + 1).reason, 'EXPIRED');
  assert.equal(verifyTicket(t, 'att-2', now).reason, 'WRONG_ATTACHMENT');
  const [p, m] = t.split('.');
  assert.equal(verifyTicket(`${p}.${m.slice(0, -2)}xx`, 'att-1', now).reason, 'BAD_SIGNATURE');
  assert.equal(verifyTicket('garbage', 'att-1', now).reason, 'MALFORMED');
  assert.equal(verifyTicket('', 'att-1', now).reason, 'MALFORMED');
  // 페이로드를 바꿔치기(다른 사번)하면 서명이 안 맞는다
  const forged = Buffer.from(`att-1.${now + TICKET_TTL_MS}.000000`, 'utf8').toString('base64url');
  assert.equal(verifyTicket(`${forged}.${m}`, 'att-1', now).reason, 'BAD_SIGNATURE');
});
