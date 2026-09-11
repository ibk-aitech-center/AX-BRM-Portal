/**
 * HR 인사 미러 동기화 — 인사 마스터(MariaDB `tbl_employee_adv`)에서 직원 정보를
 * 우리 DB 의 동명 미러 테이블로 full-replace 복사하고, `users.position`(직위명)으로 전파한다.
 * weekly-ai 프로젝트의 hrSync 방식을 AX-BRM 에 맞게 축소 이식했다.
 *
 * AX-BRM 이 미러에서 쓰는 것은 **직책 표시(position = abnm_jtm)** 하나다.
 * 조직(부서/팀) 정규화는 하지 않는다 — 부서명은 SSO 토큰의 orgNm 을 그대로 쓴다(가이드 §8).
 *
 * 설계 원칙 (weekly-ai 에서 운영 사고로 확정된 것들 — 생략 금지)
 * - mysql2 는 runHrSync() 안에서 **lazy import**. 폐쇄망/미설치 환경에서 서버 기동이 죽지 않게 한다.
 * - runHrSync() 는 절대 throw 하지 않는다. 실패는 { ok:false, error } 로 반환 + 로깅.
 * - DELETE + 벌크 INSERT 는 한 트랜잭션. 실패 시 롤백되어 기존 미러가 그대로 남는다.
 * - **급감 가드**: HR 조회 결과가 기존 미러의 50% 미만이면 중단 (HR 쪽 장애로 미러가 비워지는 것 방지).
 * - 원본 테이블명은 env 로 바뀔 수 있으므로 식별자 화이트리스트 검증(인젝션 방지).
 * - 조회 쿼리에 타임아웃 — 인사 DB 잠김 시 동기화가 영영 안 끝나는 것을 막는다.
 */
import { db, nowIso } from './db/index.js';
import { env } from './env.js';

export const MIRROR_TABLE = 'tbl_employee_adv';

/** 미러로 복사하는 컬럼 (순서 고정 — 벌크 INSERT 에 그대로 사용). SELECT * 금지 — 안 쓰는 컬럼 유입 방지
 *  ofor_sqc(조직 정렬순서)·emp_rost_sqc(직원 정렬순서)는 담당자 지정 목록의 정렬 키 — weekly-ai 미러와 같은 원천 컬럼
 *  ogzn_attcd(조직속성코드)는 본부부서 판정(HQ_OGZN_ATTCDS) — 요청을 올릴 수 있는 직원인지 가른다 (2026-09-11) */
export const MIRROR_COLUMNS = ['emp_no', 'emp_nm', 'abnm_jtm', 'ducd', 'blng_brcd', 'blng_nm', 'beteam_cd', 'beteam_nm', 'ofor_sqc', 'emp_rost_sqc', 'ogzn_attcd'];

/**
 * 동기화에서 제외하는 직책코드 — 미러에 복사조차 하지 않는다.
 * - DU90: 외주 직원 (인사 마스터의 최대 다수지만 이 시스템 이용 대상이 아님)
 * - DU16(그룹장/부행장)은 **포함한다** — AX-BRM 은 전 직원이 상담을 요청할 수 있어야 한다 (2026-09-03 확정).
 *   weekly-ai 는 보고 시스템이라 DU16 을 제외했지만, 우리는 요청자 풀이 넓을수록 좋다.
 */
export const EXCLUDED_DUCDS = new Set(['DU90']);

/** normalizeHrRow 가 "제외 대상"과 "형식 불량"을 구분해 알리기 위한 sentinel */
export const EXCLUDED = Symbol('excluded');

const INSERT_CHUNK_SIZE = 500;
const MIRROR_MIN_RETAIN_RATIO = 0.5;
const FAILED_SYNC_RETRY_MS = 10 * 60 * 1000;

const trim = (v) => String(v ?? '').trim();
const sqlQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;
/** 정렬순서 같은 숫자 컬럼 — 빈 값·숫자 아님은 NULL (정렬에서 맨 뒤로) */
const toNullableInt = (v) => { const s = trim(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? Math.trunc(n) : null; };

/**
 * HR 원본 행 1건 → 미러 값 배열(MIRROR_COLUMNS 순서) | EXCLUDED | null(형식 불량 — 건너뜀)
 * @param {any} row
 */
export function normalizeHrRow(row) {
  if (!row || typeof row !== 'object') return null;
  const empNo = trim(row.emp_no);
  if (!/^\d{6}$/.test(empNo)) return null; // 사번 6자리 규칙 (SSO id 클레임과 동일)
  if (EXCLUDED_DUCDS.has(trim(row.ducd).toUpperCase())) return EXCLUDED;
  return [empNo, trim(row.emp_nm) || null, trim(row.abnm_jtm) || null, trim(row.ducd) || null,
    trim(row.blng_brcd) || null, trim(row.blng_nm) || null, trim(row.beteam_cd) || null, trim(row.beteam_nm) || null,
    toNullableInt(row.ofor_sqc), toNullableInt(row.emp_rost_sqc), trim(row.ogzn_attcd) || null];
}

// ── 본부부서 판정 (요청 자격) ─────────────────────────────────────
/**
 * AX-BRM 포탈은 **본부부서 전용**이다 — 조직속성코드(ogzn_attcd)가 아래 값인 직원만 상담을 요청할 수 있다 (2026-09-11 확정).
 * 영업점 등 그 외 직원은 화면에서 안내(지식제안으로 진행)만 보고 요청을 만들 수 없다.
 * 판정은 로그인·API 호출마다 미러를 LEFT JOIN 해 **현재 값**으로 한다 — users 로 복사하지 않아 미러에서 빠진 직원에게 옛 자격이 남지 않는다.
 * 미러에 없는 직원(외주·아직 동기화 전)은 자격 없음. brm·admin 도 예외 없이 같은 규칙이다 (1094 는 본부라 자연히 통과).
 * ⚠ 조직개편 시 ADMIN_*·BRM_DEPT_CODES 와 함께 이 상수도 확인해야 한다.
 */
export const HQ_OGZN_ATTCDS = ['0001', '0002', '0003', '0004', '0005', '0007', '0031']; // 0008 은 2026-09-11 제외
const HQ_OGZN_ATTCD_SET = new Set(HQ_OGZN_ATTCDS);

/** 조직속성코드 1개가 본부부서인지. null/빈 값은 false. @param {unknown} ogznAttcd */
export function isHqOrg(ogznAttcd) {
  return HQ_OGZN_ATTCD_SET.has(trim(ogznAttcd));
}

/**
 * full-replace 전 안전장치. 급감이면 사유 문자열, 정상이면 null. (최초 동기화는 항상 통과)
 * @param {number} previousCount @param {number} nextCount
 */
export function describeMirrorGuardBreach(previousCount, nextCount) {
  if (previousCount <= 0) return null;
  if (nextCount === 0) return `HR 조회 결과가 0건인데 기존 미러에는 ${previousCount}건이 있어요.`;
  if (nextCount < previousCount * MIRROR_MIN_RETAIN_RATIO) {
    return `HR 조회 결과가 ${nextCount}건 — 기존 미러 ${previousCount}건의 ${Math.round((nextCount / previousCount) * 100)}% 로 급감했어요.`;
  }
  return null;
}

/** HR_DB_TABLE 화이트리스트 검증 (인젝션 방지) */
function resolveSourceTable() {
  const t = env.HR_DB_TABLE || MIRROR_TABLE;
  return /^[A-Za-z0-9_]+$/.test(t) ? t : null;
}

/**
 * 원본의 팀명 컬럼명 — 인사 마스터마다 이름이 다를 수 있어 env(HR_DB_TEAM_NM_COL)로 바꿀 수 있다.
 * 미러 쪽 컬럼은 항상 beteam_nm 이고, SELECT 에서 alias 로 맞춘다. 식별자 화이트리스트 검증(인젝션 방지).
 */
function resolveTeamNameColumn() {
  const c = env.HR_DB_TEAM_NM_COL || 'beteam_nm';
  return /^[A-Za-z0-9_]+$/.test(c) ? c : null;
}

/** MariaDB 전량 조회 (읽기 전용). mysql2 는 여기서만 import 한다. */
async function fetchHrEmployees(logger = console) {
  const sourceTable = resolveSourceTable();
  if (!sourceTable) throw new Error(`HR_DB_TABLE 값이 올바르지 않아요: ${env.HR_DB_TABLE}`);
  const teamNmCol = resolveTeamNameColumn();
  if (!teamNmCol) throw new Error(`HR_DB_TEAM_NM_COL 값이 올바르지 않아요: ${env.HR_DB_TEAM_NM_COL}`);

  let mysql;
  try {
    mysql = (await import('mysql2/promise')).default ?? (await import('mysql2/promise'));
  } catch (e) {
    throw new Error(`mysql2 모듈을 불러올 수 없어요 (npm install mysql2 필요): ${e.message}`);
  }

  const connection = await mysql.createConnection({
    host: env.HR_DB_HOST,
    port: env.HR_DB_PORT,
    user: env.HR_DB_USER,
    password: env.HR_DB_PASSWORD,
    database: env.HR_DB_NAME,
    connectTimeout: env.HR_DB_CONNECT_TIMEOUT_MS,
    dateStrings: true, // 변환으로 인한 정보 손실 방지 — 미러는 "그대로 복사"
    charset: 'utf8mb4',
  });
  logger.log(`[hr-sync] MariaDB 조회: ${env.HR_DB_HOST}:${env.HR_DB_PORT}/${env.HR_DB_NAME}.${sourceTable}`);
  try {
    const columnList = MIRROR_COLUMNS.map((c) => (c === 'beteam_nm' ? `\`${teamNmCol}\` AS \`beteam_nm\`` : `\`${c}\``)).join(', ');
    // 외주(DU90)는 최대 다수라 SQL 단계에서 거른다 (normalizeHrRow 에서 한 번 더 거른다).
    // 쿼리 타임아웃 필수 — 없으면 인사 DB 잠김 시 이 함수가 영영 안 돌아와 이후 동기화가 전부 스킵된다.
    const [rows] = await connection.query({
      sql: `SELECT ${columnList} FROM \`${sourceTable}\` WHERE COALESCE(\`ducd\`, '') <> 'DU90'`,
      timeout: env.HR_DB_QUERY_TIMEOUT_MS,
    });
    return Array.isArray(rows) ? rows : [];
  } finally {
    await connection.end().catch(() => {});
  }
}

/**
 * 로컬 개발용 목업 (HR_DB_HOST 미설정 시 이걸로 미러를 시드한다).
 * popup.html 목업 직원 4명과 사번이 1:1 로 맞아야 로그인 → 직책 표시가 이어진다.
 * 099001(DU90 외주)은 **제외 경로** 검증용, 099005(DU16 그룹장)는 **포함 결정** 검증용.
 */
export const MOCK_EMPLOYEES = [
  { emp_no: '045345', emp_nm: '김브름', abnm_jtm: '팀장', ducd: 'DU30', blng_brcd: '1094', blng_nm: 'AX디지털추진부', beteam_cd: '8476', beteam_nm: 'AX-BRM팀', ofor_sqc: 120, emp_rost_sqc: 10, ogzn_attcd: '0001' }, // 규칙 검증: 팀코드 8476 → admin
  { emp_no: '099002', emp_nm: '나부장', abnm_jtm: '부장', ducd: 'DU22', blng_brcd: '1094', blng_nm: 'AX디지털추진부', ofor_sqc: 100, emp_rost_sqc: 1, ogzn_attcd: '0001' },              // 1094 부장(DU22) → admin · 담당자 목록에서는 제외
  // 담당자 지정 목록 정렬 검증용 — 같은 부서(1094)의 다른 팀(ofor_sqc 110)이 AX-BRM팀(120)보다 앞, 팀 안에서는 emp_rost_sqc 순
  { emp_no: '045346', emp_nm: '정담당', abnm_jtm: '과장', ducd: 'DU40', blng_brcd: '1094', blng_nm: 'AX디지털추진부', beteam_cd: '8476', beteam_nm: 'AX-BRM팀', ofor_sqc: 120, emp_rost_sqc: 20, ogzn_attcd: '0001' },
  { emp_no: '045347', emp_nm: '오담당', abnm_jtm: '대리', ducd: 'DU40', blng_brcd: '1094', blng_nm: 'AX디지털추진부', beteam_cd: '8476', beteam_nm: 'AX-BRM팀', ofor_sqc: 120, emp_rost_sqc: 30, ogzn_attcd: '0001' },
  { emp_no: '045348', emp_nm: '유기획', abnm_jtm: '차장', ducd: 'DU30', blng_brcd: '1094', blng_nm: 'AX디지털추진부', beteam_cd: '8470', beteam_nm: 'AX기획팀', ofor_sqc: 110, emp_rost_sqc: 10, ogzn_attcd: '0001' },
  { emp_no: '051234', emp_nm: '이현업', abnm_jtm: '대리', ducd: 'DU40', blng_brcd: 'D210', blng_nm: '개인고객부', beteam_cd: 'T211', beteam_nm: '개인여신팀', ogzn_attcd: '0002' },
  { emp_no: '062211', emp_nm: '박영업', abnm_jtm: '과장', ducd: 'DU40', blng_brcd: 'B031', blng_nm: '을지로지점', ogzn_attcd: '0011' }, // 영업점 → 본부부서 아님: 요청 차단 안내 경로 검증용
  { emp_no: '073322', emp_nm: '최기획', abnm_jtm: '차장', ducd: 'DU30', blng_brcd: 'D330', blng_nm: '경영기획부', beteam_cd: 'T331', beteam_nm: '전략기획팀', ogzn_attcd: '0003' },
  { emp_no: '099001', emp_nm: '강외주', abnm_jtm: '대리', ducd: 'DU90', blng_brcd: 'D100', blng_nm: 'AX디지털추진부' },
  { emp_no: '099005', emp_nm: '한그룹', abnm_jtm: '그룹장', ducd: 'DU16', blng_brcd: 'G010', blng_nm: '디지털그룹', ogzn_attcd: '0031' },
];

/**
 * 전량 삭제 후 청크 벌크 INSERT. 호출자가 트랜잭션을 연 상태여야 한다.
 * (TRUNCATE 대신 DELETE — pg 에서 TRUNCATE 는 ACCESS EXCLUSIVE 락으로 로그인 경로의 미러 조회를 멈춘다)
 * @param {import('./db/index.js').DbAdapter} conn @param {any[][]} rows normalize 된 값 배열들
 */
export async function replaceMirrorRows(conn, rows) {
  await conn.run(`DELETE FROM ${MIRROR_TABLE}`);
  const syncedAt = nowIso();
  const cols = [...MIRROR_COLUMNS, 'synced_at'];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const params = chunk.flatMap((r) => [...r, syncedAt]);
    await conn.run(`INSERT INTO ${MIRROR_TABLE}(${cols.join(',')}) VALUES ${placeholders}`, params);
  }
  return rows.length;
}

/**
 * 미러 → users.position 전파. 미러의 직위명이 비어 있으면 기존 값을 지키고(COALESCE),
 * 값이 실제로 달라지는 row 만 갱신한다. SQLite/PG 공용 SQL.
 * @param {import('./db/index.js').DbAdapter} conn
 */
export async function propagateToUsers(conn) {
  const sub = `(SELECT NULLIF(TRIM(h.abnm_jtm), '') FROM ${MIRROR_TABLE} h WHERE h.emp_no = users.employee_no)`;
  const r = await conn.run(
    `UPDATE users SET position = COALESCE(${sub}, position)
      WHERE EXISTS (SELECT 1 FROM ${MIRROR_TABLE} h WHERE h.emp_no = users.employee_no)
        AND COALESCE(position, '') <> COALESCE(${sub}, COALESCE(position, ''))`,
  );
  return r.changes;
}

/**
 * 미러에서 사번 1건의 직위명 조회 (로그인 경로가 쓴다). 없으면 null.
 * @param {import('./db/index.js').DbAdapter} conn @param {string} employeeNo
 */
export async function positionFor(conn, employeeNo) {
  const row = await conn.get(`SELECT abnm_jtm FROM ${MIRROR_TABLE} WHERE emp_no = ?`, [employeeNo]);
  const v = trim(row?.abnm_jtm);
  return v || null;
}

// ── AX-BRM 담당자 지정 후보 ──────────────────────────────────────
/**
 * 검토 화면에서 "실제 진행할 AX-BRM 담당자"로 고를 수 있는 직원 — 부서코드 1094 전원에서 부장(DU22)만 뺀다.
 * 정렬은 조직 정렬순서(ofor_sqc) → 직원 정렬순서(emp_rost_sqc) → 이름. NULL 은 맨 뒤.
 * ⚠ 조직개편 시 ADMIN_*·BRM_DEPT_CODES 와 함께 이 상수도 바꿔야 한다.
 */
export const ASSIGNEE_RULE = { deptCode: '1094', excludedDucds: ['DU22'] };

const ASSIGNEE_WHERE_SQL = `h.blng_brcd = ${sqlQuote(ASSIGNEE_RULE.deptCode)}
    AND UPPER(COALESCE(h.ducd, '')) NOT IN (${ASSIGNEE_RULE.excludedDucds.map((d) => sqlQuote(String(d).toUpperCase())).join(', ')})`;
/* "IS NULL" 을 먼저 정렬 키로 두면 SQLite(0/1)·PG(false/true) 모두에서 NULL 이 맨 뒤로 간다 (NULLS LAST 는 SQLite 3.30+ 전용) */
const ASSIGNEE_ORDER_SQL = 'h.ofor_sqc IS NULL, h.ofor_sqc, h.emp_rost_sqc IS NULL, h.emp_rost_sqc, h.emp_nm, h.emp_no';

/**
 * 담당자 후보 목록 (미러 기준 — HR 동기화가 안 됐으면 빈 배열).
 * @param {import('./db/index.js').DbAdapter} conn
 * @returns {Promise<{ employeeNo: string, name: string|null, position: string|null, teamNm: string|null }[]>}
 */
export async function listAssigneeCandidates(conn = db) {
  const rows = await conn.all(
    `SELECT h.emp_no, h.emp_nm, h.abnm_jtm, h.beteam_nm FROM ${MIRROR_TABLE} h WHERE ${ASSIGNEE_WHERE_SQL} ORDER BY ${ASSIGNEE_ORDER_SQL}`,
  );
  return rows.map((r) => ({ employeeNo: r.emp_no, name: trim(r.emp_nm) || null, position: trim(r.abnm_jtm) || null, teamNm: trim(r.beteam_nm) || null }));
}

/**
 * 사번 1건이 담당자 후보인지 — 지정 요청 검증용. 후보면 { employeeNo, name, position }, 아니면 null.
 * @param {import('./db/index.js').DbAdapter} conn @param {string} employeeNo
 */
export async function findAssigneeCandidate(conn, employeeNo) {
  const r = await conn.get(`SELECT h.emp_no, h.emp_nm, h.abnm_jtm FROM ${MIRROR_TABLE} h WHERE h.emp_no = ? AND ${ASSIGNEE_WHERE_SQL}`, [employeeNo]);
  return r ? { employeeNo: r.emp_no, name: trim(r.emp_nm) || null, position: trim(r.abnm_jtm) || null } : null;
}

// ── 권한(role) 관리 ─────────────────────────────────────────────
/**
 * 관리자(admin)·AX-BRM(brm) 권한은 HR 파생이다 — 미러 동기화 때마다 아래 **규칙 상수**로 재계산한다 (2026-09-08 확정).
 *   admin ← 팀코드 8476 전원 (부서 무관) + 부서코드 1094 의 부장(DU22)
 *   brm   ← 부서코드 1094 소속 중 admin 규칙에 안 걸리는 나머지 전원
 * 우선순위는 admin > brm. data_brm(DATA-BRM 조회 전용, 수기 부여)은 건드리지 않는다.
 * 회수: 규칙에서 벗어난 brm → requester. **admin 은 자동 회수하지 않는다** — 최초 시드 관리자(024498·044692 등)처럼
 *   규칙 밖 관리자가 있어서, 관리자 해제는 관리 화면에서 수기로만 한다.
 * 관리 화면에서 수기로 brm 을 부여하거나 1094 직원을 requester 로 내려도 다음 동기화 때 이 규칙으로 되돌아간다.
 *
 * ⚠ 조직개편·담당 변경 시 **이 상수를 함께 바꿔야 한다.** 값은 역할 관리 화면의 규칙 안내에도
 *   그대로 노출되므로(/api/admin/role-rules) 코드와 화면이 어긋나지 않는다.
 */
/** admin ① 이 팀코드 소속 전원 → admin (부서 무관). 2026-09-08: AX-BRM팀(8476) */
export const ADMIN_TEAM_CODES = ['8476'];
/** admin ② 이 부서코드의 특정 직책코드 → admin. label 은 화면 표시용. 2026-09-08: AX디지털추진부(1094) 부장(DU22) */
export const ADMIN_DEPT_HEAD_RULES = [{ deptCode: '1094', ducd: 'DU22', label: '부장' }];
/** brm: 이 부서코드 소속 전원 → brm — 단 admin 규칙에 걸리는 직원은 제외. 2026-09-08: AX디지털추진부(1094) */
export const BRM_DEPT_CODES = ['1094'];

/** 미러 행(별칭 h)이 admin 규칙에 맞는지 — 역할 재계산(syncRoles·roleForNewLogin)에만 쓴다. 알림 수신자는 users 의 역할만 본다 */
const ADMIN_MATCH_CONDITION = `(${[
  ...ADMIN_TEAM_CODES.map((c) => `h.beteam_cd = ${sqlQuote(c)}`),
  ...ADMIN_DEPT_HEAD_RULES.map((r) => `(h.blng_brcd = ${sqlQuote(r.deptCode)} AND UPPER(COALESCE(h.ducd, '')) = ${sqlQuote(String(r.ducd).toUpperCase())})`),
].join('\n         OR ')})`;
/** 미러 행(별칭 h)이 brm 규칙에 맞는지 — admin 규칙이 우선이라 그쪽에 걸리면 brm 이 아니다 */
const BRM_MATCH_CONDITION = `((${BRM_DEPT_CODES.map((c) => `h.blng_brcd = ${sqlQuote(c)}`).join(' OR ')}) AND NOT ${ADMIN_MATCH_CONDITION})`;
/** 미러 행 → 규칙상 역할 (CASE 식). 사전 등록·첫 로그인이 같이 쓴다 */
const RULE_ROLE_CASE = `CASE WHEN ${ADMIN_MATCH_CONDITION} THEN 'admin' WHEN ${BRM_MATCH_CONDITION} THEN 'brm' ELSE 'requester' END`;
const ADMIN_MATCH_SQL = `
  SELECT 1 FROM ${MIRROR_TABLE} h WHERE h.emp_no = users.employee_no
    AND ${ADMIN_MATCH_CONDITION}`;
const BRM_MATCH_SQL = `
  SELECT 1 FROM ${MIRROR_TABLE} h WHERE h.emp_no = users.employee_no
    AND ${BRM_MATCH_CONDITION}`;

/**
 * 신규 요청 알림 수신자 — **발송 시점에 users 에 설정된 역할**이 admin(관리자) 인 직원만.
 *   AX-BRM(brm) 은 접수 알림을 받지 않는다 — 관리자가 담당자로 지정할 때 그 사람만 받는다 (notify.notifyAssigned). 2026-09-08 결정.
 *   HR 미러 규칙(1094 소속)으로는 보내지 않는다 — 관리 화면에서 바꾼 역할이 그대로 발송 기준이다.
 * @returns {Promise<string[]>} 사번 목록 (중복 없음)
 */
export async function listAdminRecipients(conn = db) {
  const rows = await conn.all(`SELECT employee_no FROM users WHERE role = 'admin'`);
  return rows.map((r) => String(r.employee_no));
}

/**
 * 역할 재계산 — 네 단계 (admin 규칙 > brm 규칙):
 *   ① admin 규칙에 맞는 requester·brm → admin (adminGranted). data_brm·이미 admin 은 그대로
 *   ② brm 규칙에 맞는 requester → brm (granted)
 *   ③ 어느 규칙에도 안 맞는 brm → requester (revoked). admin·data_brm 은 회수하지 않는다
 *   ④ **미러에 있는데 아직 users 에 없는 직원 전원**의 행을 미러 정보(이름·부서·직위)로 미리 만든다 (provisioned).
 *      역할은 규칙대로(admin/brm/requester). → 담당자 관리 화면에 전 직원이 로그인 전부터 나타나 어떤 역할이든 바로 줄 수 있고,
 *      규칙에 맞는 직원은 첫 로그인부터 그 역할이다. 로그인 경로는 기존 행의 역할을 그대로 쓴다. (2026-09-07: 1094 만 → 전원으로 확대)
 * @param {import('./db/index.js').DbAdapter} conn
 */
export async function syncRoles(conn) {
  const adminGranted = (await conn.run(
    `UPDATE users SET role = 'admin' WHERE role IN ('requester', 'brm') AND EXISTS (${ADMIN_MATCH_SQL})`)).changes;
  const granted = (await conn.run(
    `UPDATE users SET role = 'brm' WHERE role = 'requester' AND EXISTS (${BRM_MATCH_SQL})`)).changes;
  const revoked = (await conn.run(
    `UPDATE users SET role = 'requester' WHERE role = 'brm' AND NOT EXISTS (${BRM_MATCH_SQL})`)).changes;
  const provisioned = (await conn.run(
    `INSERT INTO users(employee_no, name, org_cd, org_nm, position, role, created_at)
     SELECT h.emp_no, h.emp_nm, h.blng_brcd, h.blng_nm, NULLIF(TRIM(h.abnm_jtm), ''),
            ${RULE_ROLE_CASE}, ?
       FROM ${MIRROR_TABLE} h
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_no = h.emp_no)`, [nowIso()])).changes;
  return { adminGranted, granted, revoked, provisioned };
}
/** @deprecated 이름만 남긴 별칭 — syncRoles 를 쓴다 */
export const syncBrmRoles = syncRoles;

/**
 * 처음 로그인하는 직원의 역할 — 미러 규칙대로 admin / brm / requester. 미러에 없으면 requester.
 * (④ 사전 생성이 있어 대개는 이미 행이 있지만, 입사·전입 뒤 아직 동기화 전에 로그인하는 경우를 막는다)
 * @param {import('./db/index.js').DbAdapter} conn @param {string} employeeNo
 */
export async function roleForNewLogin(conn, employeeNo) {
  const hit = await conn.get(`SELECT ${RULE_ROLE_CASE} AS role FROM ${MIRROR_TABLE} h WHERE h.emp_no = ?`, [employeeNo]);
  return hit?.role || 'requester';
}

/**
 * 관리자가 로그인 전 직원에게 역할을 줄 때 — 미러 정보로 users 행을 만든다. 미러에 없으면 null.
 * @param {import('./db/index.js').DbAdapter} conn @param {string} employeeNo @param {string} role
 */
export async function provisionUserFromMirror(conn, employeeNo, role) {
  const m = await conn.get(`SELECT emp_no, emp_nm, blng_brcd, blng_nm, abnm_jtm FROM ${MIRROR_TABLE} WHERE emp_no = ?`, [employeeNo]);
  if (!m) return null;
  await conn.run(
    `INSERT INTO users(employee_no, name, org_cd, org_nm, position, role, created_at) VALUES (?,?,?,?,?,?,?)`,
    [m.emp_no, m.emp_nm || `(미로그인 ${m.emp_no})`, m.blng_brcd || null, m.blng_nm || null, trim(m.abnm_jtm) || null, role, nowIso()],
  );
  return await conn.get('SELECT * FROM users WHERE employee_no = ?', [employeeNo]);
}

/** 시스템 관리자 — 최초 1회만 시드하고, 이후에는 관리 화면에서 수기로만 변경한다. */
export const INITIAL_ADMIN_EMPLOYEE_NOS = ['024498', '044692'];

/**
 * 관리자 초기 시드. app_meta 플래그로 딱 1번만 실행된다 — 재기동해도 수기 변경을 되돌리지 않는다.
 * 아직 로그인 안 한 사번은 users row 를 미리 만든다(이름은 미러에서, 없으면 자리표시).
 * @param {{ logger?: Console, conn?: import('./db/index.js').DbAdapter, empNos?: string[] }} [options]
 */
export async function seedInitialAdmins({ logger = console, conn = db, empNos } = {}) {
  const list = empNos ?? [...new Set([...INITIAL_ADMIN_EMPLOYEE_NOS, ...env.ADMIN_EMPLOYEE_NOS])];
  const flag = await conn.get(`SELECT value FROM app_meta WHERE key = 'admin_seed_done'`);
  if (flag) return { seeded: false };
  await conn.transaction(async (tx) => {
    const c = tx || conn;
    for (const empNo of list) {
      const existing = await c.get('SELECT employee_no FROM users WHERE employee_no = ?', [empNo]);
      if (existing) {
        await c.run(`UPDATE users SET role = 'admin' WHERE employee_no = ?`, [empNo]);
      } else {
        const m = await c.get(`SELECT emp_nm, blng_brcd, blng_nm, abnm_jtm FROM ${MIRROR_TABLE} WHERE emp_no = ?`, [empNo]);
        await c.run(
          `INSERT INTO users(employee_no, name, org_cd, org_nm, position, role, created_at) VALUES (?,?,?,?,?,'admin',?)`,
          [empNo, m?.emp_nm || `(미로그인 ${empNo})`, m?.blng_brcd || null, m?.blng_nm || null, m?.abnm_jtm || null, nowIso()],
        );
      }
    }
    await c.run(`INSERT INTO app_meta(key, value) VALUES ('admin_seed_done', ?)`, [nowIso()]);
  });
  logger.log(`[roles] 시스템 관리자 초기 시드: ${list.join(', ')} — 이후 변경은 관리 화면에서 수기로만`);
  return { seeded: true, empNos: list };
}

// ── 동기화 1회 실행 ────────────────────────────────────────────────
let syncInFlight = null;
let lastSyncFailedAt = 0;
/** 이 프로세스에서 마지막으로 끝난 동기화 결과 (관리 화면 표시용 — 재기동하면 사라지고, 미러의 synced_at 만 남는다) */
let lastSyncResult = null;

/**
 * HR 동기화 1회. 절대 throw 하지 않는다 — 항상 결과 객체를 반환한다.
 * HR_DB_HOST 미설정: 개발에서는 목업으로 시드, 운영에서는 경고 후 스킵.
 * @param {{ logger?: Console, trigger?: string }} [options]
 */
export async function runHrSync({ logger = console, trigger = 'manual' } = {}) {
  const started = Date.now();
  const done = (partial) => ({
    ok: false, fetched: 0, excluded: 0, mirrored: 0, updatedUsers: 0, adminGranted: 0, brmGranted: 0, brmRevoked: 0, brmProvisioned: 0,
    durationMs: Date.now() - started, error: null, source: env.HR_DB_HOST ? 'hr-db' : 'mock', trigger, ...partial,
  });
  try {
    let raw;
    if (!env.HR_DB_HOST) {
      if (env.isProd) {
        logger.warn('[hr-sync] HR_DB_HOST 미설정 — 운영에서는 목업 시드를 하지 않아요. 동기화 스킵.');
        return done({ ok: true, skipped: true });
      }
      raw = MOCK_EMPLOYEES;
    } else {
      raw = await fetchHrEmployees(logger);
    }

    let excluded = 0;
    const rows = [];
    for (const r of raw) {
      const n = normalizeHrRow(r);
      if (n === EXCLUDED) excluded += 1;
      else if (n) rows.push(n);
    }

    const result = await db.transaction(async (tx) => {
      const conn = tx || db;
      const prev = await conn.get(`SELECT COUNT(*) AS cnt FROM ${MIRROR_TABLE}`);
      const breach = describeMirrorGuardBreach(Number(prev?.cnt) || 0, rows.length);
      if (breach && env.HR_SYNC_ALLOW_SHRINK !== '1') {
        throw new Error(`${breach} 동기화를 중단해요 (강행: HR_SYNC_ALLOW_SHRINK=1).`);
      }
      const mirrored = await replaceMirrorRows(conn, rows);
      const updatedUsers = await propagateToUsers(conn);
      const roles = await syncRoles(conn); // admin·brm 권한은 미러링 때마다 재계산
      return { mirrored, updatedUsers, adminGranted: roles.adminGranted, brmGranted: roles.granted, brmRevoked: roles.revoked, brmProvisioned: roles.provisioned };
    });

    logger.log(`[hr-sync] ok (${trigger}) 조회 ${raw.length}건 / 제외 ${excluded}건 / 미러 ${result.mirrored}건 / 직원 갱신 ${result.updatedUsers}건 / 관리자 부여 ${result.adminGranted} / BRM 부여 ${result.brmGranted}·회수 ${result.brmRevoked} / 사전 생성 ${result.brmProvisioned}`);
    return done({ ok: true, fetched: raw.length, excluded, ...result });
  } catch (e) {
    lastSyncFailedAt = Date.now();
    logger.error(`[hr-sync] 실패 (${trigger}): ${e.message}`);
    return done({ error: e.message });
  }
}
// runHrSync 는 throw 하지 않으므로 결과를 항상 기록할 수 있다
export async function runHrSyncTracked(options) {
  const r = await runHrSync(options);
  lastSyncResult = { ...r, finishedAt: nowIso() };
  return r;
}

/**
 * 수동 동기화(관리 화면 버튼). 이미 도는 중이면 그 Promise 를 같이 기다린다 — 버튼 연타·동시 클릭에도 한 번만 돈다.
 * 실패 백오프(10분)는 무시한다: 사람이 눌렀으면 지금 다시 시도하는 게 맞다.
 */
export function runHrSyncManual({ logger = console, by = '' } = {}) {
  if (!syncInFlight) {
    syncInFlight = runHrSyncTracked({ logger, trigger: by ? `manual:${by}` : 'manual' }).finally(() => { syncInFlight = null; });
  }
  return syncInFlight;
}

/** 관리 화면용 미러 상태 — 건수, 마지막 동기화 시각(미러 기준), 진행 중 여부, 이 프로세스의 마지막 결과 */
export async function getHrSyncStatus() {
  const row = await db.get(`SELECT COUNT(*) AS cnt, MAX(synced_at) AS at FROM ${MIRROR_TABLE}`);
  return {
    count: Number(row?.cnt) || 0,
    syncedAt: row?.at || null,
    inFlight: !!syncInFlight,
    source: env.HR_DB_HOST ? 'hr-db' : 'mock',
    scheduled: !!env.HR_DB_HOST,
    staleHours: env.HR_SYNC_STALE_HOURS,
    last: lastSyncResult,
  };
}

/**
 * 필요할 때만 동기화. 기동/로그인 경로에서 호출한다.
 * - 미러가 비어 있으면 **기다린다** — 안 그러면 그 사용자가 직책 없이 들어온다 (최초 배포 직후).
 * - 오래됐으면 fire-and-forget — 로그인 응답을 인사 DB 전량 조회만큼 늦출 이유가 없다.
 * - 이미 도는 중이면 그 Promise 재사용 (동시 로그인 폭주 방지). 실패는 10분 백오프.
 */
export async function syncIfStale({ logger = console } = {}) {
  let empty = true, ageMs = null;
  try {
    const row = await db.get(`SELECT COUNT(*) AS cnt, MAX(synced_at) AS at FROM ${MIRROR_TABLE}`);
    empty = !Number(row?.cnt);
    if (!empty && row.at) ageMs = Math.max(0, Date.now() - Date.parse(row.at));
  } catch (e) {
    logger.warn(`[hr-sync] 미러 상태 확인 실패 — 스킵: ${e.message}`);
    return { triggered: false };
  }

  const staleMs = env.HR_SYNC_STALE_HOURS * 3600 * 1000;
  if (!empty && ageMs !== null && ageMs < staleMs) return { triggered: false };

  if (!syncInFlight) {
    if (Date.now() - lastSyncFailedAt < FAILED_SYNC_RETRY_MS) return { triggered: false };
    syncInFlight = runHrSyncTracked({ logger, trigger: empty ? 'empty' : 'stale' }).finally(() => { syncInFlight = null; });
  }
  if (empty) { await syncInFlight; return { triggered: true, awaited: true }; }
  syncInFlight.catch(() => {});
  return { triggered: true, awaited: false };
}

// ── 매일 07:00 KST 스케줄러 (의존성 0 — setTimeout) ────────────────
const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** @param {number} [nowMs] */
export function computeNextRunDelayMs(nowMs = Date.now(), hour = 7, minute = 0) {
  const kstNow = nowMs + KST_OFFSET_MS;
  let target = Math.floor(kstNow / DAY_MS) * DAY_MS + (hour * 60 + minute) * 60 * 1000;
  if (target <= kstNow) target += DAY_MS;
  return target - kstNow;
}

/** 운영에서는 OS cron 으로 `npm run hr:sync` 를 대신 돌려도 동일하다. */
export function scheduleDailyHrSync({ logger = console } = {}) {
  const arm = () => {
    const delay = computeNextRunDelayMs();
    logger.log(`[hr-sync] 다음 자동 동기화: ${Math.round(delay / 60000)}분 후 (매일 07:00 KST)`);
    const t = setTimeout(async () => { await runHrSyncTracked({ logger, trigger: 'schedule' }); arm(); }, delay);
    if (typeof t.unref === 'function') t.unref();
  };
  arm();
}
