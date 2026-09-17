/**
 * 유효 판정 — 신청 시 자동 판정(requests.judgement) 위에 AX-BRM 이 의견 등록 때 조정한 값(request_reviews.judgement_override)을 덮은 것.
 *
 * 조정은 원 판정을 덮어쓰지 않고 의견 행에 따로 남는다(이력 보존). 그래서 "지금 유효한 판정"은 항상 여기서 합쳐서 낸다:
 *   목록(접수함·내 요청·홈·접수현황·데이터 요청) · 상세 · 통계(요청 유형 분포 등) · CSV 가 전부 같은 값을 보도록. (2026-09-17 — 이전엔 상세 화면만 합쳤다)
 * 조정이 여러 번이면 **가장 최근 의견**의 조정이 이긴다.
 */
import { parseJson } from './db/index.js';

/**
 * 의견 행들 중 가장 최근 조정 하나 — 정렬 순서와 무관하게 created_at 으로 고른다.
 * @param {Array<{ judgement_override?: string | object | null, created_at?: string }>} reviews
 * @returns {Record<string, unknown> | null}
 */
export function latestOverride(reviews) {
  let best = null;
  for (const r of reviews || []) {
    const o = parseJson(r.judgement_override, null);
    if (!o || typeof o !== 'object' || !Object.keys(o).length) continue;
    if (!best || String(r.created_at || '') > String(best.created_at || '')) best = { created_at: r.created_at, o };
  }
  return best ? best.o : null;
}

/**
 * @template T
 * @param {T | null} judgement 원 판정
 * @param {Record<string, unknown> | null | undefined} override
 * @returns {T | null}
 */
export function mergeJudgement(judgement, override) {
  if (!judgement) return judgement;
  return override ? /** @type {T} */ ({ ...judgement, ...override }) : judgement;
}

/**
 * 요청 id 들의 최근 조정을 한 번에 — 목록·통계가 쓴다.
 * @param {{ all: (sql: string, params?: unknown[]) => Promise<any[]> }} conn
 * @param {string[]} ids
 * @returns {Promise<Map<string, Record<string, unknown>>>}
 */
export async function loadOverrides(conn, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const byReq = new Map();
  // 한 번에 500건(목록 상한) — 파라미터 수 제한(SQLite 기본 999 등)을 넘지 않게 나눠 묻는다
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await conn.all(
      `SELECT request_id, judgement_override, created_at FROM request_reviews WHERE judgement_override IS NOT NULL AND request_id IN (${chunk.map(() => '?').join(',')})`,
      chunk,
    );
    for (const r of rows) { if (!byReq.has(r.request_id)) byReq.set(r.request_id, []); byReq.get(r.request_id).push(r); }
  }
  for (const [id, rs] of byReq) { const o = latestOverride(rs); if (o) map.set(id, o); }
  return map;
}
