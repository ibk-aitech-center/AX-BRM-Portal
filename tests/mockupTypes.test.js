import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockupTypeOf, MOCKUP_EXTS, MOCKUP_ACCEPT } from '../shared/mockupTypes.js';

test('목업 허용 파일 — 브라우저가 바로 여는 HTML·이미지·PDF 만, 대소문자 무관', () => {
  assert.equal(mockupTypeOf('a.html').label, 'HTML');
  assert.equal(mockupTypeOf('a.HTM').label, 'HTML');
  assert.equal(mockupTypeOf('shot.PNG').mime, 'image/png');
  assert.equal(mockupTypeOf('shot.jpeg').mime, 'image/jpeg');
  assert.equal(mockupTypeOf('flow.svg').mime, 'image/svg+xml');
  assert.equal(mockupTypeOf('spec.pdf').mime, 'application/pdf');
});

test('목업 불가 — 동영상·오피스·zip·확장자 없음 (2026-09-11 결정: 동영상 제외)', () => {
  for (const f of ['demo.mp4', 'demo.webm', 'deck.pptx', 'doc.docx', 'x.zip', 'noext', '', 'a.html.exe']) assert.equal(mockupTypeOf(f), null, f);
});

test('accept 속성은 허용 확장자 목록과 같다', () => {
  assert.equal(MOCKUP_ACCEPT, MOCKUP_EXTS.join(','));
  assert.ok(MOCKUP_EXTS.includes('.pdf') && !MOCKUP_EXTS.includes('.mp4'));
});
