// @ts-check
/**
 * 상담 흐름도 코어 — 앱 내 페이지(flow.html)와 담당자 전달용 standalone HTML 이 **같은 소스**를 쓴다.
 *  - 앱: src/flow-main.ts 가 import 해서 mountFlow() 호출
 *  - standalone: server/scripts/gen-flow-standalone.js 가 이 파일과 shared/*.js 원문을 한 HTML 로 인라인
 * 규칙: import 문은 한 줄로 유지할 것(standalone 생성기가 줄 단위로 제거한다). CSS/폰트 import 금지.
 *
 * 구성: ① 시나리오별 질문 흐름(흐름을 가르는 답 3개 기준으로 4개 단락) ② 시나리오 시뮬레이터
 */
import { QUESTIONS, SECTIONS, QUESTIONNAIRE_VERSION, visibleQuestions, nextQuestion, pruneAnswers } from '@shared/questions.js';
import { judge, TRACK_LABEL, DATACASE_LABEL, INTEGRATION_LABEL, leadtimeText, GOVERNANCE_NOTICES, EMBED_NOTICE, leadtimeCalcText } from '@shared/rules.js';

/** @typedef {(typeof QUESTIONS)[number]} Q */
/** @typedef {Record<string, string>} Ctx */

const D = /** @type {Record<string, {label:string,plain:string}>} */ (DATACASE_LABEL);
const I = /** @type {Record<string, {label:string,plain:string}>} */ (INTEGRATION_LABEL);
const SEC = Object.fromEntries(SECTIONS.map((s) => [s.key, s.title]));
const QNO = new Map(QUESTIONS.map((q, i) => [q.id, i + 1]));
const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function fillAnswer(/** @type {Q} */ q) {
  if (q.type === 'single') return q.options ? q.options[0].value : '';
  return q.optional ? '' : '(예시 답변)';
}

/** partial 로 지정한 답 + 나머지는 기본값으로 끝까지 채운 완성 시나리오 */
function complete(/** @type {Ctx} */ partial) {
  /** @type {Ctx} */
  const a = {};
  for (let i = 0; i < 60; i++) {
    const q = nextQuestion(a);
    if (!q) break;
    a[q.id] = partial[q.id] !== undefined ? partial[q.id] : fillAnswer(q);
  }
  return pruneAnswers(a);
}

/* ── ① 시나리오별 질문 흐름 ──────────────────────────────────────
 * 질문 노출을 가르는 답은 3개뿐이다: q7(원하는 결과) · q9(데이터 필요) · q13(실시간성).
 * 그 조합으로 서로 다른 질문 흐름 4가지가 나온다. */
function routeClass(/** @type {string} */ id, /** @type {string} */ v) {
  if (id === 'q7_kind') return v === 'geni' ? 'util' : 'dev';
  if (id === 'q9_data') return v === 'no' ? 'no' : 'yes';
  if (id === 'q13_online') return v === 'online' ? 'on' : 'off';
  return '';
}

const SCENARIOS = [
  { key: 's1', emoji: '👕', num: 1, title: '기성복 — 행내 AI 도구로 해결', cond: '원하는 결과 = 글 요약·초안·문서에서 답 찾기 (GENI)', tone: 'mint', route: /** @type {Ctx} */ ({ q7_kind: 'geni' }) },
  { key: 's2', emoji: '🧮', num: 2, title: '맞춤복 — 데이터가 필요 없는 프로그램', cond: '새 프로그램 + 행내 데이터 불필요 (계산기형)', tone: '', route: /** @type {Ctx} */ ({ q7_kind: 'dev', q9_data: 'no' }) },
  { key: 's3', emoji: '🏪', num: 3, title: '맞춤복 — 데이터 필요 · 실시간 조회', cond: '새 프로그램 + 데이터 필요 + 실시간성 필요', tone: '', route: /** @type {Ctx} */ ({ q7_kind: 'dev', q9_data: 'yes', q13_online: 'online' }) },
  { key: 's4', emoji: '🚰', num: 4, title: '맞춤복 — 데이터 필요 · 정기 갱신', cond: '새 프로그램 + 데이터 필요 + 정기 갱신이나 한 번만 받으면 충분', tone: 'blush', route: /** @type {Ctx} */ ({ q7_kind: 'dev', q9_data: 'yes', q13_online: 'batch' }) },
];

/** 분기 질문에서 "다른 답"을 고르면 어느 시나리오로 가는지 */
const ALT = /** @type {Record<string, Record<string, { to: string, label: string }>>} */ ({
  q7_kind: { geni: { to: 's1', label: '시나리오 1' }, rpa: { to: 's2', label: '시나리오 2~4' }, dev: { to: 's2', label: '시나리오 2~4' }, consult: { to: 's2', label: '시나리오 2~4' } },
  q9_data: { no: { to: 's2', label: '시나리오 2' }, yes: { to: 's3', label: '시나리오 3~4' }, unknown: { to: 's3', label: '시나리오 3~4' } },
  q13_online: { online: { to: 's3', label: '시나리오 3' }, batch: { to: 's4', label: '시나리오 4' }, once: { to: 's4', label: '시나리오 4' }, unknown: { to: 's4', label: '시나리오 4' } },
});

function renderScenarioQuestion(/** @type {Q} */ q, /** @type {number} */ localNo, /** @type {(typeof SCENARIOS)[number]} */ sc) {
  const isGate = q.id in ALT;
  /** @type {string} */
  let opts;
  if (q.type === 'single' && q.options) {
    opts = q.options.map((o) => {
      if (isGate) {
        const mine = sc.route[q.id] !== undefined && routeClass(q.id, o.value) === routeClass(q.id, sc.route[q.id]);
        if (mine) return `<li class="fopt fopt-sel">✓ ${esc(o.label)}</li>`;
        const alt = ALT[q.id][o.value];
        return `<li class="fopt fopt-alt"><a href="#sc-${alt.to}">${esc(o.label)} → ${alt.label}</a></li>`;
      }
      return `<li class="fopt${o.unknown ? ' fopt-unknown' : ''}">${esc(o.label)}</li>`;
    }).join('');
  } else {
    opts = `<li class="fopt fopt-text">${q.optional ? '주관식 (선택 — 건너뛰기 가능)' : '주관식'}</li>`;
  }
  return `<div class="fnode${isGate ? ' fnode-gate' : ''}">
    <div class="fask"><span class="fno num">${localNo}</span><span class="fno num fno-global">Q${QNO.get(q.id)}</span><span class="fsec">${esc(SEC[q.section] || '')}</span> <b>${esc(q.ask)}</b>${isGate ? '<span class="fgate">🔀 흐름 분기</span>' : ''}</div>
    <ul class="fopts">${opts}</ul>
  </div>`;
}

function renderScenarioJudgement(/** @type {Ctx} */ a) {
  const j = judge(a, QUESTIONNAIRE_VERSION);
  const t = TRACK_LABEL[j.track];
  /** @type {string[]} */
  const rows = [];
  const row = (/** @type {string} */ name, /** @type {string} */ plain, /** @type {string} */ internal) =>
    rows.push(`<div class="jrow"><span class="jname">${name}</span><span class="jplain">${esc(plain)}</span>${internal ? `<span class="jint">${esc(internal)}</span>` : ''}</div>`);
  row('도움 방식', t.plain, t.label);
  if (j.dataCase) row('데이터 준비', D[j.dataCase].plain, D[j.dataCase].label);
  if (j.integration) row('데이터 연결', I[j.integration].plain, I[j.integration].label);
  row('개발 예상 기간(요건 확정 후)', leadtimeText(j.leadtime), '');
  if (j.embed) row(EMBED_NOTICE.title, EMBED_NOTICE.plain, EMBED_NOTICE.badge);
  return `<div class="jgrid">${rows.join('')}</div>
    <p class="hint mt-sm">업무 요건이나 데이터 연계에 따라 기간이 달라질 수 있어요. 대표 예시 기준이며, 아래 시뮬레이터에서 세부 답을 직접 바꿔보세요.</p>
    <p class="notice" data-level="warn" style="margin-top:10px"><span class="notice-emoji">🛡️</span><span><b>꼭 확인하세요</b><br>${GOVERNANCE_NOTICES.map((n) => '– ' + n).join('<br>')}</span></p>`;
}

function renderScenario(/** @type {(typeof SCENARIOS)[number]} */ sc) {
  const answers = complete(sc.route);
  const vis = visibleQuestions(answers);
  const spine = vis.map((q, i) => renderScenarioQuestion(q, i + 1, sc)).join(`<div class="fdown" aria-hidden="true">↓</div>`);
  return `
  <section id="sc-${sc.key}" class="scen" data-tone="${sc.tone}">
    <header class="scen-head">
      <span class="scen-emoji" aria-hidden="true">${sc.emoji}</span>
      <div class="grow">
        <p class="eyebrow">시나리오 ${sc.num} / ${SCENARIOS.length} · ${vis.length}문항</p>
        <h2 class="scen-title">${esc(sc.title)}</h2>
        <p class="scen-cond">진입 조건 — ${esc(sc.cond)}</p>
      </div>
    </header>
    <div class="scen-grid">
      <div class="scen-flow">
        ${spine}
        <div class="fdown" aria-hidden="true">↓</div>
        <div class="fnode fend">🧭 <b>정리된 요약</b> — 자동 판정 확인 → <b>AX-BRM에 신청</b></div>
      </div>
      <aside class="scen-judge">
        <h3 class="card-title">이 시나리오의 판정 예시</h3>
        ${renderScenarioJudgement(answers)}
      </aside>
    </div>
  </section>`;
}

/* ── ② 시나리오 시뮬레이터 ───────────────────────────────────── */
/** @type {Ctx} */
let sim = {};

/** @type {{ name: string, partial: Ctx }[]} */
const SIM_PRESETS = [
  { name: '👕 기성복 · GENI 안내', partial: { q7_kind: 'geni' } },
  { name: '🧮 계산기형 (데이터 불필요)', partial: { q7_kind: 'dev', q9_data: 'no' } },
  { name: '🚰 표준 · BDP 정기 + 개인정보', partial: { q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'yes', q13_online: 'batch', q14_volume: 'large' } },
  { name: '🏪 실시간 · 마트 조회', partial: { q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'online', q14_volume: 'small' } },
  { name: '🔒 실데이터 심사 (실제 값 필요)', partial: { q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'real', q11_pii: 'yes', q13_online: 'once', q14_volume: 'small' } },
  { name: '🔍 전부 "잘 모르겠어요"', partial: { q7_kind: 'consult', q9_data: 'unknown', q10_realvalue: 'unknown', q11_pii: 'unknown', q13_online: 'unknown', q14_volume: 'unknown', q16_embed: 'unknown' } },
];

function simQuestionRow(/** @type {Q} */ q, /** @type {number} */ idx) {
  const v = sim[q.id];
  if (q.type === 'single' && q.options) {
    const opts = q.options.map((o) => `<option value="${o.value}"${v === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
    return `<div class="srow"><span class="sno num">${String(idx).padStart(2, '0')}</span><label class="sq">${esc(q.ask)}</label>
      <select class="select ssel" data-qid="${q.id}"><option value=""${v === undefined ? ' selected' : ''} disabled>— 선택 —</option>${opts}</select></div>`;
  }
  return `<div class="srow"><span class="sno num">${String(idx).padStart(2, '0')}</span><label class="sq">${esc(q.ask)}${q.optional ? ' <span class="text-muted">(선택)</span>' : ''}</label>
    <input class="input stxt" data-qid="${q.id}" value="${v === undefined ? '' : esc(v).replace(/"/g, '&quot;')}" placeholder="${q.optional ? '비워도 돼요' : '(예시 답변)'}" /></div>`;
}

function renderJudgement(/** @type {Ctx} */ a) {
  if (!a.q7_kind) return `<p class="hint">원하는 결과(도움 방식)까지 답하면 판정이 나타나요.</p>`;
  const j = judge(a, QUESTIONNAIRE_VERSION);
  const t = TRACK_LABEL[j.track];
  /** @type {string[]} */
  const rows = [];
  const row = (/** @type {string} */ name, /** @type {string} */ plain, /** @type {string} */ internal) =>
    rows.push(`<div class="jrow"><span class="jname">${name}</span><span class="jplain">${esc(plain)}</span><span class="jint">${esc(internal)}</span></div>`);
  row('도움 방식', t.plain, t.label);
  if (j.dataCase) row('데이터 준비', D[j.dataCase].plain, D[j.dataCase].label);
  if (j.integration) row('데이터 연결', I[j.integration].plain, I[j.integration].label);
  row('개발 예상 기간(요건 확정 후)', leadtimeText(j.leadtime), !j.leadtime ? '산정 불가' : j.leadtime.tbd ? `상담 후 결정 (BRM 참고 초안 ${j.leadtime.min}~${j.leadtime.max}주)` : j.leadtime.items.map((it) => `${it.label} ${it.min === it.max ? it.min + '주' : it.min + '~' + it.max + '주'}${it.parallel ? '(병행)' : ''}`).join(' · ') + (() => { const c = leadtimeCalcText(j.leadtime); return c ? ' — ' + c.formula : ''; })());
  if (j.embed) row(EMBED_NOTICE.title, EMBED_NOTICE.plain, EMBED_NOTICE.badge);
  const flags = j.flags.map((f) => `<li class="notice" data-level="${f.level}" style="margin-top:6px"><span class="notice-emoji">${f.level === 'warn' ? '⚠️' : f.level === 'check' ? '🔍' : '💡'}</span><span>${esc(f.text)}</span></li>`).join('');
  const st = j.stakeholders.map((s) => esc(s.name)).join(' · ');
  return `
    <div class="jgrid">${rows.join('')}</div>
    <p class="hint mt-sm">업무 요건이나 데이터 연계에 따라 기간이 달라질 수 있어요.</p>
    <p class="text-sm mt-md"><b>협의처</b> <span class="text-sub">${st}</span></p>
    <ul class="mt-sm" style="list-style:none">${flags}</ul>
    <p class="notice" data-level="warn" style="margin-top:10px"><span class="notice-emoji">🛡️</span><span><b>꼭 확인하세요</b><br>${GOVERNANCE_NOTICES.map((n) => '– ' + n).join('<br>')}</span></p>`;
}

function renderSim() {
  const host = document.getElementById('sim');
  if (!host) return;
  const vis = visibleQuestions(sim);
  const rows = vis.map((q, i) => simQuestionRow(q, i + 1)).join('');
  const done = nextQuestion(sim) === null;
  host.innerHTML = `
    <div class="row wrap mb-md" id="presets">
      ${SIM_PRESETS.map((p, i) => `<button class="chip" data-preset="${i}">${p.name}</button>`).join('')}
      <button class="chip" data-preset="reset">↺ 초기화</button>
    </div>
    <div class="sim-grid">
      <div class="card"><h3 class="card-title">이 시나리오의 질문 순서 <span class="badge" data-tone="neutral">${vis.length}문항${done ? ' · 완료' : ''}</span></h3><div class="stack-sm">${rows}</div></div>
      <div class="card sim-judge"><h3 class="card-title">판정 결론 ${done ? '<span class="badge" data-tone="success">✅ 시나리오 완성</span>' : '<span class="badge" data-tone="neutral">진행 중</span>'}</h3>${renderJudgement(sim)}</div>
    </div>`;

  host.querySelectorAll('.ssel').forEach((el) =>
    el.addEventListener('change', () => { const t = /** @type {HTMLSelectElement} */ (el); sim = pruneAnswers({ ...sim, [String(t.dataset.qid)]: t.value }); renderSim(); }));
  host.querySelectorAll('.stxt').forEach((el) =>
    el.addEventListener('change', () => { const t = /** @type {HTMLInputElement} */ (el); sim = pruneAnswers({ ...sim, [String(t.dataset.qid)]: t.value }); renderSim(); }));
  host.querySelectorAll('[data-preset]').forEach((el) =>
    el.addEventListener('click', () => {
      const k = String(/** @type {HTMLElement} */ (el).dataset.preset);
      sim = k === 'reset' ? {} : complete(SIM_PRESETS[Number(k)].partial);
      renderSim();
    }));
}

/* ── 페이지 조립 ─────────────────────────────────────────────── */
const FLOW_CSS = `
  .fwrap { max-width: 1760px; margin: 0 auto; padding: 32px 32px 120px; }
  .fnode { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 14px 18px; }
  .fnode-gate { border-color: var(--brand-300); }
  .fask { font-size: 14px; line-height: 1.5; }
  .fno { font-family: var(--font-mono); font-size: 11px; color: var(--accent); margin-right: 6px; }
  .fno-global { color: var(--text-muted); }
  .fsec { font-size: 11px; color: var(--text-muted); background: var(--surface-2); border-radius: var(--radius-full); padding: 1px 8px; margin-right: 4px; }
  .fgate { float: right; font-size: 11px; font-weight: 700; color: var(--brand-700); background: var(--brand-100); border-radius: var(--radius-full); padding: 2px 9px; }
  .fopts { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 8px; }
  .fopt { font-size: 12px; color: var(--text-sub); background: var(--surface-2); border-radius: var(--radius-full); padding: 2px 10px; }
  .fopt-unknown { border: 1px dashed var(--line-strong); background: var(--surface); }
  .fopt-text { background: var(--sand); }
  .fopt-sel { background: var(--brand-500); color: #fff; font-weight: 700; }
  .fopt-alt { background: var(--surface); border: 1px dashed var(--brand-300); padding: 0; }
  .fopt-alt a { display: inline-block; padding: 2px 10px; color: var(--accent); text-decoration: none; }
  .fopt-alt a:hover { background: var(--accent-soft); border-radius: var(--radius-full); }
  .fdown { color: var(--text-muted); font-size: 12px; padding: 3px 2px 3px 22px; }
  .fend { background: var(--mint); border-color: transparent; font-size: 14px; }

  /* 시나리오 단락 */
  .scen { border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); padding: 24px; margin-bottom: 28px; scroll-margin-top: 56px; }
  .scen[data-tone="mint"] { background: var(--mint); border-color: transparent; }
  .scen[data-tone="blush"] { background: var(--blush); border-color: transparent; }
  .scen[data-tone] .fnode { background: var(--surface); }
  .scen-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 18px; }
  .scen-emoji { font-size: 34px; line-height: 1.2; }
  .scen-title { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .scen-cond { font-size: 13px; color: var(--text-sub); margin-top: 4px; }
  .scen-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
  .scen-judge { background: var(--surface); border: 1px solid var(--brand-300); border-radius: var(--radius-md); padding: 18px 20px; }

  .ftoc { position: sticky; top: 0; z-index: 50; display: flex; flex-wrap: wrap; gap: 8px; margin: 0 -8px 20px; padding: 8px; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
  .ftoc a { padding: 7px 14px; border-radius: var(--radius-full); font-size: 13px; font-weight: 700; color: var(--text-sub); text-decoration: none; }
  .ftoc a:hover { background: var(--accent-soft); color: var(--accent); }
  #sim-sec { scroll-margin-top: 56px; }
  .scen:target { box-shadow: 0 0 0 3px var(--brand-100); border-color: var(--accent); }

  .sim-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (max-width: 980px) { .sim-grid { grid-template-columns: 1fr; } }
  .sim-judge { border-color: var(--brand-300); }
  .srow { display: grid; grid-template-columns: 26px minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--line); }
  .srow:first-child { border-top: 0; }
  .sno { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
  .sq { font-size: 13px; color: var(--text-sub); line-height: 1.4; }
  .ssel, .stxt { min-height: 38px; padding: 6px 10px; font-size: 13px; }
  .jgrid { display: flex; flex-direction: column; }
  .jrow { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 2px 12px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
  .jrow:first-child { border-top: 0; }
  .jname { color: var(--text-muted); font-size: 12.5px; font-weight: 700; }
  .jplain { font-weight: 600; }
  .jint { grid-column: 2; font-family: var(--font-mono); font-size: 11px; color: var(--brand-700); }

  /* ── 1600px 이상(1920×1080 등): 질문·판정을 나란히, 글자 상향 ── */
  @media (min-width: 1600px) {
    .fwrap { padding: 40px 48px 140px; }
    .fask { font-size: 16px; }
    .fopt { font-size: 13px; padding: 3px 12px; }
    .fopt-alt { padding: 0; }
    .fopt-alt a { padding: 3px 12px; }
    .fno { font-size: 12px; }
    .fsec { font-size: 12px; }
    .fdown { font-size: 13px; }
    .fend { font-size: 15px; }
    .scen { padding: 32px; }
    .scen-title { font-size: 23px; }
    .scen-cond { font-size: 14px; }
    .scen-grid { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 28px; }
    .scen-judge { position: sticky; top: 56px; }
    .sim-grid { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 24px; }
    .sim-judge { position: sticky; top: 56px; }
    .sq { font-size: 14px; }
    .ssel, .stxt { min-height: 42px; font-size: 14px; }
    .jrow { font-size: 14.5px; grid-template-columns: 104px minmax(0, 1fr); }
    .jname { font-size: 13px; }
    .jint { font-size: 12px; }
    .srow { grid-template-columns: 30px minmax(0, 1fr) minmax(0, 1fr); padding: 6px 0; }
    .hint { font-size: 13.5px; }
  }
`;

/**
 * @param {HTMLElement} root
 * @param {{ generatedAt?: string }} [opts]  standalone 생성 시각 표기용
 */
export function mountFlow(root, opts = {}) {
  const style = document.createElement('style');
  style.textContent = FLOW_CSS;
  document.head.appendChild(style);

  const gates = ['q7_kind', 'q9_data', 'q13_online'].map((id) => `Q${QNO.get(id)}`).join(' · ');
  const stamp = opts.generatedAt ? ` · 생성 ${opts.generatedAt}` : '';
  root.innerHTML = `
<div class="fwrap">
  <header class="mb-lg">
    <p class="eyebrow">AX-BRM · 상담 흐름도 <span class="num">v${QUESTIONNAIRE_VERSION}${stamp}</span></p>
    <h1 style="font-size:26px;margin-top:6px">시나리오별 질문 흐름과 판정 결론</h1>
    <p class="text-sub text-sm mt-sm">실제 질문 정의와 판정 규칙에서 <b>자동 생성</b>된 문서예요.
    흐름을 가르는 질문은 <b>${gates}</b> 세 개이고, 그 답의 조합으로 아래 <b>${SCENARIOS.length}가지 시나리오</b>가 나와요.
    🔀 분기 질문에서 <b>✓ 진한 칩</b>이 이 시나리오의 답이고, 점선 칩을 누르면 그 답의 시나리오로 이동해요.</p>
  </header>

  <nav class="ftoc" aria-label="목차">
    ${SCENARIOS.map((s) => `<a href="#sc-${s.key}">${s.emoji} 시나리오 ${s.num}</a>`).join('')}
    <a href="#sim-sec">🎛 시뮬레이터</a>
  </nav>

  ${SCENARIOS.map(renderScenario).join('')}

  <section id="sim-sec">
    <h2 class="card-title" style="font-size:18px">🎛 시나리오 시뮬레이터 — 답을 고르면 질문 순서와 결론이 바뀌어요</h2>
    <p class="hint mb-md">프리셋을 누르거나 왼쪽에서 답을 직접 골라보세요. 오른쪽에 그 시나리오의 자동 판정(요청자에게 보이는 말 + BRM 내부 용어)이 나타나요.</p>
    <div id="sim"></div>
  </section>
</div>`;
  renderSim();
}
