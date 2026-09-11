import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadtimeText, leadtimeLabel, leadtimeCalcText, judge } from '../shared/rules.js';
import { QUESTIONS, nextQuestion, visibleQuestions, pruneAnswers, isAnswered, formatAnswer, QUESTIONNAIRE_VERSION } from '../shared/questions.js';

const V = QUESTIONNAIRE_VERSION;

const base = {
  q1_title: '테스트', q2_channel: 'ch1', q3_current: '수작업', q4_time: '30분', q5_users: 'dept', q6_freq: 'daily',
  q18_owner: 'me', q19_manager: 'yes', q21_goal: '빨라짐', q22_when: 'year', q23_refs: '',
};

test('로드맵 01 — AI 활용 갈래(GENI)는 데이터·배포 질문을 건너뛴다', () => {
  const a = { ...base, q7_kind: 'geni', q8_tried: 'no' };
  const ids = visibleQuestions(a).map((q) => q.id);
  assert.ok(!ids.includes('q9_data'));
  assert.ok(!ids.includes('q16_embed'));
  assert.ok(!ids.includes('q20_participate'));
  const j = judge(a, V);
  assert.equal(j.track, 'geni');
  assert.equal(j.dataCase, null);
  assert.deepEqual([j.leadtime.min, j.leadtime.max], [1, 2]);
});

test('로드맵 02 — 데이터 불필요 → 연계 없음, 요건 확정 후 2~4주', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'no', q16_embed: 'standalone', q20_participate: 'can' };
  const j = judge(a, V);
  assert.equal(j.dataCase, 'A');
  assert.equal(j.integration, 'none');
  // 연계 없음(경량 트랙): 개발 1~2 + 오픈 1~2 = 2~4 — 요건 구체화 1주는 prep 으로 빠진다. 데이터 연계 건(6~9)보다 훨씬 짧다
  assert.deepEqual([j.leadtime.min, j.leadtime.max], [2, 4]);
  assert.deepEqual([j.leadtime.prep.min, j.leadtime.prep.max], [1, 1]);
  assert.ok(!j.leadtime.items.some((i) => i.label.includes('요건')), '요건 구체화는 합산 항목에 없다');
  assert.ok(!j.stakeholders.some((s) => s.key === 'data'));
});

test('로드맵 02 — 모양만 같으면 됨(표준), 07 — 배치·소량 → 파일 수령 2~3주', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'batch', q14_volume: 'small', q16_embed: 'standalone', q20_participate: 'can' };
  const j = judge(a, V);
  assert.equal(j.dataCase, 'B');
  assert.equal(j.integration, 'file');
  assert.ok(j.stakeholders.some((s) => s.key === 'data'));
  assert.ok(!j.stakeholders.some((s) => s.key === 'privacy'));
  // 파일 2~3주는 개발 4~6주와 병행 → 개발 4~6 + 오픈 2~3 = 6~9 (요건 협의 2~3주는 prep 으로 별도)
  assert.deepEqual([j.leadtime.min, j.leadtime.max], [6, 9]);
  assert.deepEqual([j.leadtime.prep.min, j.leadtime.prep.max], [2, 3]);
});

test('로드맵 07 — 배치·대량·정기 → BDP 4~6주, 개인정보 +2~4주 → 표준 14주 시나리오 근사', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'yes', q13_online: 'batch', q14_volume: 'large', q16_embed: 'standalone', q20_participate: 'can' };
  const j = judge(a, V);
  assert.equal(j.integration, 'bdp');
  assert.equal(j.pii, 'yes');
  assert.ok(j.stakeholders.some((s) => s.key === 'privacy'));
  // 병행 6~10 vs 개발 4~6 → +2~4 → 개발 구간 8~13 (표준 14주 시나리오에서 요건 협의 2~3주를 뺀 11~12주 포함)
  assert.deepEqual([j.leadtime.min, j.leadtime.max], [8, 13]);
  assert.ok(j.leadtime.min <= 11 && 12 <= j.leadtime.max);
});

test('로드맵 07 — 배치·대량·1회 → 1회 일괄 적재', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'once', q14_volume: 'large', q16_embed: 'standalone', q20_participate: 'can' };
  assert.equal(judge(a, V).integration, 'bulk');
});

test('로드맵 07 — 온라인 → 마트 조회 우선 + API 경고, 갱신 주기는 질문 하나(q13_online)로 통합', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'online', q14_volume: 'small', q16_embed: 'standalone', q20_participate: 'can' };
  assert.ok(!visibleQuestions(a).some((q) => q.id === 'q15_recurring'));
  assert.deepEqual(visibleQuestions(a).find((q) => q.id === 'q13_online').options.map((o) => o.value), ['online', 'batch', 'once', 'unknown']);
  const j = judge(a, V);
  assert.equal(j.integration, 'mart');
  assert.ok(j.flags.some((f) => f.text.includes('8주+') && f.text.includes('마트')));
});

test('로드맵 02 — 실제 값 필요: +3~5주 순차 가산, 경고 플래그', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'real', q11_pii: 'no', q13_online: 'once', q14_volume: 'small', q16_embed: 'standalone', q20_participate: 'can' };
  const j = judge(a, V);
  assert.equal(j.dataCase, 'C');
  assert.deepEqual([j.leadtime.min, j.leadtime.max], [9, 14]); // 개발 4~6 + 반출 검토 3~5 + 오픈 2~3
  assert.ok(j.flags.some((f) => f.level === 'warn' && f.text.includes('3~5주')));
});

test('배포는 판정하지 않는다 — 기존 시스템 결합 답변은 embed 표시(협의 필수 카드)로만, 기간은 표준 기준 산출', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'no', q16_embed: 'embed', q20_participate: 'can' };
  const j = judge(a, V);
  assert.ok(!('deploy' in j));
  assert.ok(j.leadtime !== null);
  assert.equal(j.embed, true);
  assert.ok(!j.flags.some((f) => f.text.includes('기존 행내 시스템')));
  assert.ok(j.stakeholders.some((s2) => s2.key === 'hub'));
  assert.equal(judge({ ...a, q16_embed: 'standalone' }, V).embed, false);
  assert.equal(judge({ ...a, q16_embed: 'unknown' }, V).embed, false);
});

test('"잘 모르겠어요"는 표준 경로로 가정 + check 플래그 + unknowns 기록', () => {
  const a = { ...base, q7_kind: 'dev', q9_data: 'unknown', q10_realvalue: 'unknown', q11_pii: 'unknown', q13_online: 'unknown', q14_volume: 'unknown', q16_embed: 'unknown', q20_participate: 'learn' };
  const j = judge(a, V);
  assert.equal(j.dataCase, 'B');
  assert.equal(j.integration, 'tbd');
  assert.ok(j.flags.filter((f) => f.level === 'check').length >= 4);
  assert.ok(j.unknowns.includes('q9_data'));
  // 데이터가 필요한지부터 모르고 그 뒤도 전부 모르면 기간은 "협의 후" — 숫자는 BRM 참고용으로만 남는다
  assert.equal(j.leadtime.tbd, true);
  assert.equal(leadtimeText(j.leadtime), 'AX-BRM과 협의 후 정해요');
  // 상담 필요(q7 모름)도 같다. 데이터 답이 하나라도 있으면(필요 없음 등) 숫자를 보여 준다
  assert.equal(judge({ ...base, q7_kind: 'consult', q9_data: 'no', q16_embed: 'standalone', q20_participate: 'can' }, V).leadtime.tbd, true);
  assert.equal(judge({ ...base, q7_kind: 'dev', q9_data: 'no', q16_embed: 'standalone', q20_participate: 'can' }, V).leadtime.tbd, undefined);
  assert.equal(judge({ ...base, q7_kind: 'dev', q9_data: 'unknown', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'batch', q14_volume: 'small', q16_embed: 'standalone', q20_participate: 'can' }, V).leadtime.tbd, undefined);
});

test('참여도가 낮으면 개발 기간이 늘어난다', () => {
  const mk = (p) => judge({ ...base, q7_kind: 'dev', q9_data: 'no', q16_embed: 'standalone', q20_participate: p }, V).leadtime;
  assert.ok(mk('no').min > mk('yes').min && mk('no').max > mk('yes').max);
});


test('nextQuestion — 순서대로 미답 질문을 반환하고 optional 은 빈 문자열로 건너뛸 수 있다', () => {
  assert.equal(nextQuestion({}).id, 'q1_title');
  // C 구간 순서: 필요 여부 → 갱신 주기 → 양 → 외부 개발 시 실제 값 → 개인정보 → 출처(optional)
  const a = { ...base, q7_kind: 'dev', q9_data: 'yes' };
  assert.equal(nextQuestion(a).id, 'q13_online');
  a.q13_online = 'batch';
  assert.equal(nextQuestion(a).id, 'q14_volume');
  a.q14_volume = 'small'; a.q10_realvalue = 'shape'; a.q11_pii = 'no';
  assert.equal(nextQuestion(a).id, 'q12_source');
  a.q12_source = '';
  assert.equal(nextQuestion(a).id, 'q16_embed');
});

test('pruneAnswers — 갈래 변경 시 숨겨진 질문의 답을 제거', () => {
  const a = { ...base, q7_kind: 'geni', q9_data: 'yes', q13_online: 'online' };
  const p = pruneAnswers(a);
  assert.ok(!('q9_data' in p) && !('q13_online' in p));
});

test('질문 id 는 중복이 없고 single 형은 options 를 가진다', () => {
  const ids = new Set();
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), q.id); ids.add(q.id);
    if (q.type === 'single') assert.ok(q.options && q.options.length >= 2, q.id);
  }
});

test('q13_online=once — 소량이면 파일, 대용량이면 일괄 적재(bulk); 구 답변(q15_recurring=once)도 같은 결과', () => {
  const small = judge({ ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'once', q14_volume: 'small', q16_embed: 'standalone', q20_participate: 'can' }, V);
  assert.equal(small.integration, 'file');
  const large = judge({ ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'once', q14_volume: 'large', q16_embed: 'standalone', q20_participate: 'can' }, V);
  assert.equal(large.integration, 'bulk');
  const legacy = judge({ ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'batch', q14_volume: 'large', q15_recurring: 'once', q16_embed: 'standalone', q20_participate: 'can' }, V);
  assert.equal(legacy.integration, 'bulk');
});

test('예상 기간 문구: 개발 갈래는 "요건 확정 후", Geni 갈래는 안내·코칭 — 둘 다 참고용·달라질 수 있음이 읽힌다', () => {
  const dev = leadtimeLabel(judge({ ...base, q7_kind: 'dev', q9_data: 'no', q16_embed: 'standalone', q20_participate: 'can' }, V));
  assert.equal(dev.title, '요건 확정 후 개발 예상 기간');
  assert.ok(dev.sub.includes('참고') && dev.sub.includes('달라질 수 있어요'));
  assert.ok(dev.note.includes('포함하지 않았어요'));
  const geni = leadtimeLabel(judge({ ...base, q7_kind: 'geni', q8_tried: 'no' }, V));
  assert.equal(geni.title, '안내·코칭 예상 기간');
  assert.ok(geni.sub.includes('참고'));
  assert.equal(leadtimeLabel(null).title, '요건 확정 후 개발 예상 기간');
});

test('합산 근거(calc): 병행 묶음은 심의 → 연결 순서로 이어서, 만들기보다 긴 만큼만 더한다 — 설명 문장이 숫자와 일치', () => {
  // 실제 값 필요 + BDP + 개인정보 (참여 가능): 순차 3~5 + 4~6 + 2~3 = 9~14 · 병행 2~4 + 4~6 = 6~10 · 만들기 4~6 → 넘침 2~4 → 11~18
  const j = judge({ ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'real', q11_pii: 'yes', q13_online: 'batch', q14_volume: 'large', q16_embed: 'standalone', q20_participate: 'can' }, V);
  assert.deepEqual([j.leadtime.min, j.leadtime.max], [11, 18]);
  const c = j.leadtime.calc;
  assert.deepEqual([c.serial.min, c.serial.max, c.parallel.min, c.parallel.max, c.dev.min, c.dev.max, c.extra.min, c.extra.max], [9, 14, 6, 10, 4, 6, 2, 4]);
  const par = j.leadtime.items.filter((i) => i.parallel).map((i) => i.label);
  assert.ok(par[0].startsWith('개인정보') && par[1].startsWith('데이터 연결'), '심의가 연결보다 먼저');
  const txt = leadtimeCalcText(j.leadtime);
  assert.equal(txt.formula, '차례로 진행 9~14주 + 동시 진행에서 넘치는 2~4주 = 약 11~18주');
  assert.ok(txt.note.includes('만들기(4~6주)') && txt.note.includes('6~10주') && txt.note.includes('2~4주'));
  // 병행 묶음이 만들기 안에 들어가는 경우(파일 수령 · 개인정보 없음): 넘침 0 → 더하지 않았다는 설명
  const j2 = judge({ ...base, q7_kind: 'dev', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'no', q13_online: 'batch', q14_volume: 'small', q16_embed: 'standalone', q20_participate: 'can' }, V);
  const t2 = leadtimeCalcText(j2.leadtime);
  assert.equal(t2.formula, '차례로 진행 6~9주 = 약 6~9주');
  assert.ok(t2.note.includes('따로 더하지 않았어요'));
  // 병행 항목이 없는 경우(데이터 없음 · Geni)는 설명이 없다
  assert.equal(leadtimeCalcText(judge({ ...base, q7_kind: 'dev', q9_data: 'no', q16_embed: 'standalone', q20_participate: 'can' }, V).leadtime), null);
  assert.equal(leadtimeCalcText(judge({ ...base, q7_kind: 'geni', q8_tried: 'no' }, V).leadtime), null);
});

test('함께 협의할 부서: AI 거버넌스(AX디지털전략부)는 모든 시나리오에 들어간다 — Geni 활용·데이터 없음·데이터 있음·상담 필요', () => {
  const cases = [
    { ...base, q7_kind: 'geni', q8_tried: 'no' },
    { ...base, q7_kind: 'dev', q9_data: 'no', q16_embed: 'standalone', q20_participate: 'can' },
    { ...base, q7_kind: 'rpa', q9_data: 'yes', q10_realvalue: 'shape', q11_pii: 'yes', q13_online: 'batch', q14_volume: 'large', q16_embed: 'standalone', q20_participate: 'can' },
    { ...base, q7_kind: 'consult', q9_data: 'unknown', q16_embed: 'unknown', q20_participate: 'learn' },
  ];
  for (const a of cases) {
    const g = judge(a, V).stakeholders.find((s) => s.key === 'governance');
    assert.ok(g, JSON.stringify(a.q7_kind));
    assert.equal(g.name, 'AI 거버넌스(AX디지털전략부)');
    assert.equal(g.when, 'AI·LLM 등 기능이 포함된 기능 개발 시');
    assert.equal(g.topics, 'AI 위험등급 평가 등 협의 진행');
  }
  // 순서: 현업 → AX-BRM → AI 거버넌스 → (데이터 …)
  const keys = judge(cases[2], V).stakeholders.map((s) => s.key);
  assert.deepEqual(keys.slice(0, 3), ['dept', 'hub', 'governance']);
});

test('데이터 케이스 표기: 화면 라벨·용어집 어디에도 "Case A/B/C" 접두가 없다 (2026-09-08 제거)', async () => {
  const { DATACASE_LABEL } = await import('../shared/rules.js');
  const { GLOSSARY } = await import('../shared/glossary.js').catch(() => ({ GLOSSARY: null }));
  for (const v of Object.values(DATACASE_LABEL)) for (const s of [v.label, v.plain, v.analogy, v.desc]) assert.ok(!/Cases*[ABC]|합성s*데이터/.test(s), s);
  if (GLOSSARY) for (const g of Object.values(GLOSSARY)) for (const s of Object.values(g)) assert.ok(!/Cases*[ABC]|합성s*데이터/.test(String(s)), String(s));
});

// ── q20 질문 교체(2026-09-11) — 옛 값(yes/no) 호환 ─────────────────────
test('q20 옛 값: yes 는 can 과 같은 기간, no 는 learn 과 같은 기간이고 옛 협의 문구를 남긴다', () => {
  const base20 = { q1_title: 't', q2_channel: 'ch1', q7_kind: 'dev', q9_data: 'no', q16_embed: 'standalone' };
  const can = judge({ ...base20, q20_participate: 'can' }, V), yes = judge({ ...base20, q20_participate: 'yes' }, V);
  assert.deepEqual([yes.leadtime.min, yes.leadtime.max], [can.leadtime.min, can.leadtime.max]);
  const learn = judge({ ...base20, q20_participate: 'learn' }, V), no = judge({ ...base20, q20_participate: 'no' }, V);
  assert.deepEqual([no.leadtime.min, no.leadtime.max], [learn.leadtime.min, learn.leadtime.max]);
  assert.ok(learn.prep.some((p) => /안내 세션/.test(p)));
  assert.ok(no.prep.some((p) => /참여 시간/.test(p)));
});

test('q20 옛 값은 "아직 안 답한 것" — 초안을 이어 쓰면 새 보기로 다시 묻는다', () => {
  const q20 = QUESTIONS.find((q) => q.id === 'q20_participate');
  assert.equal(isAnswered(q20, 'yes'), false);
  assert.equal(isAnswered(q20, 'can'), true);
  assert.equal(formatAnswer(q20, 'yes'), '네, 해보고 싶어요 (이전 질문: 참여할 수 있나요)'); // 신청된 건은 당시 라벨로
});
