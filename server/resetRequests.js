/**
 * 신청 데이터 전체 초기화 — 오픈 전 리얼테스트 데이터를 지울 때. 관리 화면(POST /api/admin/reset-requests)과 CLI(server/scripts/reset-requests.js)가 같이 쓴다.
 *
 * 지움: requests · request_reviews · status_history · comments · attachments(+ UPLOAD_DIR 의 실제 파일) · counters(접수번호 카운터)
 *   → 다음 신청은 BRM-YYYY-0001 부터. (단건 삭제는 counters 를 되감지 않아 번호가 건너뛴다 — 그래서 "전체 초기화"만 제공한다)
 * 남김: users(역할) · tbl_employee_adv(HR 미러) · app_meta(관리자 시드 플래그)
 * 되돌릴 수 없다 — 호출 측이 확인 절차(확인 문구 입력 · --yes)를 책임진다.
 */
import { db } from './db/index.js';
import { removeFile } from './storage.js';

export const RESET_TABLES = ['comments', 'attachments', 'status_history', 'request_reviews', 'requests', 'counters'];
/** 관리 화면·CLI 가 실제 초기화 전에 요구하는 확인 문구 */
export const RESET_CONFIRM_WORD = '초기화';

/** 지울 대상 건수 — 확인 화면용 */
export async function countResetTargets(conn = db) {
  const counts = {};
  for (const t of RESET_TABLES) counts[t] = Number((await conn.get(`SELECT COUNT(*) AS n FROM ${t}`)).n);
  return counts;
}

/**
 * 실제 초기화. DB 는 한 트랜잭션, 첨부 파일은 커밋 뒤 정리(하나 실패해도 계속).
 * @returns {Promise<{ counts: Record<string, number>, filesRemoved: number, filesTotal: number, nextReqNo: string }>}
 */
export async function resetRequests({ conn = db, logger = console, by = 'cli' } = {}) {
  const counts = await countResetTargets(conn);
  const files = await conn.all('SELECT storage_path FROM attachments');
  await conn.transaction(async (tx) => {
    const c = tx || conn;
    for (const t of RESET_TABLES) await c.run(`DELETE FROM ${t}`);
  });
  let filesRemoved = 0;
  for (const f of files) { try { removeFile(f.storage_path); filesRemoved++; } catch { /* noop */ } }
  const nextReqNo = `BRM-${new Date().getFullYear()}-0001`;
  logger.warn(`[reset] 신청 데이터 전체 초기화 by ${by} — ${JSON.stringify(counts)} · 첨부 파일 ${filesRemoved}/${files.length} · 다음 접수번호 ${nextReqNo}`);
  return { counts, filesRemoved, filesTotal: files.length, nextReqNo };
}
