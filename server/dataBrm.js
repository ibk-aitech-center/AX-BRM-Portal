/**
 * DATA-BRM — 데이터 담당 부서의 "조회 전용" 역할 (users.role = 'data_brm', 시스템 담당자가 관리 화면에서 수기로 부여).
 *
 * 볼 수 있는 요청: 요청자가 "행내 데이터가 필요한가요?"(q9_data) 에 **네(yes)** 또는 **잘 모르겠어요(unknown)** 로 답한 건.
 *   - 초안(draft)은 제외 — 신청이 확정된 것만.
 *   - 조회만 한다: 의견·상태·담당자·목업·대화 어느 것도 쓰지 않는다. 처리 상황은 AX-BRM 이 종합해서 등록한다.
 *   - 접수될 때 한 번만 메신저 알림을 받는다 (server/notify.js notifyNewRequest).
 *
 * 판정 기준을 한 곳에 두어 목록 SQL · 상세 권한 · 알림 수신자가 어긋나지 않게 한다.
 * (역할 재계산은 HR 동기화가 requester↔brm 만 건드리므로 data_brm 은 그대로 남는다 — server/hrSync.js syncBrmRoles)
 */

export const DATA_BRM_ROLE = 'data_brm';

/** q9_data 값 중 DATA-BRM 이 볼 수 있는 값 */
export const DATA_ANSWER_VALUES = ['yes', 'unknown'];

/** @param {Record<string, unknown> | null | undefined} answers */
export function isDataAnswers(answers) {
  return !!answers && DATA_ANSWER_VALUES.includes(String(answers.q9_data ?? ''));
}

/**
 * requests 행이 DATA-BRM 조회 대상인지 — answers 는 JSON 문자열(DB) 또는 객체 둘 다 받는다.
 * @param {{ status?: string, answers?: string | Record<string, unknown> | null } | null | undefined} row
 */
export function isDataRequestRow(row) {
  if (!row || row.status === 'draft') return false;
  let a = row.answers;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
  return isDataAnswers(/** @type {any} */ (a));
}

/**
 * 목록 SQL 조건 — answers 는 JSON.stringify 로 저장돼 `"q9_data":"yes"` 처럼 공백 없이 들어 있다 (SQLite · PostgreSQL 공통 LIKE).
 * 초안 제외 조건은 호출 쪽에서 status <> 'draft' 로 같이 건다.
 */
export const DATA_REQUEST_SQL = `(${DATA_ANSWER_VALUES.map((v) => `answers LIKE '%"q9_data":"${v}"%'`).join(' OR ')})`;

/**
 * 접수 알림 수신자 — users 의 data_brm 전원 (수기 부여라 HR 미러 규칙은 없다).
 * @param {{ all: (sql: string, params?: unknown[]) => Promise<any[]> }} conn
 * @returns {Promise<string[]>}
 */
export async function listDataBrmRecipients(conn) {
  const rows = await conn.all(`SELECT employee_no FROM users WHERE role = ?`, [DATA_BRM_ROLE]);
  return rows.map((r) => String(r.employee_no));
}
