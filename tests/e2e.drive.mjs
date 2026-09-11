/**
 * 브라우저 E2E 드라이브 — 요청자 신청 → BRM 검토·목업 → 통계 → 요청자 확인 전 구간.
 *   사전: npm run dev (API 3000 + Vite 5173) 실행 중, Edge 설치(사내 PC 기본).
 *   실행: npm run test:e2e   (스크린샷은 tests/e2e-shots/)
 *   환경: E2E_BROWSER=<브라우저 실행 파일 경로> 로 Edge 이외 브라우저 지정 가능.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const EDGE = process.env.E2E_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
fs.mkdirSync('tests/e2e-shots', { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'ko-KR' });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/auth/sso')) errors.push(`[http ${r.status()}] ${r.url()}`); });

const shot = async (name) => { await page.screenshot({ path: `tests/e2e-shots/${name}.png`, fullPage: false }); console.log('📸', name); };
const step = (s) => console.log('•', s);

async function loginAs(name) {
  await ctx.clearCookies();
  await page.goto(BASE + '/popup.html');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(BASE + '/popup.html');
  await page.click(`button:has-text("${name}")`);
  await page.waitForSelector('.nav', { timeout: 20000 });
}

// ── 요청자 흐름
step('로그인: 이현업'); await loginAs('이현업');
await page.waitForSelector('text=AI, 잘 몰라도 괜찮아요');
await shot('01-landing');
await page.evaluate(() => window.scrollTo(0, 900)); await shot('01b-landing-presets');
await page.evaluate(() => window.scrollTo(0, 0));

step('상담 시작'); await page.click('button:has-text("상담 시작하기")');
await page.waitForSelector('.qcard');
await shot('02-interview-q1');

const single = async (label) => { await page.click(`.qcard .choice:has-text("${label}")`); await page.waitForTimeout(150); };
const text = async (v) => { await page.fill('.qcard input.input, .qcard textarea.textarea', v); await page.click('.qcard button:has-text("다음")'); await page.waitForTimeout(150); };

await text('영업점 실적 보고서를 매일 아침 자동으로 만들고 싶어요');
await text('매일 9시 A시스템 조회 → 엑셀 붙여넣기 → 지점별 정리 → 팀장 메일');
await text('매일 40분');
await single('우리 부서');
await single('매일 수시로');
await shot('03-interview-sectionB');
await single('화면이 있는 새 프로그램');
await single('네, 행내 데이터를 읽어야 해요');
await single('데이터의 모양');
await single('아니요');
await page.click('.qcard button:has-text("건너뛰기")'); await page.waitForTimeout(150);
await single('하루 한 번');
await single('10만 건 이하');
await single('계속');
await shot('04-interview-sidebar-judgement');
await single('따로 열어 쓰는 웹 화면');
await single('네');   // q24 자체 시스템 있음
await single('아니오'); // q25 IT 담당직원 없음
await single('네, 제가 담당');
await single('알고는 계세요');
await single('직원들이 늘 겪는 불편');
await single('네, 해보고 싶어요');
await text('40분 → 1분. 아침 회의 준비가 여유로워져요');
await single('올해 안에');
await page.click('.qcard button:has-text("건너뛰기")');
await page.waitForSelector('text=모든 질문에 답했어요', { timeout: 10000 });
await shot('05-interview-complete');

step('요약'); await page.click('button:has-text("정리된 요약 보기")');
await page.waitForSelector('text=이렇게 정리됐어요', { timeout: 15000 });
await shot('06-summary');
await page.evaluate(() => window.scrollTo(0, 700)); await shot('06b-summary-leadtime');

step('신청'); await page.click('button:has-text("AX-BRM에 신청하기")');
await page.waitForSelector('text=잘 신청됐어요', { timeout: 15000 });
await shot('07-done');
const reqNo = await page.textContent('.identifier');
console.log('접수번호', reqNo);

step('내 요청 / 상세'); await page.click('a:has-text("요청 상세 보기")');
await page.waitForSelector('text=AX-BRM 의견');
await shot('08-detail-requester');

// ── BRM 흐름
step('로그인: 김브름'); await loginAs('김브름');
await page.goto(BASE + '/brm'); await page.waitForSelector('table.table tbody tr', { timeout: 15000 });
await shot('09-inbox');
await page.click('table.table tbody tr >> nth=0');
await page.waitForSelector('text=검토 의견 등록', { timeout: 15000 });
await shot('10-review-top');

step('의견 등록 → 진행 확정');
await page.click('.seg[aria-label="결정"] .seg-item:has-text("진행 확정")');
await page.click('.seg[aria-label="실현 가능성"] .seg-item:has-text("조건부 가능")');
await page.fill('#approach', '합성 데이터로 행외 개발 → AI-HUB 배포, BDP 일배치 연계');
await page.fill('#opinion', '표준 경로로 진행 가능해요. 데이터 항목 목록만 먼저 정리해 주시면 데이터혁신부 협의를 바로 시작할게요.');
await page.fill('input[aria-label="최소 주"]', '10'); await page.fill('input[aria-label="최대 주"]', '14');
await page.click('button:has-text("의견 등록")');
await page.waitForSelector('text=의견을 등록했어요', { timeout: 10000 });
await page.waitForTimeout(500);
await shot('11-review-after-accept');

step('상태 → 개발 중 (모달)');
await page.click('button.rv-step:has-text("개발 중")');
await page.fill('input[aria-label="상태 변경 메모"]', '개발 착수');
await page.click('button:has-text("바꾸기")');
await page.waitForTimeout(800);

step('목업 업로드');
const mockHtml = '<!doctype html><html lang="ko"><body style="font-family:sans-serif;padding:24px"><h1>영업점 실적 보고서 · 컨셉 v1</h1><p>지점 필터 · 날짜 선택 · 표</p><script>document.body.style.background="#F4F8F7"</script></body></html>';
const input = await page.$('input[type=file][accept=".html,.htm"]');
await input.setInputFiles({ name: 'concept-v1.html', mimeType: 'text/html', buffer: Buffer.from(mockHtml) });
await page.fill('input[aria-label="첨부 메모"]', '1차 컨셉');
await page.click('button:has-text("올리기")');
await page.waitForSelector('text=목업을 올렸어요', { timeout: 10000 });
await page.waitForTimeout(500);
await page.click('button:has-text("미리보기")');
await page.waitForSelector('iframe.preview-frame', { timeout: 10000 });
await page.waitForTimeout(800);
await shot('12-mockup-preview');
await page.keyboard.press('Escape');

step('통계'); await page.goto(BASE + '/brm/stats');
await page.waitForSelector('text=월별 접수 추이', { timeout: 15000 });
await page.waitForTimeout(500);
await shot('13-stats');

step('관리'); await page.goto(BASE + '/brm/admin');
await page.waitForSelector('table.table tbody tr', { timeout: 15000 });
await shot('14-admin');

step('요청자 상세에서 목업·의견 확인'); await loginAs('이현업');
await page.goto(BASE + '/requests'); await page.waitForSelector('text=신청한 상담');
await shot('15-my-requests');
await page.click('a.req >> nth=0');
await page.waitForSelector('text=화면 컨셉(목업)');
await page.waitForTimeout(400);
await shot('16-detail-with-mockup');

await browser.close();
console.log('\n=== console/page/http errors:', errors.length);
for (const e of errors) console.log(e);
