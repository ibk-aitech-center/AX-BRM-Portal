/**
 * 보호 API 인증 — 호출마다 Bearer 토큰을 재검증한다 (SSO연동가이드 §7).
 * 로그인 응답의 플래그를 믿지 않는다. 판정의 진실은 항상 서버 + DB(users.role).
 */
import { env } from './env.js';
import { db } from './db/index.js';
import { verifySsoToken, bearerFrom, SsoError } from './ssoAuth.js';
import { DATA_BRM_ROLE, isDataRequestRow } from './dataBrm.js';
import { MIRROR_TABLE, isHqOrg } from './hrSync.js';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
  }
}

/**
 * users 행 + HR 미러의 조직속성코드(ogzn_attcd) — 요청 자격(canRequest) 판정에 쓴다.
 * users 에 복사하지 않고 매번 JOIN 한다: 미러가 진실이고, 미러에서 빠진 직원(외주·전출)에게 옛 자격이 남지 않도록.
 * @param {string} employeeNo
 */
export function findUserWithHr(employeeNo) {
  return db.get(
    `SELECT u.*, h.ogzn_attcd FROM users u LEFT JOIN ${MIRROR_TABLE} h ON h.emp_no = u.employee_no WHERE u.employee_no = ?`,
    [employeeNo],
  );
}

/**
 * @param {any} row users 행 (findUserWithHr 로 읽으면 ogzn_attcd 가 함께 온다 — 없으면 canRequest 는 false)
 * canRequest: 본부부서 직원만 상담을 요청할 수 있다 (hrSync.HQ_OGZN_ATTCDS). 역할과 무관 — admin·brm 도 같은 규칙.
 */
export function toUser(row) {
  return row
    ? { employeeNo: row.employee_no, name: row.name, orgCd: row.org_cd, orgNm: row.org_nm, position: row.position ?? null, role: row.role, canRequest: isHqOrg(row.ogzn_attcd) }
    : null;
}

/** @type {import('express').RequestHandler} */
export async function requireAuth(req, res, next) {
  try {
    const token = bearerFrom(req);
    if (!token) throw new HttpError(401, '로그인이 필요해요', 'AUTH_REQUIRED');
    const claims = verifySsoToken(token, { sign: env.SSO_JWT_SIGN, clockSkewSeconds: env.SSO_CLOCK_SKEW_SECONDS });
    const row = await findUserWithHr(claims.employeeNo);
    if (!row) throw new HttpError(401, '사용자 정보가 없어요. 다시 로그인해 주세요', 'USER_NOT_PROVISIONED');
    req.user = toUser(row);
    next();
  } catch (e) {
    if (e instanceof SsoError) return res.status(e.status).json({ error: e.code, message: e.message });
    next(e);
  }
}

/** 역할 목록 — users.role. requester(일반) · brm(AX-BRM, HR 동기화가 재계산) · data_brm(DATA-BRM 조회 전용, 수기) · admin(시스템 담당자, 수기) */
export const ROLES = ['requester', 'brm', DATA_BRM_ROLE, 'admin'];

export const isBrm = (u) => u && (u.role === 'brm' || u.role === 'admin');
/** DATA-BRM — 데이터가 필요한(또는 모르겠다고 답한) 요청만 조회. AX-BRM 권한과 겹치지 않는다 */
export const isDataBrm = (u) => u && u.role === DATA_BRM_ROLE;

/**
 * 요청 하나를 읽을 수 있는지 — 요청자 본인 · AX-BRM/관리자 전부 · DATA-BRM 은 데이터 관련 건만.
 * 쓰기(의견·상태·담당자·첨부·대화)는 각 라우트가 own/isBrm 으로 따로 막는다 — DATA-BRM 은 어디서도 쓰지 못한다.
 * @param {{ employeeNo: string, role: string } | null | undefined} user
 * @param {{ requester_employee_no?: string, status?: string, answers?: string | Record<string, unknown> | null } | null | undefined} row
 */
export function canReadRequest(user, row) {
  if (!user || !row) return false;
  if (row.requester_employee_no === user.employeeNo) return true;
  if (isBrm(user)) return true;
  if (isDataBrm(user)) return isDataRequestRow(row);
  return false;
}

/** @type {import('express').RequestHandler} */
export function requireBrm(req, res, next) {
  if (!isBrm(req.user)) return next(new HttpError(403, 'AX-BRM 담당자만 쓸 수 있어요', 'FORBIDDEN'));
  next();
}

/** @type {import('express').RequestHandler} */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return next(new HttpError(403, '관리자만 쓸 수 있어요', 'FORBIDDEN'));
  next();
}

/**
 * 상담 요청 쓰기(생성·초안 저장·신청)는 본부부서 직원만 — 화면을 우회한 직접 호출도 여기서 막힌다.
 * 조회는 막지 않는다. 안내 문구는 화면이 보여 주고, 서버는 코드(HQ_ONLY)로만 알린다.
 * @type {import('express').RequestHandler}
 */
export function requireRequester(req, res, next) {
  if (!req.user?.canRequest) return next(new HttpError(403, 'AX-BRM 포탈은 본부부서를 대상으로 운영되는 시스템이에요. 업무 개선 아이디어는 지식제안을 통해 진행해 주세요.', 'HQ_ONLY'));
  next();
}
