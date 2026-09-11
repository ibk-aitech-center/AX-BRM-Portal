import { Router } from 'express';
import { db, parseJson } from '../db/index.js';
import { requireAuth, requireBrm } from '../auth.js';
import { STATUS } from '../../shared/statuses.js';
import { TRACK_LABEL, DATACASE_LABEL, INTEGRATION_LABEL, leadtimeText } from '../../shared/rules.js';
import { CHANNEL_LABEL, DECISION } from '../../shared/statuses.js';
import { CLOSURE_DEPLOY, CLOSURE_FORM, CLOSURE_DEPLOY_ORDER, CLOSURE_FORM_ORDER } from '../../shared/closure.js';

export const statsRouter = Router();
statsRouter.use(requireAuth, requireBrm);

/** 기간 파라미터 → [from, to) ISO. 기본: 최근 12개월 */
function range(q) {
  const to = q.to ? new Date(String(q.to)) : new Date();
  const from = q.from ? new Date(String(q.from)) : new Date(to.getFullYear() - 1, to.getMonth(), 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw Object.assign(new Error('날짜 형식이 올바르지 않아요'), { status: 400 });
  return { from: from.toISOString(), to: to.toISOString() };
}

const count = (arr, keyFn) => {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x) ?? '(미정)'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
};
// 걸린 일수는 **달력(KST) 기준 + 1** — 당일 처리 = 1일, 다음 날 = 2일. 시각 차이는 세지 않는다 (2026-09-11 결정: "오늘 신청·오늘 의견이면 1일")
const KST_OFFSET_MS = 9 * 3600 * 1000;
const kstDayIndex = (iso) => Math.floor((new Date(iso).getTime() + KST_OFFSET_MS) / 86400000);
const days = (a, b) => kstDayIndex(b) - kstDayIndex(a) + 1;
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
/** 의견 없이 끝난 건은 '첫 의견 대기'로 세지 않는다 */
const CLOSED_STATUSES = new Set(['done', 'guided', 'rejected']);

async function loadRows(q) {
  const { from, to } = range(q);
  const rows = await db.all(
    "SELECT * FROM requests WHERE status <> 'draft' AND submitted_at >= ? AND submitted_at < ? ORDER BY submitted_at ASC",
    [from, to],
  );
  const ids = rows.map((r) => r.id);
  let reviews = [], history = [], mockups = new Set();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    reviews = await db.all(`SELECT * FROM request_reviews WHERE request_id IN (${ph}) ORDER BY created_at ASC`, ids);
    history = await db.all(`SELECT * FROM status_history WHERE request_id IN (${ph}) ORDER BY changed_at ASC`, ids);
    // 컨셉 목업 제공 여부 — 목업 첨부가 하나라도 있으면 "제공"
    const m = await db.all(`SELECT DISTINCT request_id FROM attachments WHERE kind = 'mockup' AND request_id IN (${ph})`, ids);
    mockups = new Set(m.map((x) => x.request_id));
  }
  return { from, to, rows: rows.map((r) => ({ ...r, j: parseJson(r.judgement, {}) || {}, hasMockup: mockups.has(r.id) })), reviews, history };
}

/** 진행 상황 4분류 — 부서별·담당자별 막대가 같은 구분을 쓴다 */
const progress = (rs) => ({
  awaiting: rs.filter((r) => r.status === 'submitted').length,
  active: rs.filter((r) => ['reviewing', 'hold', 'accepted', 'developing'].includes(r.status)).length, // 보완 요청은 검토 단계의 하나 — 진행 중 (2026-09-11)
  closed: rs.filter((r) => ['done', 'guided'].includes(r.status)).length,
  stalled: rs.filter((r) => r.status === 'rejected').length,
});

statsRouter.get('/', async (req, res) => {
  const { from, to, rows, reviews, history } = await loadRows(req.query);
  const nowIso = new Date().toISOString();
  const firstReview = new Map();
  for (const r of reviews) if (!firstReview.has(r.request_id)) firstReview.set(r.request_id, r.created_at);
  const doneAt = new Map();
  for (const h of history) if (h.to_status === 'done' && !doneAt.has(h.request_id)) doneAt.set(h.request_id, h.changed_at);
  // 종결 시각(반려·완료·안내 종결로 처음 바뀐 때) — 의견 없이 끝난 건의 "첫 의견까지" 상한. 이력이 없으면 마지막 갱신 시각으로
  const closedAt = new Map();
  for (const h of history) if (CLOSED_STATUSES.has(h.to_status) && !closedAt.has(h.request_id)) closedAt.set(h.request_id, h.changed_at);
  /** 첫 의견까지의 끝점 — 의견이 있으면 그 시각, 없는데 종결됐으면 종결 시각, 아니면 오늘 */
  const firstReviewEnd = (r) => firstReview.get(r.id) ?? (CLOSED_STATUSES.has(r.status) ? (closedAt.get(r.id) ?? r.closed_at ?? r.updated_at) : nowIso);

  // 진행 중 = 상태 구성 패널의 '진행 중' 묶음과 같은 정의(신청 완료·검토 중·보완 요청·진행 확정·개발 중). 반려만 stalled 로 따로 —
  // 접수 = 진행 중 + 완료·종결 + 반려 가 항상 맞아떨어지게 (2026-09-08 정합성 점검 · 2026-09-11 보완 요청을 진행 중으로)
  const open = rows.filter((r) => ['submitted', 'reviewing', 'hold', 'accepted', 'developing'].includes(r.status)).length;
  const stalled = rows.filter((r) => r.status === 'rejected').length;
  const byMonth = count(rows, (r) => r.submitted_at.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
  res.json({
    range: { from, to },
    totals: {
      submitted: rows.length,
      open,
      done: rows.filter((r) => r.status === 'done').length,
      guided: rows.filter((r) => r.status === 'guided').length,
      awaiting: rows.filter((r) => r.status === 'submitted').length,
      stalled,
      // 첫 의견까지: **접수된 전 건**이 들어간다 (2026-09-11 결정). 의견이 달린 건은 신청→첫 의견, 의견 없이 종결된 건은 신청→종결일,
      //   아직 의견이 없는 진행 중 건은 신청→오늘 — 방치된 건이 평균을 끌어올려 매일 늘어나는 지표.
      avgFirstReviewDays: avg(rows.map((r) => days(r.submitted_at, firstReviewEnd(r)))),
      avgDoneDays: avg(rows.filter((r) => doneAt.has(r.id)).map((r) => days(r.submitted_at, doneAt.get(r.id)))),
    },
    byMonth,
    byStatus: count(rows, (r) => r.status).map((x) => ({ ...x, label: STATUS[x.key]?.label || x.key })),
    // 부서별: 건수에 진행 상황(대기·진행·완료종결·보류반려)을 함께 — 부서 관리자가 "우리 부서 건이 어디까지 왔나"를 읽도록
    byOrg: count(rows, (r) => r.requester_org_nm).map((x) => {
      const rs = rows.filter((r) => (r.requester_org_nm ?? '(미정)') === x.key);
      return { ...x, ...progress(rs) };
    }),
    // 담당자별: 지정된 건의 진행 상황 + 완료 건수·평균 완료 소요. 미지정 건은 맨 뒤 한 줄(key 'none')로 — 지정이 밀린 건이 얼마나 되는지 같이 본다
    byAssignee: (() => {
      const assigned = rows.filter((r) => r.assignee_employee_no);
      const groups = count(assigned, (r) => r.assignee_employee_no).map((x) => {
        const rs = assigned.filter((r) => r.assignee_employee_no === x.key);
        const latest = rs.reduce((a, r) => (!a || String(r.assigned_at || '') > String(a.assigned_at || '') ? r : a), null);
        const doneRs = rs.filter((r) => doneAt.has(r.id));
        return {
          ...x, name: latest?.assignee_name || x.key, position: latest?.assignee_position ?? null, ...progress(rs),
          done: rs.filter((r) => r.status === 'done').length,
          mockups: rs.filter((r) => r.hasMockup).length,
          avgDoneDays: avg(doneRs.map((r) => days(r.submitted_at, doneAt.get(r.id)))),
        };
      });
      const none = rows.filter((r) => !r.assignee_employee_no);
      // 미지정 건도 완료 수·소요일을 실제로 센다 — 담당자별 완료 합이 전체 완료 건수와 맞도록 (이전엔 0 고정이라 2건이 새고 있었다)
      if (none.length) groups.push({ key: 'none', n: none.length, name: '미지정', position: null, ...progress(none), done: none.filter((r) => r.status === 'done').length, mockups: none.filter((r) => r.hasMockup).length, avgDoneDays: avg(none.filter((r) => doneAt.has(r.id)).map((r) => days(r.submitted_at, doneAt.get(r.id)))) });
      return groups;
    })(),
    // 완료 건 종결 분류: 목업 제공 여부 · 배포 위치 · 완성 형태 · 둘의 교차표. 분류는 고정 순서(빈 칸도 0 으로) — 위치가 바뀌지 않게
    closure: (() => {
      const done = rows.filter((r) => r.status === 'done');
      const classified = done.filter((r) => r.closure_deploy && r.closure_form);
      const byDeploy = CLOSURE_DEPLOY_ORDER.map((k) => ({ key: k, label: CLOSURE_DEPLOY[k].label, n: classified.filter((r) => r.closure_deploy === k).length }));
      const byForm = CLOSURE_FORM_ORDER.map((k) => ({ key: k, label: CLOSURE_FORM[k].label, n: classified.filter((r) => r.closure_form === k).length }));
      const matrix = CLOSURE_DEPLOY_ORDER.map((d) => CLOSURE_FORM_ORDER.map((f) => classified.filter((r) => r.closure_deploy === d && r.closure_form === f).length));
      return {
        done: done.length,
        classified: classified.length,
        withMockup: done.filter((r) => r.hasMockup).length,
        withoutMockup: done.filter((r) => !r.hasMockup).length,
        byDeploy, byForm, matrix,
      };
    })(),
    byChannel: count(rows, (r) => r.channel).map((x) => ({ ...x, label: CHANNEL_LABEL[x.key] || x.key })),
    byTrack: count(rows, (r) => r.j.track).map((x) => ({ ...x, label: TRACK_LABEL[x.key]?.label || x.key })),
    // 데이터 케이스는 건수순이 아니라 A → B → C 고정 순서 (케이스 자체가 순서를 가진 분류라 위치가 바뀌면 읽기 어렵다).
    // 판정이 없는 건(AI 활용 갈래처럼 데이터 질문을 건너뛴 요청)도 'none' 으로 세어 네 분포의 합이 접수 건수와 같게 한다 (2026-09-11) — 맨 뒤.
    byDataCase: count(rows, (r) => r.j.dataCase || 'none')
      .sort((x, y) => Number(x.key === 'none') - Number(y.key === 'none') || String(x.key).localeCompare(String(y.key)))
      .map((x) => ({ ...x, label: x.key === 'none' ? '데이터 판정 없음' : DATACASE_LABEL[x.key]?.label || x.key })),
    byIntegration: count(rows, (r) => r.j.integration || 'unset')
      .sort((x, y) => Number(x.key === 'unset') - Number(y.key === 'unset') || y.n - x.n)
      .map((x) => ({ ...x, label: x.key === 'unset' ? '연계 판정 없음' : INTEGRATION_LABEL[x.key]?.label || x.key })),
  });
});

statsRouter.get('/export.csv', async (req, res) => {
  const { rows, reviews } = await loadRows(req.query);
  const last = new Map();
  for (const r of reviews) last.set(r.request_id, r);
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['접수번호', '제목', '상태', '요청계기', '요청자', '요청자사번', '요청부서', '요청부서코드', '신청일시', '지원유형', '데이터케이스', '연계방식', '개인정보', '개발예상기간(요건확정후·참고초안)', '최종결정', '실현가능성', 'BRM예상기간(주)', 'AX-BRM담당자', '담당자사번', '목업제공', '배포위치', '완성형태', '완료일시'];
  const lines = [head.join(',')];
  for (const r of rows) {
    const j = r.j; const rv = last.get(r.id);
    lines.push([
      r.req_no, r.title, STATUS[r.status]?.label || r.status, CHANNEL_LABEL[r.channel] || r.channel, r.requester_name ? `${r.requester_name}${r.requester_position ? ' ' + r.requester_position : ''}` : '', r.requester_employee_no,
      r.requester_org_nm, r.requester_org_cd, r.submitted_at, TRACK_LABEL[j.track]?.label || '', j.dataCase ? DATACASE_LABEL[j.dataCase]?.label : '',
      j.integration ? INTEGRATION_LABEL[j.integration]?.label : '', j.pii || '',
      leadtimeText(j.leadtime), rv ? DECISION[rv.decision]?.label : '', rv?.feasible || '',
      rv && (rv.estimated_weeks_min || rv.estimated_weeks_max) ? `${rv.estimated_weeks_min ?? ''}~${rv.estimated_weeks_max ?? ''}` : '',
      r.assignee_name ? `${r.assignee_name}${r.assignee_position ? ' ' + r.assignee_position : ''}` : '', r.assignee_employee_no || '',
      r.hasMockup ? 'Y' : 'N', r.closure_deploy ? CLOSURE_DEPLOY[r.closure_deploy]?.label || r.closure_deploy : '',
      r.closure_form ? CLOSURE_FORM[r.closure_form]?.label || r.closure_form : '', r.closed_at || '',
    ].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ai-brm-requests-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});
