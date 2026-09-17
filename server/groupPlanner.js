/**
 * 그룹기획 — 접수현황 "조회 전용" 역할 (users.role = 'group_planner', 시스템 담당자가 관리 화면에서 수기로 부여).
 *
 * 볼 수 있는 요청: **신청된 모든 건** (초안 제외). DATA-BRM 이 데이터 관련 건만 보는 것과 달리 조건이 없다.
 *   - 조회만 한다: 의견·상태·담당자·목업·대화 어느 것도 쓰지 않는다 — 쓰기 라우트는 전부 own/isBrm 으로 막혀 있다.
 *   - 접수 알림은 받지 않는다 (요청과 무관하게 현황을 살펴보는 역할).
 *   - HR 동기화(syncRoles)는 requester↔brm 만 건드리므로 group_planner 는 그대로 남는다 (data_brm 과 같다).
 */

export const GROUP_PLANNER_ROLE = 'group_planner';

/** @param {{ role?: string } | null | undefined} u */
export const isGroupPlanner = (u) => !!u && u.role === GROUP_PLANNER_ROLE;

/**
 * requests 행이 그룹기획 조회 대상인지 — 신청이 확정된 건 전부.
 * @param {{ status?: string } | null | undefined} row
 */
export function isGroupPlannerReadable(row) {
  return !!row && row.status !== 'draft';
}
