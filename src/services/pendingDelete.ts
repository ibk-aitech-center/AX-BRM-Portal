/**
 * "지우기 → 실행 취소" 창 관리 — 목록에서는 바로 사라지지만 서버 DELETE 는 잠시(8초) 뒤에 보낸다.
 *
 * 화면 안에서 setTimeout 으로만 미루면 두 가지 문제가 있다.
 *  1) 8초 안에 다른 화면(홈)으로 가면 그 화면이 서버에서 목록을 다시 읽어 "지운" 초안이 되살아 보인다.
 *  2) 8초 안에 새로고침·탭 닫기를 하면 DELETE 가 아예 나가지 않아 초안이 남는다.
 * 그래서 대기 중인 삭제를 전역으로 두고,
 *  - 목록을 그리는 화면은 isPendingDelete() 인 항목을 숨기고(서버 응답에 아직 있어도),
 *  - 화면을 떠날 때(router.beforeEach)와 페이지를 닫을 때(pagehide) 기다리지 않고 바로 보낸다.
 * 성공한 id 는 세션 동안 '지워짐' 표식으로 남겨, 삭제 직후 도착한 목록 응답에 섞여 있어도 다시 나타나지 않게 한다.
 */
import { reactive } from 'vue';
import { api } from './api';

type Entry = { timer: ReturnType<typeof setTimeout> | null; state: 'waiting' | 'sending' | 'done'; onError?: (e: unknown) => void };

const entries = reactive(new Map<string, Entry>());

/** 목록 필터용 — 지우기로 사라졌거나 지워지는 중이면 true */
export function isPendingDelete(id: string): boolean {
  return entries.has(id);
}

/** 삭제 예약. ms 뒤(기본 8초)에 DELETE 를 보낸다. 실패하면 목록에 되살리고 onError 를 부른다 */
export function scheduleDelete(id: string, opts: { ms?: number; onError?: (e: unknown) => void } = {}) {
  cancelDelete(id);
  const entry: Entry = { timer: null, state: 'waiting', onError: opts.onError };
  entry.timer = setTimeout(() => void send(id), opts.ms ?? 8000);
  entries.set(id, entry);
}

/** 실행 취소 — 아직 보내지 않았을 때만 되돌릴 수 있다 */
export function cancelDelete(id: string): boolean {
  const e = entries.get(id);
  if (!e || e.state !== 'waiting') return false;
  if (e.timer) clearTimeout(e.timer);
  entries.delete(id);
  return true;
}

async function send(id: string, keepalive = false) {
  const e = entries.get(id);
  if (!e || e.state !== 'waiting') return;
  if (e.timer) clearTimeout(e.timer);
  e.timer = null;
  e.state = 'sending';
  try {
    await api.del(`/api/requests/${id}`, { keepalive });
    e.state = 'done';
  } catch (err) {
    entries.delete(id); // 되살린다
    e.onError?.(err);
  }
}

/** 대기 중인 삭제를 지금 모두 보낸다 — 화면 이동·페이지 종료 시 */
export function flushDeletes(keepalive = false) {
  for (const [id, e] of entries) if (e.state === 'waiting') void send(id, keepalive);
}

if (typeof window !== 'undefined') {
  // 탭 닫기·새로고침·다른 사이트로 이동: keepalive 로 보내면 문서가 내려가도 요청은 살아 나간다
  window.addEventListener('pagehide', () => flushDeletes(true));
}
