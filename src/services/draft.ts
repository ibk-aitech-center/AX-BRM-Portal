/**
 * 인터뷰 초안 상태 — 서버가 진실, localStorage 는 오프라인 복구용 미러.
 * 자동저장(디바운스 700ms) + "저장됨 · 방금" 표시. 저장 실패 시 토큰은 건드리지 않고 미러에만 남긴다.
 */
import { reactive } from 'vue';
import { api, ApiError, humanMessage } from './api';
import { pruneAnswers } from '@shared/questions.js';
import type { Answers, RequestFull } from '@/types';
import { toast } from './toast';

export const draft = reactive({
  id: null as string | null,
  answers: {} as Answers,
  status: 'draft',
  savedAt: null as string | null,
  saving: false,
  dirty: false,
  offline: false,
});

const mirrorKey = (id: string) => `aiBrm.draft.${id}`;
function writeMirror() {
  if (!draft.id) return;
  try { localStorage.setItem(mirrorKey(draft.id), JSON.stringify({ answers: draft.answers, updatedAt: new Date().toISOString() })); } catch { /* 저장 공간 없음 등 */ }
}
function readMirror(id: string): { answers: Answers; updatedAt: string } | null {
  try { const raw = localStorage.getItem(mirrorKey(id)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function clearMirror(id: string) { try { localStorage.removeItem(mirrorKey(id)); } catch { /* noop */ } }

export async function createDraft(preset: Answers = {}): Promise<string> {
  const { request } = await api.post<{ request: RequestFull }>('/api/requests', { answers: preset });
  draft.id = request.id; draft.answers = request.answers; draft.status = request.status;
  draft.savedAt = request.updatedAt; draft.dirty = false; draft.offline = false;
  return request.id;
}

export async function loadDraft(id: string): Promise<RequestFull> {
  const { request } = await api.get<{ request: RequestFull }>(`/api/requests/${id}`);
  draft.id = request.id; draft.status = request.status; draft.savedAt = request.updatedAt; draft.dirty = false; draft.offline = false;
  draft.answers = request.answers;
  if (request.status === 'draft') {
    const m = readMirror(id);
    if (m && m.updatedAt > request.updatedAt && JSON.stringify(m.answers) !== JSON.stringify(request.answers)) {
      draft.answers = pruneAnswers(m.answers); draft.dirty = true; scheduleSave(0);
      toast('저장되지 않았던 답변을 복구했어요.', 'info');
    }
  }
  return request;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let warned = false;
let creating: Promise<string> | null = null;
export function scheduleSave(ms = 700) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(saveNow, ms);
}

/** 초안은 첫 답변이 생겼을 때에만 서버에 만든다 — 빈 초안이 쌓이지 않게 (동시 호출 가드 포함) */
async function ensureDraft(): Promise<string> {
  if (draft.id) return draft.id;
  if (!creating) {
    creating = api.post<{ request: RequestFull }>('/api/requests', { answers: draft.answers })
      .then(({ request }) => { draft.id = request.id; draft.status = request.status; draft.savedAt = request.updatedAt; return request.id; })
      .finally(() => { creating = null; });
  }
  return creating;
}

export async function saveNow(): Promise<boolean> {
  if (draft.status !== 'draft') return true;
  if (!draft.id && Object.keys(draft.answers).length === 0) return true; // 아무 입력도 없으면 저장하지 않는다
  if (timer) { clearTimeout(timer); timer = null; }
  draft.saving = true;
  try {
    if (!draft.id) await ensureDraft();
    const { request } = await api.put<{ request: RequestFull }>(`/api/requests/${draft.id}`, { answers: draft.answers });
    draft.savedAt = request.updatedAt; draft.dirty = false; draft.offline = false; warned = false;
    writeMirror();
    return true;
  } catch (e) {
    if (e instanceof ApiError && (e.isNetworkError || (e.status && e.status >= 500))) {
      draft.offline = true;
      if (!warned) { warned = true; toast('서버에 연결하지 못해 이 컴퓨터에만 임시 저장했어요. 연결되면 자동으로 다시 저장해요.', 'warning'); }
      scheduleSave(5000);
    } else {
      toast(humanMessage(e), 'danger');
    }
    return false;
  } finally { draft.saving = false; }
}

export function setAnswer(qid: string, value: string) {
  draft.answers = pruneAnswers({ ...draft.answers, [qid]: value });
  draft.dirty = true;
  writeMirror();
  scheduleSave();
}

export function resetDraft() {
  if (timer) { clearTimeout(timer); timer = null; }
  draft.id = null; draft.answers = {}; draft.status = 'draft'; draft.savedAt = null; draft.dirty = false; draft.offline = false;
}
