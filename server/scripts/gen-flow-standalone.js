/**
 * 상담 흐름도 standalone 내보내기 — 담당자에게 파일 하나로 전달해 검토받는 용도.
 *   node server/scripts/gen-flow-standalone.js   (또는 npm run flow:export)
 *   → 프로젝트 루트에 flow-standalone.html 생성 (더블클릭으로 열림 · 서버·인터넷 불필요)
 *
 * 원리: 실제 소스(shared/questions.js · shared/rules.js · src/flow-core.js)와 공용 CSS 를
 * 그대로 한 파일에 인라인한다 — 앱 내 /flow.html 과 항상 같은 내용이 나온다.
 * 폰트는 시스템 폰트(맑은 고딕 폴백)로 대체된다(웹폰트 파일을 넣으면 용량이 커지므로).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** ESM 소스를 인라인 스크립트용으로 변환: import 줄 제거, export 키워드 제거 */
function strip(src, name) {
  const out = src
    .replace(/^import\s[^\n]*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|async function|class)\s/gm, '$1 ');
  if (/^\s*(import|export)\s/m.test(out)) throw new Error(`${name}: import/export 가 남아 있어요 (여러 줄 import 는 한 줄로 합쳐주세요)`);
  return `/* ══════════ ${name} (인라인) ══════════ */\n${out}`;
}

const css = ['src/styles/tokens.css', 'src/styles/base.css', 'src/styles/components.css', 'src/styles/utilities.css']
  .map((p) => `/* ── ${p} ── */\n${read(p)}`)
  .join('\n');

const js = [
  strip(read('shared/questions.js'), 'shared/questions.js'),
  strip(read('shared/rules.js'), 'shared/rules.js'),
  strip(read('src/flow-core.js'), 'src/flow-core.js'),
].join('\n');

const now = new Date();
const stamp = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>AX-BRM 상담 흐름도 (검토용 · ${stamp})</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E%3Ccircle cx='14' cy='14' r='13' fill='%231C5D5F'/%3E%3Cpath d='M8.5 17.5c1.5-4 3-6.5 5.5-6.5s4 2.5 5.5 6.5' stroke='%23fff' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='14' cy='9.5' r='1.4' fill='%23fff'/%3E%3C/svg%3E" />
<style>
${css}
</style>
</head>
<body>
<div id="flow-app"></div>
<script>
'use strict';
${js}
mountFlow(document.getElementById('flow-app'), { generatedAt: '${stamp}' });
</script>
</body>
</html>
`;

const out = path.join(root, 'flow-standalone.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`[flow:export] ${out} (${(html.length / 1024).toFixed(0)} KB) — 이 파일 하나만 전달하면 됩니다.`);
