import { Router } from 'express';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { requireAuth, requireAdmin, toUser, HttpError, ROLES } from '../auth.js';
import { countResetTargets, resetRequests, RESET_CONFIRM_WORD } from '../resetRequests.js';
import { MIRROR_TABLE, isHqOrg, HQ_OGZN_ATTCDS, ADMIN_TEAM_CODES, ADMIN_DEPT_HEAD_RULES, BRM_DEPT_CODES, INITIAL_ADMIN_EMPLOYEE_NOS, getHrSyncStatus, runHrSyncManual, provisionUserFromMirror } from '../hrSync.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

/**
 * 담당자 목록 — 부서코드·부서명·팀코드·팀명은 HR 미러(tbl_employee_adv)에서 붙인다.
 * 미러에 없는 사번(미로그인 시드 등)은 SSO 토큰으로 받은 org_cd/org_nm 으로 대신한다.
 */
const USERS_SELECT = `
  SELECT u.*, h.ogzn_attcd, h.ducd AS hr_ducd, h.blng_brcd AS hr_dept_cd, h.blng_nm AS hr_dept_nm, h.beteam_cd AS hr_team_cd, h.beteam_nm AS hr_team_nm
    FROM users u LEFT JOIN ${MIRROR_TABLE} h ON h.emp_no = u.employee_no`;
const USERS_ORDER = `ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'brm' THEN 1 WHEN 'data_brm' THEN 2 ELSE 3 END, u.name LIMIT 200`;

/**
 * 목록: users 전체(로그인했거나 사전 생성된 직원). 검색어가 있으면 **아직 users 에 없는 HR 미러 직원**도 같이 돌려준다
 * (provisioned:false) — 로그인 전에 DATA-BRM 같은 역할을 줄 수 있게. 역할을 주는 순간 행이 만들어진다 (PUT /role).
 * ?role= 로 역할 하나만 추려 볼 수 있다 (검색어와 AND). 미접속 미러 직원은 역할이 requester 이므로 그 필터일 때만 섞인다.
 */
adminRouter.get('/users', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const role = ROLES.includes(String(req.query.role || '')) ? String(req.query.role) : '';
  const like = `%${q}%`;
  const where = [];
  const params = [];
  if (q) { where.push('(u.name LIKE ? OR u.employee_no LIKE ? OR COALESCE(h.blng_nm, u.org_nm) LIKE ? OR h.beteam_nm LIKE ?)'); params.push(like, like, like, like); }
  if (role) { where.push('u.role = ?'); params.push(role); }
  const rows = await db.all(`${USERS_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${USERS_ORDER}`, params);
  const users = rows.map((r) => ({
    ...toUser(r),
    deptCd: r.hr_dept_cd ?? r.org_cd ?? null,
    deptNm: r.hr_dept_nm ?? r.org_nm ?? null,
    teamCd: r.hr_team_cd ?? null,
    teamNm: r.hr_team_nm ?? null,
    ducd: r.hr_ducd ?? null,
    ogznAttcd: r.ogzn_attcd ?? null,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    provisioned: true,
  }));
  if (q && (!role || role === 'requester')) {
    const mirror = await db.all(
      `SELECT h.* FROM ${MIRROR_TABLE} h
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_no = h.emp_no)
          AND (h.emp_nm LIKE ? OR h.emp_no LIKE ? OR h.blng_nm LIKE ? OR h.beteam_nm LIKE ?)
        ORDER BY h.ofor_sqc, h.emp_rost_sqc, h.emp_nm LIMIT 100`, [like, like, like, like]);
    for (const m of mirror) {
      users.push({
        employeeNo: m.emp_no, name: m.emp_nm, orgCd: m.blng_brcd ?? null, orgNm: m.blng_nm ?? null, position: m.abnm_jtm ?? null, role: 'requester',
        ducd: m.ducd ?? null, ogznAttcd: m.ogzn_attcd ?? null, canRequest: isHqOrg(m.ogzn_attcd),
        deptCd: m.blng_brcd ?? null, deptNm: m.blng_nm ?? null, teamCd: m.beteam_cd ?? null, teamNm: m.beteam_nm ?? null,
        createdAt: null, lastLoginAt: null, provisioned: false,
      });
    }
  }
  res.json({ users });
});

adminRouter.put('/users/:employeeNo/role', requireAdmin, async (req, res) => {
  const role = req.body?.role;
  if (!ROLES.includes(role)) throw new HttpError(400, '역할 값이 올바르지 않아요', 'BAD_ROLE');
  if (req.params.employeeNo === req.user.employeeNo && role !== 'admin') throw new HttpError(409, '자신의 관리자 권한은 내릴 수 없어요', 'SELF_DEMOTE');
  const r = await db.run('UPDATE users SET role = ? WHERE employee_no = ?', [role, req.params.employeeNo]);
  if (!r.changes) {
    // 아직 로그인하지 않은 직원 — HR 미러에 있으면 행을 만들어 역할을 준다 (첫 로그인부터 그 역할)
    const made = await provisionUserFromMirror(db, req.params.employeeNo, role);
    if (!made) throw new HttpError(404, '사용자를 찾을 수 없어요 (HR 인사 미러에 없는 사번이에요)', 'NOT_FOUND');
  }
  res.json({ ok: true });
});

/**
 * 일괄 역할 변경 — 검색 결과(팀·부서)의 직원들을 한 번에. body { employeeNos: string[], role }
 * 규칙은 단건과 같다: 미접속 직원은 미러로 행을 만들고, 자기 자신의 관리자 권한은 내리지 않는다(건너뛰고 skipped 로 알려 준다).
 * 한 트랜잭션 — 중간에 실패하면 아무도 안 바뀐다. 결과: { changed, provisioned, skipped: [{employeeNo, reason}] }
 */
adminRouter.post('/users/bulk-role', requireAdmin, async (req, res) => {
  const role = req.body?.role;
  if (!ROLES.includes(role)) throw new HttpError(400, '역할 값이 올바르지 않아요', 'BAD_ROLE');
  const list = [...new Set((Array.isArray(req.body?.employeeNos) ? req.body.employeeNos : []).map((e) => String(e ?? '').trim()).filter(Boolean))];
  if (!list.length) throw new HttpError(400, '대상 직원이 없어요', 'EMPTY');
  if (list.length > 200) throw new HttpError(400, '한 번에 200명까지 바꿀 수 있어요', 'TOO_MANY');
  const result = await db.transaction(async (tx) => {
    const conn = tx || db;
    const out = { changed: 0, provisioned: 0, skipped: /** @type {{employeeNo:string,reason:string}[]} */ ([]) };
    for (const empNo of list) {
      if (empNo === req.user.employeeNo && role !== 'admin') { out.skipped.push({ employeeNo: empNo, reason: '자신의 관리자 권한은 내릴 수 없어요' }); continue; }
      const r = await conn.run('UPDATE users SET role = ? WHERE employee_no = ?', [role, empNo]);
      if (r.changes) { out.changed += 1; continue; }
      const made = await provisionUserFromMirror(conn, empNo, role);
      if (made) out.provisioned += 1; else out.skipped.push({ employeeNo: empNo, reason: 'HR 인사 미러에 없는 사번' });
    }
    return out;
  });
  console.log(`[admin] bulk role → ${role}: changed ${result.changed}, provisioned ${result.provisioned}, skipped ${result.skipped.length} by ${req.user.employeeNo}`);
  res.json({ ok: true, ...result });
});

/**
 * 권한 부여 규칙 안내 — 역할 관리 화면이 서버의 규칙 상수를 **그대로** 보여준다.
 * 조직개편으로 코드·담당이 바뀌면 server/hrSync.js 의 상수를 함께 바꿔야 한다는 것을 인지시키는 용도.
 */
adminRouter.get('/role-rules', requireAdmin, async (_req, res) => {
  const seeded = await db.get("SELECT value FROM app_meta WHERE key = 'admin_seed_done'");
  res.json({
    // admin: 팀코드 전원 + 부서의 특정 직책. 자동 부여만 하고 자동 회수는 안 한다 (시드 관리자 보호)
    admin: {
      teamCodes: ADMIN_TEAM_CODES, deptHeads: ADMIN_DEPT_HEAD_RULES,
      initialSeed: [...new Set([...INITIAL_ADMIN_EMPLOYEE_NOS, ...env.ADMIN_EMPLOYEE_NOS])],
      seededAt: seeded?.value || null,
    },
    // brm: 부서코드 소속 전원 중 admin 규칙에 안 걸리는 나머지
    brm: { deptCodes: BRM_DEPT_CODES },
    // DATA-BRM 은 규칙 없음 — 시스템 담당자가 수기로 부여하고, HR 동기화가 건드리지 않는다
    dataBrm: { manual: true },
    // 상담 요청 자격 — 역할이 아니라 미러의 조직속성코드로 판정 (2026-09-11)
    hq: { ogznAttcds: HQ_OGZN_ATTCDS },
  });
});

/** HR 인사 미러 상태 — 마지막 동기화 시각·건수·진행 여부. 역할 관리 화면의 미러 패널이 쓴다 */
adminRouter.get('/hr-sync', requireAdmin, async (_req, res) => {
  res.json(await getHrSyncStatus());
});

/**
 * 수동 미러링. 인사 DB 전량 조회라 수십 초 걸릴 수 있어 끝날 때까지 기다렸다가 결과를 돌려준다.
 * 이미 도는 중이면 새로 돌리지 않고 그 결과를 같이 받는다. 실패해도 200 — 결과 객체의 ok/error 로 판단한다.
 */
adminRouter.post('/hr-sync', requireAdmin, async (req, res) => {
  const result = await runHrSyncManual({ by: req.user.name || req.user.employeeNo });
  res.json({ result, status: await getHrSyncStatus() });
});

// ── 신청 데이터 전체 초기화 (오픈 전 리얼테스트 데이터 정리) ─────────────
/** 지울 대상 건수 — 확인 화면이 먼저 보여준다 */
adminRouter.get('/reset-requests', requireAdmin, async (_req, res) => {
  res.json({ counts: await countResetTargets(db), confirmWord: RESET_CONFIRM_WORD });
});

/**
 * 실제 초기화 — body.confirm 이 확인 문구와 정확히 같아야 한다. 접수번호 카운터까지 비워 다음 신청이 BRM-YYYY-0001 부터.
 * 되돌릴 수 없으므로 관리자 사번·이름을 경고 로그로 남긴다. users·HR 미러·app_meta 는 남는다.
 */
adminRouter.post('/reset-requests', requireAdmin, async (req, res) => {
  if (String(req.body?.confirm ?? '') !== RESET_CONFIRM_WORD) throw new HttpError(400, `확인 문구 "${RESET_CONFIRM_WORD}"를 정확히 입력해 주세요`, 'CONFIRM_REQUIRED');
  const r = await resetRequests({ conn: db, by: `admin ${req.user.employeeNo} ${req.user.name || ''}`.trim() });
  res.json({ ok: true, ...r });
});
