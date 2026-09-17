/**
 * 미읽음 — 역할 화면(접수함·데이터 요청·접수현황 조회) 사용자별 "아직 안 본 건 / 본 뒤 바뀐 건".
 *
 * request_reads(request_id, employee_no, read_at) 에 **상세를 연 시각**만 기록한다. 판정은 그 시각과 requests.updated_at 비교:
 *   기록 없음                      → 'new'      (한 번도 안 열어 본 신규 접수 건)
 *   updated_at > read_at           → 'updated'  (열어 봤지만 그 뒤 상태·의견·대화·첨부가 바뀐 건 — 쓰기 라우트가 updated_at 을 올린다)
 *   그 외                          → null
 * 상단 메뉴 배지는 'new' 만 센다(2026-09-18 결정). 목록은 두 상태를 다른 색으로 보여 준다.
 * 요청자 본인 건("내 요청")은 기록하지 않는다 — 조회 전용 역할(DATA-BRM·그룹기획)도 기록한다: 자기 열람 흔적일 뿐 요청 데이터를 바꾸지 않는다.
 */
import { nowIso } from './db/index.js';

/** @typedef {'new' | 'updated' | null} UnreadState */

/**
 * @param {{ updated_at?: string | null } | null | undefined} row
 * @param {string | null | undefined} myReadAt
 * @returns {UnreadState}
 */
export function unreadState(row, myReadAt) {
  if (!row) return null;
  if (!myReadAt) return 'new';
  return String(row.updated_at || '') > String(myReadAt) ? 'updated' : null;
}

/** 목록 SQL 조각 — requests 별칭 r, request_reads 별칭 rr. 사번은 파라미터로 */
export const READ_JOIN_SQL = 'LEFT JOIN request_reads rr ON rr.request_id = r.id AND rr.employee_no = ?';
export const NEW_SQL = 'rr.read_at IS NULL';
export const UPDATED_SQL = '(rr.read_at IS NOT NULL AND r.updated_at > rr.read_at)';

/**
 * 읽음 기록(upsert) — SQLite·PostgreSQL 공통 ON CONFLICT 문법.
 * @param {{ run: (sql: string, params?: unknown[]) => Promise<any> }} conn
 * @param {string[]} requestIds
 * @param {string} employeeNo
 */
export async function markRead(conn, requestIds, employeeNo) {
  const at = nowIso();
  for (const id of requestIds) {
    await conn.run(
      `INSERT INTO request_reads(request_id, employee_no, read_at) VALUES (?,?,?)
       ON CONFLICT(request_id, employee_no) DO UPDATE SET read_at = excluded.read_at`,
      [id, employeeNo, at],
    );
  }
  return at;
}
