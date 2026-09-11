import { Router } from 'express';
import crypto from 'node:crypto';
import { db, nowIso, parseJson, nextReqNo } from '../db/index.js';
import { requireAuth, requireBrm, requireRequester, isBrm, isDataBrm, canReadRequest, HttpError } from '../auth.js';
import { DATA_REQUEST_SQL, isDataAnswers } from '../dataBrm.js';
import { QUESTIONNAIRE_VERSION, nextQuestion, pruneAnswers } from '../../shared/questions.js';
import { judge } from '../../shared/rules.js';
import { STATUS, DECISION, MANUAL_TRANSITIONS } from '../../shared/statuses.js';
import { normalizeClosure, closureLabel } from '../../shared/closure.js';
import { listAssigneeCandidates, findAssigneeCandidate } from '../hrSync.js';
import { removeFile } from '../storage.js';
import { notifyNewRequest, notifyAssignedStatus, notifyComment, appBaseUrl, fireAndForget } from '../notify.js';

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

const uuid = () => crypto.randomUUID();

/** DB row → API 객체 */
export function toRequest(row, { full = false } = {}) {
  if (!row) return null;
  const answers = parseJson(row.answers, {});
  const judgement = parseJson(row.judgement, null);
  const out = {
    id: row.id, reqNo: row.req_no, title: row.title, status: row.status, channel: row.channel,
    requester: { employeeNo: row.requester_employee_no, name: row.requester_name, orgCd: row.requester_org_cd, orgNm: row.requester_org_nm, position: row.requester_position ?? null },
    // 실제 진행할 AX-BRM 담당자 — 요청자에게도 보인다. null 이면 "담당자 미지정"
    assignee: row.assignee_employee_no ? { employeeNo: row.assignee_employee_no, name: row.assignee_name, position: row.assignee_position ?? null } : null,
    assignedAt: row.assigned_at ?? null,
    // 완료 처리 때 고른 종결 분류 (배포 위치 · 완성 형태). 완료 전이거나 옛 데이터면 null
    closure: row.closure_deploy && row.closure_form ? { deploy: row.closure_deploy, form: row.closure_form } : null,
    closedAt: row.closed_at ?? null,
    questionnaireVersion: row.questionnaire_version,
    submittedAt: row.submitted_at, createdAt: row.created_at, updatedAt: row.updated_at,
    judgement: judgement ? {
      track: judgement.track, dataCase: judgement.dataCase, integration: judgement.integration, deploy: judgement.deploy,
      pii: judgement.pii, leadtime: judgement.leadtime, ...(full ? judgement : {}),
    } : null,
  };
  if (full) out.answers = answers;
  return out;
}

/** @param {string} id */
async function loadOwned(id, user) {
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, '요청을 찾을 수 없어요', 'NOT_FOUND');
  const own = row.requester_employee_no === user.employeeNo;
  if (!canReadRequest(user, row)) throw new HttpError(403, '내 요청만 볼 수 있어요', 'FORBIDDEN');
  return { row, own };
}

async function addHistory(conn, requestId, from, to, user, note) {
  await conn.run(
    'INSERT INTO status_history(id, request_id, from_status, to_status, changed_by, changed_by_name, note, changed_at) VALUES (?,?,?,?,?,?,?,?)',
    [uuid(), requestId, from, to, user.employeeNo, user.name, note || null, nowIso()],
  );
}

// ── 목록 ────────────────────────────────────────────────────────
requestsRouter.get('/', async (req, res) => {
  const q = req.query;
  // scope: mine(요청자 본인) · all(AX-BRM 전체) · data(DATA-BRM — 행내 데이터 필요/모르겠음 건만, 조회 전용)
  const scope = q.scope === 'all' ? 'all' : q.scope === 'data' ? 'data' : 'mine';
  if (scope === 'all' && !isBrm(req.user)) throw new HttpError(403, 'AX-BRM 담당자만 전체 목록을 볼 수 있어요', 'FORBIDDEN');
  if (scope === 'data' && !isBrm(req.user) && !isDataBrm(req.user)) throw new HttpError(403, 'DATA-BRM 담당자만 볼 수 있어요', 'FORBIDDEN');

  const where = [];
  const params = [];
  if (scope === 'mine') { where.push('requester_employee_no = ?'); params.push(req.user.employeeNo); }
  else if (scope === 'data') { where.push("status <> 'draft'", DATA_REQUEST_SQL); }
  else { where.push("status <> 'draft'"); }
  if (q.status) { const list = String(q.status).split(','); where.push(`status IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  if (q.org) { where.push('requester_org_nm = ?'); params.push(String(q.org)); }
  if (q.channel) { where.push('channel = ?'); params.push(String(q.channel)); }
  // AX-BRM 담당자 — 사번, 또는 'none'(미지정)
  if (q.assignee === 'none') where.push('assignee_employee_no IS NULL');
  else if (q.assignee) { where.push('assignee_employee_no = ?'); params.push(String(q.assignee)); }
  if (q.from) { where.push('submitted_at >= ?'); params.push(String(q.from)); }
  if (q.to) { where.push('submitted_at < ?'); params.push(String(q.to)); }
  if (q.q) { where.push('(title LIKE ? OR req_no LIKE ? OR requester_name LIKE ?)'); const like = `%${String(q.q)}%`; params.push(like, like, like); }

  const rows = await db.all(
    `SELECT * FROM requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(submitted_at, updated_at) DESC LIMIT 500`,
    params,
  );
  let list = rows.map((r) => toRequest(r));
  if (q.track) list = list.filter((r) => r.judgement?.track === q.track);
  res.json({ items: list });
});

// 필터용 메타 (부서 목록 · 담당자 목록)
requestsRouter.get('/meta', requireBrm, async (_req, res) => {
  const orgs = await db.all("SELECT requester_org_nm AS org, COUNT(*) AS n FROM requests WHERE status <> 'draft' GROUP BY requester_org_nm ORDER BY n DESC");
  // 담당자는 실제 지정된 적 있는 사람만 — 이름·직위는 지정 스냅샷. 미지정 건수는 따로
  const asg = await db.all(
    `SELECT assignee_employee_no AS emp, MAX(assignee_name) AS name, MAX(assignee_position) AS position, COUNT(*) AS n
       FROM requests WHERE status <> 'draft' AND assignee_employee_no IS NOT NULL GROUP BY assignee_employee_no ORDER BY n DESC, name`,
  );
  const unassigned = await db.get("SELECT COUNT(*) AS n FROM requests WHERE status <> 'draft' AND assignee_employee_no IS NULL");
  res.json({
    orgs: orgs.filter((o) => o.org).map((o) => ({ name: o.org, count: Number(o.n) })),
    assignees: asg.map((a) => ({ employeeNo: a.emp, name: a.name, position: a.position ?? null, count: Number(a.n) })),
    unassigned: Number(unassigned?.n ?? 0),
  });
});

// AX-BRM 담당자 후보 — HR 미러의 부서코드 1094 중 DU22(부장) 제외, 조직·직원 정렬순서 순 (hrSync.ASSIGNEE_RULE)
requestsRouter.get('/assignees', requireBrm, async (_req, res) => {
  res.json({ items: await listAssigneeCandidates(db) });
});

// ── 초안 생성 ────────────────────────────────────────────────────
requestsRouter.post('/', requireRequester, async (req, res) => {
  const answers = pruneAnswers(req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {});
  const id = uuid();
  const now = nowIso();
  const u = req.user;
  await db.run(
    `INSERT INTO requests(id, req_no, title, status, channel, requester_employee_no, requester_name, requester_org_cd, requester_org_nm, requester_position,
       questionnaire_version, answers, judgement, submitted_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, null, answers.q1_title || null, 'draft', answers.q2_channel || null, u.employeeNo, u.name, u.orgCd, u.orgNm, u.position ?? null,
      QUESTIONNAIRE_VERSION, JSON.stringify(answers), null, null, now, now],
  );
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [id]);
  res.status(201).json({ request: toRequest(row, { full: true }) });
});

// ── 초안 자동저장 ────────────────────────────────────────────────
requestsRouter.put('/:id', requireRequester, async (req, res) => {
  const { row, own } = await loadOwned(req.params.id, req.user);
  if (!own) throw new HttpError(403, '작성자만 수정할 수 있어요', 'FORBIDDEN');
  if (row.status !== 'draft') throw new HttpError(409, '이미 신청된 요청은 수정할 수 없어요', 'NOT_DRAFT');
  const answers = pruneAnswers(req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {});
  await db.run('UPDATE requests SET title = ?, channel = ?, answers = ?, questionnaire_version = ?, updated_at = ? WHERE id = ?',
    [answers.q1_title || null, answers.q2_channel || null, JSON.stringify(answers), QUESTIONNAIRE_VERSION, nowIso(), row.id]);
  const fresh = await db.get('SELECT * FROM requests WHERE id = ?', [row.id]);
  res.json({ request: toRequest(fresh, { full: true }) });
});

// ── 신청 확정 ────────────────────────────────────────────────────
requestsRouter.post('/:id/submit', requireRequester, async (req, res) => {
  const { row, own } = await loadOwned(req.params.id, req.user);
  if (!own) throw new HttpError(403, '작성자만 신청할 수 있어요', 'FORBIDDEN');
  if (row.status !== 'draft') throw new HttpError(409, '이미 신청된 요청이에요', 'NOT_DRAFT');
  const answers = pruneAnswers(req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : parseJson(row.answers, {}));
  const missing = nextQuestion(answers);
  if (missing) throw new HttpError(400, `아직 답하지 않은 질문이 있어요: ${missing.ask}`, 'INCOMPLETE');

  const judgement = judge(answers, QUESTIONNAIRE_VERSION);
  const now = nowIso();
  const result = await db.transaction(async (tx) => {
    const conn = tx || db;
    const reqNo = await nextReqNo(conn);
    await conn.run(
      `UPDATE requests SET req_no = ?, title = ?, channel = ?, answers = ?, judgement = ?, questionnaire_version = ?,
         status = 'submitted', submitted_at = ?, updated_at = ?,
         requester_name = ?, requester_org_cd = ?, requester_org_nm = ?, requester_position = ?
       WHERE id = ?`,
      [reqNo, answers.q1_title, answers.q2_channel, JSON.stringify(answers), JSON.stringify(judgement), QUESTIONNAIRE_VERSION,
        now, now, req.user.name, req.user.orgCd, req.user.orgNm, req.user.position ?? null, row.id],
    );
    await addHistory(conn, row.id, 'draft', 'submitted', req.user, '요청자 신청');
    return reqNo;
  });
  console.log(`[request] submitted ${result} by ${req.user.orgNm || '-'}|${req.user.name}`);
  const fresh = await db.get('SELECT * FROM requests WHERE id = ?', [row.id]);
  res.json({ request: toRequest(fresh, { full: true }) });
  // 메신저 알림 — 발신 요청자 → BRM·관리자 전원. 응답 뒤 비동기, 실패해도 신청은 이미 끝났다
  //   데이터가 필요한(또는 모르겠다는) 건이면 DATA-BRM 에게도 — 접수 때 딱 한 번 (server/dataBrm.js)
  fireAndForget(notifyNewRequest({ requestId: row.id, reqNo: result, requesterEmployeeNo: req.user.employeeNo, baseUrl: appBaseUrl(req), dataRelated: isDataAnswers(answers) }));
});

// ── 상세 ────────────────────────────────────────────────────────
requestsRouter.get('/:id', async (req, res) => {
  const { row } = await loadOwned(req.params.id, req.user);
  const [reviews, history, attachments, comments] = await Promise.all([
    db.all('SELECT * FROM request_reviews WHERE request_id = ? ORDER BY created_at DESC', [row.id]),
    db.all('SELECT * FROM status_history WHERE request_id = ? ORDER BY changed_at ASC', [row.id]),
    db.all('SELECT * FROM attachments WHERE request_id = ? ORDER BY uploaded_at DESC', [row.id]),
    db.all('SELECT * FROM comments WHERE request_id = ? ORDER BY created_at ASC', [row.id]),
  ]);
  res.json({
    request: toRequest(row, { full: true }),
    reviews: reviews.map((r) => ({
      id: r.id, reviewer: { employeeNo: r.reviewer_employee_no, name: r.reviewer_name }, decision: r.decision, feasible: r.feasible,
      approach: r.approach, opinion: r.opinion, estimatedWeeksMin: r.estimated_weeks_min, estimatedWeeksMax: r.estimated_weeks_max,
      judgementOverride: parseJson(r.judgement_override, null), createdAt: r.created_at,
    })),
    history: history.map((h) => ({ id: h.id, from: h.from_status, to: h.to_status, by: { employeeNo: h.changed_by, name: h.changed_by_name }, note: h.note, at: h.changed_at })),
    attachments: attachments.map((a) => ({
      id: a.id, kind: a.kind, fileName: a.file_name, mime: a.mime, size: a.size, version: a.version, note: a.note,
      uploadedBy: { employeeNo: a.uploaded_by, name: a.uploaded_by_name }, uploadedAt: a.uploaded_at,
    })),
    comments: comments.map((c) => ({ id: c.id, author: { employeeNo: c.author_employee_no, name: c.author_name, role: c.author_role }, body: c.body, createdAt: c.created_at })),
  });
});

// ── 삭제 ────────────────────────────────────────────────────────
/**
 * 초안: 작성자 본인. 신청된 건: **시스템 관리자만** (2026-09-08) — 잘못 접수됐거나 테스트로 넣은 건을 접수함에서 완전히 지운다.
 * 되돌릴 수 없으므로 의견·이력·첨부(파일 포함)·대화까지 함께 지우고, 서버 로그에 누가 무엇을 지웠는지 남긴다.
 * 요청자·AX-BRM 은 신청된 건을 지울 수 없다 — 잘못된 건은 반려로 종결한다.
 */
requestsRouter.delete('/:id', async (req, res) => {
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!row) throw new HttpError(404, '요청을 찾을 수 없어요', 'NOT_FOUND');
  const own = row.requester_employee_no === req.user.employeeNo;
  const admin = req.user.role === 'admin';
  if (row.status === 'draft') {
    if (!own && !admin) throw new HttpError(403, '작성자만 삭제할 수 있어요', 'FORBIDDEN');
  } else if (!admin) {
    throw new HttpError(403, '신청된 요청은 시스템 관리자만 삭제할 수 있어요', 'FORBIDDEN');
  }
  const files = await db.all('SELECT storage_path FROM attachments WHERE request_id = ?', [row.id]);
  const counts = await db.transaction(async (tx) => {
    const conn = tx || db;
    const n = {};
    for (const t of ['comments', 'attachments', 'status_history', 'request_reviews']) n[t] = (await conn.run(`DELETE FROM ${t} WHERE request_id = ?`, [row.id])).changes;
    await conn.run('DELETE FROM requests WHERE id = ?', [row.id]);
    return n;
  });
  for (const f of files) removeFile(f.storage_path); // DB 커밋 뒤 파일 정리 — 실패해도 요청은 이미 지워졌다
  if (row.status !== 'draft') console.warn(`[request] DELETED ${row.req_no} "${row.title}" (status ${row.status}, ${row.requester_org_nm || '-'}|${row.requester_name}) by admin ${req.user.employeeNo} ${req.user.name} — reviews ${counts.request_reviews}, history ${counts.status_history}, attachments ${counts.attachments}, comments ${counts.comments}`);
  res.json({ ok: true, deleted: { reqNo: row.req_no, ...counts } });
});

// ── AX-BRM 담당자 지정 (의견·상태 변경과 분리) ────────────────────
/**
 * 흐름: 팀장(또는 아무 BRM)이 담당자만 먼저 지정 → 지정된 담당자가 이후 /reviews 로 의견을 적는다.
 * body { employeeNo } — '' / null 이면 해제. 후보(1094 · DU22 제외) 밖의 사번은 400. 상태는 건드리지 않는다.
 */
requestsRouter.post('/:id/assignee', requireBrm, async (req, res) => {
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!row) throw new HttpError(404, '요청을 찾을 수 없어요', 'NOT_FOUND');
  if (row.status === 'draft') throw new HttpError(409, '아직 신청되지 않은 요청이에요', 'IS_DRAFT');
  const empNo = String(req.body?.employeeNo ?? '').trim();
  let assignee = null; // null = 해제
  if (empNo) {
    assignee = await findAssigneeCandidate(db, empNo);
    if (!assignee) throw new HttpError(400, '담당자로 지정할 수 없는 직원이에요 (AX디지털추진부 소속만 가능)', 'BAD_ASSIGNEE');
  }
  const changed = (assignee?.employeeNo ?? null) !== (row.assignee_employee_no ?? null);
  const assignedAt = assignee ? (changed ? nowIso() : row.assigned_at) : null;
  if (changed) {
    await db.transaction(async (tx) => {
      const conn = tx || db;
      await conn.run('UPDATE requests SET assignee_employee_no = ?, assignee_name = ?, assignee_position = ?, assigned_at = ?, updated_at = ? WHERE id = ?',
        [assignee?.employeeNo ?? null, assignee?.name ?? null, assignee?.position ?? null, assignedAt, nowIso(), row.id]);
      // 상태는 그대로 — from = to 로 이력만 남긴다 (화면은 note 만 보여준다)
      await addHistory(conn, row.id, row.status, row.status, req.user,
        assignee ? `담당자 지정: ${assignee.name}${assignee.position ? ' ' + assignee.position : ''}` : '담당자 해제');
    });
    console.log(`[request] assignee ${row.req_no} → ${assignee ? assignee.employeeNo : '(해제)'} by ${req.user.employeeNo}`);
  }
  // 메신저 알림 — 발신 지정한 BRM → 수신 지정된 담당자 (해제·동일 인물 재저장은 알리지 않는다)
  //   다른 알림과 달리 응답 **전에** 결과를 기다린다 — 화면 토스트가 "실제로 알렸는지" 를 보여줘야 해서. (최대 ALARM_TIMEOUT_MS)
  //   지정 자체는 위에서 이미 커밋됐으므로 알림이 실패해도 200 이다. notified: 'sent' | 'failed' | 'disabled' | 'skipped'
  const notified = changed && assignee
    ? await notifyAssignedStatus({ requestId: row.id, reqNo: row.req_no, assigneeEmployeeNo: assignee.employeeNo, byEmployeeNo: req.user.employeeNo, baseUrl: appBaseUrl(req) })
    : 'skipped';
  res.json({ ok: true, changed, assignee, assignedAt, notified });
});

// ── BRM 의견 등록 (+ 상태 전이) ──────────────────────────────────
requestsRouter.post('/:id/reviews', requireBrm, async (req, res) => {
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!row) throw new HttpError(404, '요청을 찾을 수 없어요', 'NOT_FOUND');
  if (row.status === 'draft') throw new HttpError(409, '아직 신청되지 않은 요청이에요', 'IS_DRAFT');
  const b = req.body || {};
  const decision = DECISION[b.decision] ? b.decision : null;
  if (!decision) throw new HttpError(400, '결정 값이 올바르지 않아요', 'BAD_DECISION');
  const opinion = String(b.opinion || '').trim();
  if (!opinion) throw new HttpError(400, '의견을 적어주세요', 'OPINION_REQUIRED');
  const min = b.estimatedWeeksMin != null && b.estimatedWeeksMin !== '' ? Number(b.estimatedWeeksMin) : null;
  const max = b.estimatedWeeksMax != null && b.estimatedWeeksMax !== '' ? Number(b.estimatedWeeksMax) : null;
  const override = b.judgementOverride && typeof b.judgementOverride === 'object' ? b.judgementOverride : null;

  const to = DECISION[decision].to || (row.status === 'submitted' ? 'reviewing' : null);
  await db.transaction(async (tx) => {
    const conn = tx || db;
    await conn.run(
      `INSERT INTO request_reviews(id, request_id, reviewer_employee_no, reviewer_name, decision, feasible, approach, opinion,
         estimated_weeks_min, estimated_weeks_max, judgement_override, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuid(), row.id, req.user.employeeNo, req.user.name, decision, b.feasible || null, b.approach || null, opinion,
        min, max, override ? JSON.stringify(override) : null, nowIso()],
    );
    if (to && to !== row.status) {
      await conn.run('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?', [to, nowIso(), row.id]);
      await addHistory(conn, row.id, row.status, to, req.user, `검토 결정: ${DECISION[decision].label}`);
    } else {
      await conn.run('UPDATE requests SET updated_at = ? WHERE id = ?', [nowIso(), row.id]);
    }
  });
  res.status(201).json({ ok: true, status: to || row.status });
});

// ── BRM 상태 변경 ───────────────────────────────────────────────
requestsRouter.post('/:id/status', requireBrm, async (req, res) => {
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!row) throw new HttpError(404, '요청을 찾을 수 없어요', 'NOT_FOUND');
  const to = req.body?.to;
  if (!STATUS[to]) throw new HttpError(400, '상태 값이 올바르지 않아요', 'BAD_STATUS');
  const allowed = MANUAL_TRANSITIONS[row.status] || [];
  if (!allowed.includes(to)) throw new HttpError(409, `"${STATUS[row.status].label}"에서 "${STATUS[to].label}"로는 바꿀 수 없어요`, 'BAD_TRANSITION');
  // 완료로 갈 때는 종결 분류(배포 위치 · 완성 형태)가 필수 — 통계의 근거가 된다. 개발 중으로 되돌리면 분류·완료 시각을 비운다
  const closure = to === 'done' ? normalizeClosure(req.body?.closure) : null;
  if (to === 'done' && !closure) throw new HttpError(400, '완료 처리에는 배포 위치와 완성 형태를 골라야 해요', 'CLOSURE_REQUIRED');
  const note = String(req.body?.note || '').trim();
  await db.transaction(async (tx) => {
    const conn = tx || db;
    const now = nowIso();
    if (to === 'done') {
      await conn.run('UPDATE requests SET status = ?, closure_deploy = ?, closure_form = ?, closed_at = ?, updated_at = ? WHERE id = ?', [to, closure.deploy, closure.form, now, now, row.id]);
      await addHistory(conn, row.id, row.status, to, req.user, [`종결 분류: ${closureLabel(closure)}`, note].filter(Boolean).join(' — '));
    } else {
      const clear = row.status === 'done' ? ', closure_deploy = NULL, closure_form = NULL, closed_at = NULL' : '';
      await conn.run(`UPDATE requests SET status = ?, updated_at = ?${clear} WHERE id = ?`, [to, now, row.id]);
      await addHistory(conn, row.id, row.status, to, req.user, note || null);
    }
  });
  res.json({ ok: true, status: to, closure });
});

// ── 종결 분류 정정 (완료 건만) ────────────────────────────────────
requestsRouter.post('/:id/closure', requireBrm, async (req, res) => {
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!row) throw new HttpError(404, '요청을 찾을 수 없어요', 'NOT_FOUND');
  if (row.status !== 'done') throw new HttpError(409, '완료된 건만 종결 분류를 바꿀 수 있어요', 'NOT_DONE');
  const closure = normalizeClosure(req.body?.closure);
  if (!closure) throw new HttpError(400, '배포 위치와 완성 형태를 골라야 해요', 'CLOSURE_REQUIRED');
  const changed = closure.deploy !== row.closure_deploy || closure.form !== row.closure_form;
  if (changed) {
    await db.transaction(async (tx) => {
      const conn = tx || db;
      await conn.run('UPDATE requests SET closure_deploy = ?, closure_form = ?, updated_at = ? WHERE id = ?', [closure.deploy, closure.form, nowIso(), row.id]);
      await addHistory(conn, row.id, 'done', 'done', req.user, `종결 분류 정정: ${closureLabel(closure)}`);
    });
  }
  res.json({ ok: true, changed, closure });
});

// ── 코멘트 ──────────────────────────────────────────────────────
requestsRouter.post('/:id/comments', async (req, res) => {
  const { row } = await loadOwned(req.params.id, req.user);
  if (isDataBrm(req.user)) throw new HttpError(403, 'DATA-BRM 은 조회만 할 수 있어요. 의견은 AX-BRM 담당자에게 전달해 주세요', 'FORBIDDEN');
  const body = String(req.body?.body || '').trim();
  if (!body) throw new HttpError(400, '내용을 적어주세요', 'BODY_REQUIRED');
  if (body.length > 4000) throw new HttpError(400, '4000자 이내로 적어주세요', 'TOO_LONG');
  await db.run('INSERT INTO comments(id, request_id, author_employee_no, author_name, author_role, body, created_at) VALUES (?,?,?,?,?,?,?)',
    [uuid(), row.id, req.user.employeeNo, req.user.name, req.user.role, body, nowIso()]);
  await db.run('UPDATE requests SET updated_at = ? WHERE id = ?', [nowIso(), row.id]);
  res.status(201).json({ ok: true });
  // 메신저 알림 — 요청자가 남긴 문의만, 지정된 담당자에게. (BRM 이 남긴 답글·담당자 미지정은 알리지 않는다)
  const isRequester = req.user.employeeNo === row.requester_employee_no;
  if (isRequester && row.assignee_employee_no && row.assignee_employee_no !== req.user.employeeNo) {
    fireAndForget(notifyComment({ requestId: row.id, reqNo: row.req_no, assigneeEmployeeNo: row.assignee_employee_no, byEmployeeNo: req.user.employeeNo, baseUrl: appBaseUrl(req) }));
  }
});
