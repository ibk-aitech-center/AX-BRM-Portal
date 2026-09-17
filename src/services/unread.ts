/**
 * 미읽음 건수 — 상단 메뉴 배지용. 역할 scope(all=접수함 · data=데이터 요청 · status=접수현황 조회)별 **신규(한 번도 안 연)** 건수만.
 * 갱신 타이밍: 세션이 ready 된 뒤 1회 + 화면 이동(router.afterEach)마다 + 상세 진입·전체 읽음 처리 뒤 명시 호출. 폴링은 없다(폐쇄망·단순성).
 * 서버 판정은 server/unread.js.
 */
import { reactive, watch } from 'vue';
import { api } from './api';
import { session } from './session';

export type UnreadState = 'new' | 'updated' | null;
export type UnreadScope = 'all' | 'data' | 'status';

export const unread = reactive<{ counts: Partial<Record<UnreadScope, number>>; refresh: () => Promise<void> }>({
  counts: {},
  async refresh() {
    if (session.phase !== 'ready') return;
    try { unread.counts = await api.get<Partial<Record<UnreadScope, number>>>('/api/requests/unread-count'); }
    catch { /* 배지는 부가 정보 — 실패해도 화면은 그대로 */ }
  },
});

/** 점·범례가 같이 쓰는 문구 — 색은 components.css 의 .unread-dot 토큰(new 빨강 · updated 노랑) */
export const UNREAD_LABEL: Record<Exclude<UnreadState, null>, string> = {
  new: '새로 접수돼 아직 열어 보지 않은 건',
  updated: '열어 본 뒤 상태·의견·대화·첨부가 바뀐 건',
};

watch(() => session.phase, (p) => { if (p === 'ready') unread.refresh(); }, { immediate: true });

/** 전체 읽음 처리 — 그 메뉴에서 볼 수 있는 전부(신규·업데이트). 목록 재조회는 호출 쪽이 한다 */
export async function markAllRead(scope: UnreadScope): Promise<number> {
  const r = await api.post<{ ok: true; marked: number }>('/api/requests/read-all', { scope });
  await unread.refresh();
  return r.marked;
}
