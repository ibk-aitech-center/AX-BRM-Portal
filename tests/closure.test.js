import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSURE_DEPLOY, CLOSURE_FORM, CLOSURE_DEPLOY_ORDER, CLOSURE_FORM_ORDER, normalizeClosure, closureLabel } from '../shared/closure.js';

test('종결 분류: 1차 5개(배포 위치) · 2차 3개(완성 형태), 고정 순서', () => {
  assert.deepEqual(CLOSURE_DEPLOY_ORDER, ['vibelabs', 'aihub', 'geni', 'legacy', 'none']);
  assert.deepEqual(CLOSURE_FORM_ORDER, ['concept', 'poc', 'service']);
  for (const k of CLOSURE_DEPLOY_ORDER) assert.ok(CLOSURE_DEPLOY[k].label && CLOSURE_DEPLOY[k].desc);
  for (const k of CLOSURE_FORM_ORDER) assert.ok(CLOSURE_FORM[k].label && CLOSURE_FORM[k].desc);
});

test('normalizeClosure: 둘 다 정해진 키일 때만 통과, 아니면 null', () => {
  assert.deepEqual(normalizeClosure({ deploy: 'aihub', form: 'poc' }), { deploy: 'aihub', form: 'poc' });
  assert.equal(normalizeClosure({ deploy: 'aihub' }), null);
  assert.equal(normalizeClosure({ deploy: 'mars', form: 'poc' }), null);
  assert.equal(normalizeClosure({ deploy: 'aihub', form: 'toString' }), null, '프로토타입 키는 거부');
  assert.equal(normalizeClosure(null), null);
  assert.equal(normalizeClosure('aihub'), null);
});

test('closureLabel: 이력에 남는 한 줄 표기', () => {
  assert.equal(closureLabel({ deploy: 'vibelabs', form: 'service' }), '바이브 랩스 · 서비스 구축');
  assert.equal(closureLabel(null), '');
});
