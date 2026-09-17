<script setup lang="ts">
import RevealButton from '@/components/RevealButton.vue';
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, humanMessage, downloadWithAuth } from '@/services/api';
import { toast } from '@/services/toast';
import { session, isAdmin } from '@/services/session';
import type { RequestDetail, Attachment, Judgement, AssigneeCandidate, Review, HistoryItem } from '@/types';
import { STATUS, DECISION, FEASIBLE, MANUAL_TRANSITIONS, CHANNEL_LABEL } from '@shared/statuses.js';
import { CLOSURE_DEPLOY, CLOSURE_FORM, closureLabel } from '@shared/closure.js';
import { SECTIONS, visibleQuestions, formatAnswer, getQuestion } from '@shared/questions.js';
import { TRACK_LABEL, DATACASE_LABEL, INTEGRATION_LABEL } from '@shared/rules.js';
import BrmShell from '@/components/BrmShell.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import SubmitButton from '@/components/SubmitButton.vue';
import SegControl from '@/components/SegControl.vue';
import JudgementPanel from '@/components/JudgementPanel.vue';
import AppModal from '@/components/AppModal.vue';
import AppDrawer from '@/components/AppDrawer.vue';
import { openMockupWindow } from '@/services/mockupWindow';
import FileUpload from '@/components/FileUpload.vue';
import { fmtDate, fmtBytes } from '@/services/format';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const d = ref<RequestDetail | null>(null);
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const comment = ref('');
const statusTo = ref<string | null>(null); // 단계 이동 모달 대상
const statusNote = ref('');
// 종결 분류 — 완료로 옮길 때 필수로 고르고, 완료된 뒤에는 "종결 분류" 카드에서 정정한다
type LD = { label: string; desc: string };
const CD = CLOSURE_DEPLOY as Record<string, LD>; const CF = CLOSURE_FORM as Record<string, LD>;
const deployOpts = Object.entries(CD).map(([value, v]) => ({ value, label: v.label }));
const formOpts = Object.entries(CF).map(([value, v]) => ({ value, label: v.label }));
const closurePick = reactive({ deploy: '' as string, form: '' as string });
const closureBusy = ref(false);
const closureChanged = computed(() => {
  const c = d.value?.request.closure; if (!c) return false;
  return closurePick.deploy !== c.deploy || closurePick.form !== c.form;
});

// 단계 이동 스테퍼 — 전체 경로에서 현재 위치와 이동 가능한 단계를 한눈에 보여준다.
// (보류·반려는 검토 "결정"으로 가는 곁가지라 경로에 그리지 않고 배지로 표시)
const MAIN_PATH = ['submitted', 'reviewing', 'accepted', 'developing', 'done'];
const pathIdx = computed(() => MAIN_PATH.indexOf(d.value?.request.status || ''));
const offPath = computed(() => !!d.value && d.value.request.status !== 'draft' && pathIdx.value < 0);
const canGo = (st: string) => (MT[d.value?.request.status || ''] || []).includes(st);
const stepState = (st: string, i: number) => {
  if (st === d.value?.request.status) return 'current';
  if (pathIdx.value >= 0 && i < pathIdx.value) return 'done';
  return canGo(st) ? 'next' : 'todo';
};
const S = STATUS as Record<string, { label: string; desc: string }>;
const DEC = DECISION as Record<string, { label: string; to: string | null }>;
const FEA = FEASIBLE as Record<string, { label: string }>;
const CH = CHANNEL_LABEL as Record<string, string>;
const MT = MANUAL_TRANSITIONS as Record<string, string[]>;
type L = { label: string; plain: string };
const DL = DATACASE_LABEL as Record<string, L>; const IL = INTEGRATION_LABEL as Record<string, L>;
// 단일 선택 자리는 세그먼트 컨트롤로 — 잉크 필이 미끄러지는 공용 모션 (SegControl)
const decisionOpts = Object.entries(DEC).map(([value, v]) => ({ value, label: v.label }));
const feasibleOpts = Object.entries(FEA).map(([value, v]) => ({ value, label: v.label }));

const form = reactive({ decision: 'note', feasible: 'tbd', approach: '', opinion: '', min: '' as string | number, max: '' as string | number, override: false, track: '', dataCase: '', integration: '' });

// 담당자 후보 — HR 미러의 AX디지털추진부(1094) 직원(부장 제외), 조직·직원 정렬순서 그대로. 팀별로 묶어 보여준다
const candidates = ref<AssigneeCandidate[]>([]);
const candidateGroups = computed(() => {
  const groups: { team: string; items: AssigneeCandidate[] }[] = [];
  for (const c of candidates.value) {
    const team = c.teamNm || '팀 미지정';
    const last = groups[groups.length - 1];
    if (last && last.team === team) last.items.push(c); else groups.push({ team, items: [c] });
  }
  return groups;
});
const personLabel = (p: { name?: string | null; position?: string | null } | null | undefined) => p ? `${p.name ?? ''}${p.position ? ' ' + p.position : ''}` : '';
// 담당자 지정은 의견·상태와 분리된 폼 — 먼저 담당자를 정하고, 그 담당자가 아래에서 의견을 적는 흐름
const assigneePick = ref('');
const assigneeBusy = ref(false);
const pickedCandidate = computed(() => candidates.value.find((c) => c.employeeNo === assigneePick.value));
/** 현재 담당자와 다르게 골랐는지 — 안내 문구·토스트에 쓴다 */
const assigneeChanged = computed(() => assigneePick.value !== (d.value?.request.assignee?.employeeNo ?? ''));
/** 지정된 담당자가 본인인지 — 의견 등록 카드의 안내 문구용 */
const iAmAssignee = computed(() => !!d.value?.request.assignee && d.value.request.assignee.employeeNo === session.user?.employeeNo);

async function load() {
  loading.value = true;
  try {
    d.value = await api.get<RequestDetail>(`/api/requests/${id}`);
    const j = d.value.request.judgement;
    if (j) { form.track = j.track; form.dataCase = j.dataCase || ''; form.integration = j.integration || ''; }
    assigneePick.value = d.value.request.assignee?.employeeNo ?? '';
    closurePick.deploy = d.value.request.closure?.deploy ?? ''; closurePick.form = d.value.request.closure?.form ?? '';
  } catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
async function loadCandidates() {
  try { candidates.value = (await api.get<{ items: AssigneeCandidate[] }>('/api/requests/assignees')).items; }
  catch { candidates.value = []; } // 목록이 없어도 검토는 가능 — 셀렉트에 안내만 남긴다
}
onMounted(() => { load(); loadCandidates(); });

const grouped = computed(() => {
  if (!d.value) return [];
  const vis = visibleQuestions(d.value.request.answers);
  return SECTIONS.map((s) => ({ s, qs: vis.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.section === s.key) })).filter((g) => g.qs.length);
});
/** 유효 판정 — 서버가 최근 조정을 이미 덮어서 준다 (server/judgement.js). 화면에서 다시 합치지 않는다 */
const judgement = computed<Judgement | null>(() => d.value?.request.judgement ?? null);
const unknownQs = computed(() => (judgement.value?.unknowns || []).map((qid) => getQuestion(qid)).filter(Boolean));
const mockups = computed(() => (d.value?.attachments || []).filter((a) => a.kind === 'mockup'));

// 이력 서랍 — 의견 이력·상태 이력을 본문에서 떼어 한 타임라인으로 합쳤다(최신 먼저).
// 의견 등록이 상태를 바꾸는 구조라 둘을 시간순으로 섞어 보면 "왜 이 단계가 됐는지"가 한 줄로 읽힌다.
type TlEvent = { kind: 'review'; at: string; review: Review } | { kind: 'status'; at: string; h: HistoryItem };
const drawer = ref<null | 'all' | 'review' | 'status'>(null);
const drawerTabs = [{ value: 'all', label: '전체' }, { value: 'review', label: '의견' }, { value: 'status', label: '상태' }];
const timeline = computed<TlEvent[]>(() => {
  if (!d.value) return [];
  const ev: TlEvent[] = [
    ...d.value.reviews.map((r): TlEvent => ({ kind: 'review', at: r.createdAt, review: r })),
    ...d.value.history.map((h): TlEvent => ({ kind: 'status', at: h.at, h })),
  ];
  return ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
});
const timelineShown = computed(() => (drawer.value && drawer.value !== 'all' ? timeline.value.filter((e) => e.kind === drawer.value) : timeline.value));
const lastReview = computed(() => d.value?.reviews[0] ?? null); // 서버가 최신 먼저 준다
const refs = computed(() => (d.value?.attachments || []).filter((a) => a.kind !== 'mockup'));

// 왼쪽 참조 패널은 요청자 답변 전체가 주인공 — AX-BRM 이 요구사항을 파악하는 데 필요한 건 판정 스냅샷이 아니라 답변 원문이다 (2026-09-08).
// 자동 판정은 맨 아래 접힌 카드로 내려 두고, 필요할 때만 펼쳐 본다.
const visibleCount = computed(() => grouped.value.reduce((n, g) => n + g.qs.length, 0));
const showJudgement = ref(false);
/** 답변이 "모르겠어요" 류인지 — 검토 때 확인할 항목이라 답변 목록에서 눈에 띄게 표시한다 */
const isUnknownAnswer = (qid: string) => ['unknown', 'tbd', 'consult'].includes(d.value?.request.answers[qid] ?? '');

/** 담당자만 저장 — 의견·상태는 건드리지 않는다 */
async function saveAssignee() {
  if (!assigneeChanged.value) return;
  assigneeBusy.value = true;
  try {
    const picked = pickedCandidate.value;
    const r = await api.post<{ notified: 'sent' | 'failed' | 'disabled' | 'skipped' }>(`/api/requests/${id}/assignee`, { employeeNo: assigneePick.value });
    if (!picked) toast('담당자 지정을 해제했어요', 'success');
    else {
      // 서버가 메신저 발송을 끝낸 뒤 결과(notified)를 돌려준다 — "알렸어요" 는 실제로 보냈을 때만
      const who = `담당자를 ${personLabel(picked)}(으)로 지정했어요`;
      if (r.notified === 'sent') toast(`${who} · 메신저로 알렸어요`, 'success');
      else if (r.notified === 'failed') toast(`${who} · 메신저 알림은 실패했어요 — 직접 알려주세요 (서버 로그 [notify] 확인)`, 'warning', { ms: 8000 });
      else if (r.notified === 'disabled') toast(`${who} · 메신저 알림이 꺼져 있어요 (ALARM_URL·ALARM_SRV_CODE 미설정) — 직접 알려주세요`, 'warning', { ms: 8000 });
      else toast(who, 'success');
    }
    await load();
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { assigneeBusy.value = false; }
}

async function submitReview() {
  if (!form.opinion.trim()) { toast('의견을 적어주세요.', 'warning'); return; }
  busy.value = true;
  try {
    const override = form.override ? { track: form.track, dataCase: form.dataCase || null, integration: form.integration || null } : null;
    const r = await api.post<{ status: string }>(`/api/requests/${id}/reviews`, { decision: form.decision, feasible: form.feasible, approach: form.approach, opinion: form.opinion, estimatedWeeksMin: form.min, estimatedWeeksMax: form.max, judgementOverride: override });
    toast(`의견을 등록했어요 · 상태: ${S[r.status].label}`, 'success');
    form.opinion = ''; form.approach = ''; form.min = ''; form.max = ''; form.decision = 'note'; form.override = false;
    await load();
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { busy.value = false; }
}
const statusToLabel = computed(() => (statusTo.value ? S[statusTo.value].label : ''));
function changeStatus(to: string) {
  statusTo.value = to; statusNote.value = '';
  // 완료 모달은 빈 값에서 시작 — 담당자가 실제 결과를 보고 고르게 (되돌렸다 다시 완료하는 경우엔 이전 값이 남아 있으면 그걸 보여준다)
  if (to === 'done') { closurePick.deploy = d.value?.request.closure?.deploy ?? ''; closurePick.form = d.value?.request.closure?.form ?? ''; }
}
const closureReady = computed(() => statusTo.value !== 'done' || (!!closurePick.deploy && !!closurePick.form));
const statusState = ref<'idle' | 'loading' | 'done'>('idle');
async function confirmStatus() {
  if (!statusTo.value || statusState.value !== 'idle') return;
  if (!closureReady.value) { toast('배포 위치와 완성 형태를 골라주세요.', 'warning'); return; }
  statusState.value = 'loading';
  try {
    const closure = statusTo.value === 'done' ? { deploy: closurePick.deploy, form: closurePick.form } : undefined;
    await api.post(`/api/requests/${id}/status`, { to: statusTo.value, note: statusNote.value.trim() || null, closure });
    statusState.value = 'done';
    await new Promise((r) => setTimeout(r, 500));
    toast(`상태를 "${statusToLabel.value}"로 바꿨어요.`, 'success');
    statusTo.value = null;
    await load();
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { statusState.value = 'idle'; }
}
/** 완료된 건의 종결 분류 정정 — 상태는 건드리지 않는다 */
async function saveClosure() {
  if (!closureChanged.value || closureBusy.value) return;
  closureBusy.value = true;
  try {
    await api.post(`/api/requests/${id}/closure`, { closure: { deploy: closurePick.deploy, form: closurePick.form } });
    toast(`종결 분류를 "${closureLabel(closurePick)}"(으)로 바꿨어요.`, 'success');
    await load();
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { closureBusy.value = false; }
}
async function sendComment() {
  if (!comment.value.trim()) return;
  try { await api.post(`/api/requests/${id}/comments`, { body: comment.value }); comment.value = ''; await load(); }
  catch (e) { toast(humanMessage(e), 'danger'); }
}
async function removeAtt(a: Attachment) {
  if (!window.confirm(`"${a.fileName}"을(를) 삭제할까요? 되돌릴 수 없어요.`)) return;
  try { await api.del(`/api/attachments/${a.id}`); toast('삭제했어요.', 'info'); await load(); } catch (e) { toast(humanMessage(e), 'danger'); }
}
async function download(a: Attachment) { try { await downloadWithAuth(`/api/attachments/${a.id}/download`, a.fileName); } catch (e) { toast(humanMessage(e), 'danger'); } }

// 관리자 전용 — 접수 내용 완전 삭제. 되돌릴 수 없으므로 접수번호를 그대로 입력해야 버튼이 열린다
const deleteOpen = ref(false);
const deleteConfirm = ref('');
const deleteState = ref<'idle' | 'loading' | 'done'>('idle');
const deleteReady = computed(() => !!d.value && deleteConfirm.value.trim() === (d.value.request.reqNo || ''));
async function confirmDelete() {
  if (!deleteReady.value || deleteState.value !== 'idle') return;
  deleteState.value = 'loading';
  try {
    await api.del(`/api/requests/${id}`);
    deleteState.value = 'done';
    toast(`${d.value?.request.reqNo} 요청을 삭제했어요.`, 'info');
    router.replace({ name: 'inbox' });
  } catch (e) { toast(humanMessage(e), 'danger'); deleteState.value = 'idle'; }
}
</script>

<template>
  <BrmShell>
    <div v-if="loading" class="center" style="padding:48px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <div v-else-if="error" class="empty card"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><router-link to="/brm" class="btn btn-secondary mt-md">접수함으로</router-link></div>

    <template v-else-if="d">
      <header class="rv-head">
        <router-link to="/brm" class="text-sm">← 접수함</router-link>
        <div class="row wrap mt-sm" style="justify-content:space-between">
          <div class="row wrap"><span class="identifier text-sm text-muted">{{ d.request.reqNo }}</span><StatusBadge :status="d.request.status" /><span class="badge" data-tone="neutral">{{ CH[d.request.channel || ''] }}</span></div>
          <!-- 의견·상태 이력은 서랍으로 — 본문은 지금 할 일(담당자·의견·목업·대화)만 남긴다. 관리자에게는 접수 삭제 버튼을 이력 옆에 (2026-09-08 하단 카드 → 상단) -->
          <div class="row" style="gap:8px">
            <button type="button" class="btn btn-secondary btn-sm" data-testid="history-open" @click="drawer = 'all'"><Icon3d name="time-clock" :size="16" /> 이력 <span class="num">{{ timeline.length }}</span></button>
            <button v-if="isAdmin" type="button" class="btn btn-danger btn-sm" data-testid="delete-open" title="관리자 전용 — 접수 내용을 완전히 삭제해요 (되돌릴 수 없음)" @click="deleteOpen = true; deleteConfirm = ''">🗑 접수 삭제</button>
          </div>
        </div>
        <h1 style="font-size:24px;margin-top:6px">{{ d.request.title }}</h1>
        <p class="text-sub text-sm mt-sm">{{ d.request.requester.orgNm }} ({{ d.request.requester.orgCd }}) · {{ d.request.requester.name }}{{ d.request.requester.position ? " " + d.request.requester.position : "" }} <span class="identifier">{{ d.request.requester.employeeNo }}</span> · 신청 {{ fmtDate(d.request.submittedAt, true) }}</p>
        <!-- 담당자 — 지정되면 이름·직위·지정 시각, 아니면 "미지정" 배지 -->
        <p class="rv-assignee text-sm mt-sm" data-testid="assignee-line">
          <Icon3d name="employee-id" :size="16" /><span class="text-muted">AX-BRM 담당자</span>
          <template v-if="d.request.assignee">
            <b>{{ personLabel(d.request.assignee) }}</b> <span class="identifier text-xs text-muted">{{ d.request.assignee.employeeNo }}</span>
            <span class="text-xs text-muted">· {{ fmtDate(d.request.assignedAt, true) }} 지정</span>
          </template>
          <template v-else>
            <span class="badge" data-tone="neutral">담당자 미지정</span>
            <span class="text-xs text-muted">· 오른쪽 "AX-BRM 담당자" 카드에서 지정해요</span>
          </template>
        </p>
        <p v-if="d.request.closure" class="rv-assignee text-sm mt-sm" data-testid="closure-line">
          <span class="text-muted">종결 분류</span>
          <b>{{ CD[d.request.closure.deploy]?.label ?? d.request.closure.deploy }}</b> <span class="text-muted">·</span> <b>{{ CF[d.request.closure.form]?.label ?? d.request.closure.form }}</b>
          <span v-if="d.request.closedAt" class="text-xs text-muted">· {{ fmtDate(d.request.closedAt, true) }} 완료</span>
        </p>
        <div class="rv-steps mt-md" role="group" aria-label="단계 이동">
          <span class="text-xs text-muted nowrap">단계 이동:</span>
          <span v-if="offPath" class="badge" data-tone="warning">지금: {{ S[d.request.status].label }}</span>
          <ol class="rv-path">
            <li v-for="(st, i) in MAIN_PATH" :key="st" :data-state="stepState(st, i)">
              <button v-if="canGo(st)" type="button" class="rv-step is-next" :title="`이 요청을 \&quot;${S[st].label}\&quot; 단계로 옮겨요`" @click="changeStatus(st)"><span class="rv-dot" aria-hidden="true"></span>{{ S[st].label }}</button>
              <span v-else class="rv-step"><span class="rv-dot" aria-hidden="true"></span>{{ S[st].label }}<span v-if="st === d.request.status" class="rv-here">지금</span></span>
            </li>
          </ol>
          <span class="text-xs text-muted">{{ (MT[d.request.status] || []).length ? '점선 단계를 누르면 이동해요 · ' : '' }}승인·보완 요청·반려 같은 검토 결정은 오른쪽 "검토 의견 등록"에서 해요</span>
        </div>
      </header>

      <div class="rv-grid">
        <!-- 좌: 참조(읽기 전용) — ① 요청자 답변 전체(주인공) ② 요청자가 올린 자료 ③ 자동 판정은 접힌 참고 카드 -->
        <div class="rv-ref">
          <section class="card" data-testid="answers-card">
            <div class="row wrap" style="justify-content:space-between;align-items:baseline">
              <h2 class="card-title" style="margin:0"><Icon3d name="feedback-survey" :size="22" /> 요청자 답변 <span class="text-sm text-muted" style="font-weight:500">({{ visibleCount }})</span></h2>
              <span class="text-xs text-muted">읽기 전용 — 입력은 오른쪽에서 해요</span>
            </div>
            <!-- 모르겠다고 답한 항목은 검토 때 확인할 것 — 목록 안에서도 🔍 로 표시되고, 여기서 한 번에 본다 -->
            <div v-if="unknownQs.length" class="notice mt-md" data-level="check" data-testid="unknown-notice"><span class="notice-emoji" aria-hidden="true"><Icon3d name="magnifying-glass" :size="20" /></span><span><b>요청자가 "모르겠다"고 답한 항목 {{ unknownQs.length }}개</b> — 검토·상담 때 함께 확인해요. 아래 목록에서 🔍 표시.</span></div>
            <div v-for="g in grouped" :key="g.s.key" class="ans-sec mt-md">
              <p class="ans-sec-title">{{ g.s.title }}</p>
              <dl class="ans">
                <template v-for="x in g.qs" :key="x.q.id">
                  <dt><span class="num identifier text-muted">{{ String(x.n).padStart(2, '0') }}</span> {{ x.q.ask }}</dt>
                  <dd :class="{ 'is-unknown': isUnknownAnswer(x.q.id), 'is-empty': !d.request.answers[x.q.id] }">{{ formatAnswer(x.q, d.request.answers[x.q.id]) }}</dd>
                </template>
              </dl>
            </div>
          </section>

          <section class="card mt-md" data-testid="refs-card">
            <h2 class="card-title"><Icon3d name="project-folder" :size="22" /> 요청자가 올린 참고 자료</h2>
            <ul v-if="refs.length" class="stack-sm"><li v-for="a in refs" :key="a.id" class="att"><span class="grow truncate">{{ a.fileName }} <span class="text-xs text-muted">· {{ fmtBytes(a.size) }} · {{ a.uploadedBy.name }}</span></span><RevealButton icon="⬇" label="내려받기" @click="download(a)" /><RevealButton icon="🗑" label="삭제" tone="danger" @click="removeAtt(a)" /></li></ul>
            <p v-else class="text-sm text-muted">아직 올라온 자료가 없어요. (업로드는 요청자만 해요)</p>
          </section>

          <!-- 자동 판정 — 답변으로 계산한 초안일 뿐이라 접어 둔다. "자동 판정을 조정할게요"를 쓸 때 펼쳐서 대조한다 -->
          <section class="card mt-md" data-testid="judgement-card">
            <button type="button" class="row-between rv-toggle" :aria-expanded="showJudgement" @click="showJudgement = !showJudgement">
              <span class="card-title" style="margin:0"><Icon3d name="credit-review" :size="22" /> 자동 판정 <span class="text-sm text-muted" style="font-weight:500">(참고 · 신청 시 스냅샷{{ d.reviews.some((r) => r.judgementOverride) ? ' + BRM 조정' : '' }})</span></span>
              <span class="text-sm text-accent fw-600">{{ showJudgement ? '접기 −' : '펼치기 +' }}</span>
            </button>
            <template v-if="showJudgement">
              <p class="text-xs text-muted mt-sm">요청자 답변으로 자동 계산된 초안이에요. 다르게 판단되면 오른쪽 "자동 판정을 조정할게요"로 바꿔주세요.</p>
              <JudgementPanel v-if="judgement" :judgement="judgement" mode="full" internal class="mt-md" />
            </template>
          </section>
        </div>

        <!-- 우: 검토·대화·목업 -->
        <div class="stack-lg">
          <div class="card card-soft rv-guide text-sm" role="note">
            <Icon3d name="lightbulb-idea" :size="18" /> <b>검토는 세 걸음이면 돼요</b> — ① 아래 "AX-BRM 담당자"에서 실제 진행할 담당자 지정(저장하면 담당자에게 메신저 알림) → ② 왼쪽 요청자 답변·참고 자료로 무엇을 원하는지 파악 → ③ "검토 의견 등록"에서 결정을 고르고 의견 작성 (고른 결정에 따라 상태가 자동으로 바뀌어요)
          </div>

          <!-- 완료 건의 종결 분류 — 완료 처리 때 고른 값을 여기서 정정한다 (상태는 안 바뀜) -->
          <section v-if="d.request.status === 'done'" class="card" data-testid="closure-card">
            <h2 class="card-title"><Icon3d name="achievement-badge" :size="22" /> 종결 분류</h2>
            <div class="stack">
              <div class="field"><span class="label">배포 위치</span>
                <SegControl v-model="closurePick.deploy" :options="deployOpts" size="sm" aria-label="배포 위치" />
                <p class="hint" aria-live="polite">{{ CD[closurePick.deploy]?.desc || '결과물이 어디에 올라갔는지' }}</p>
              </div>
              <div class="field"><span class="label">완성 형태</span>
                <SegControl v-model="closurePick.form" :options="formOpts" size="sm" aria-label="완성 형태" />
                <p class="hint" aria-live="polite">{{ CF[closurePick.form]?.desc || '어디까지 만들었는지' }}</p>
              </div>
              <div class="row wrap" style="justify-content:space-between;align-items:center">
                <span class="text-xs text-muted">통계 화면의 "완료 건 종결 분류"에 집계돼요. 바꾸면 이력에 남아요.</span>
                <button class="btn btn-primary" :disabled="closureBusy || !closureChanged" data-testid="closure-save" @click="saveClosure">{{ closureBusy ? '저장 중…' : '분류 저장' }}</button>
              </div>
            </div>
          </section>

          <!-- 담당자 지정 — 의견·상태 변경 없이 단독 저장. 지정된 담당자가 이후 아래 카드에서 의견을 적는다 -->
          <section class="card" data-testid="assignee-card">
            <h2 class="card-title"><Icon3d name="employee-id" :size="22" /> AX-BRM 담당자</h2>
            <div class="stack">
              <div class="field"><label for="assignee" class="label">실제 진행할 담당자 (요청자에게 보여요)</label>
                <div class="row wrap" style="align-items:stretch">
                  <select id="assignee" v-model="assigneePick" class="select grow" :disabled="assigneeBusy">
                    <option value="">담당자 미지정</option>
                    <optgroup v-for="g in candidateGroups" :key="g.team" :label="g.team">
                      <option v-for="c in g.items" :key="c.employeeNo" :value="c.employeeNo">{{ personLabel(c) }} ({{ c.employeeNo }})</option>
                    </optgroup>
                  </select>
                  <button class="btn btn-primary" :disabled="assigneeBusy || !assigneeChanged" data-testid="assignee-save" @click="saveAssignee">{{ assigneeBusy ? '저장 중…' : (assigneePick ? '담당자 지정' : '지정 해제') }}</button>
                </div>
                <p class="hint" aria-live="polite">
                  <template v-if="!candidates.length">후보 목록이 비어 있어요 — HR 동기화가 아직 안 됐을 수 있어요 (담당자 관리 화면에서 동기화).</template>
                  <template v-else-if="assigneeChanged && pickedCandidate">저장하면 담당자가 "{{ personLabel(pickedCandidate) }}"로 바뀌고, 본인에게 메신저 알림이 가요. 의견·상태는 바뀌지 않아요.</template>
                  <template v-else-if="assigneeChanged">저장하면 담당자 지정이 해제돼요. 의견·상태는 바뀌지 않아요.</template>
                  <template v-else-if="d.request.assignee">담당자를 먼저 지정하고, 지정된 담당자가 아래 "검토 의견 등록"에서 의견을 적어요. 바꾸려면 다른 사람을 고르고 저장해요.</template>
                  <template v-else>AX디지털추진부 직원(부장 제외)을 조직 순서대로 보여줘요. 담당자를 먼저 지정하고, 그 담당자가 아래에서 의견을 적어요.</template>
                </p>
              </div>
            </div>
          </section>

          <section class="card" style="border-color:var(--brand-300)">
            <h2 class="card-title"><Icon3d name="document-edit" :size="22" /> 검토 의견 등록</h2>
            <div class="stack">
              <!-- 담당자 흐름 안내 — 미지정이면 먼저 지정하도록, 타인 담당이면 알려만 준다(등록은 막지 않음) -->
              <p v-if="!d.request.assignee" class="hint" style="margin-top:0" data-testid="opinion-flow-hint">아직 담당자가 없어요 — 위 "AX-BRM 담당자"에서 먼저 지정하는 흐름을 권해요. (지정 없이 의견만 남길 수도 있어요)</p>
              <p v-else-if="!iAmAssignee" class="hint" style="margin-top:0" data-testid="opinion-flow-hint">이 요청의 담당자는 <b>{{ personLabel(d.request.assignee) }}</b>이에요. 대신 의견을 남기면 이력에 내 이름으로 남아요.</p>
              <!-- 지난 의견은 서랍으로 뺐다 — 마지막 한 줄만 남겨 "이미 어떤 결정이 있었는지"는 놓치지 않게 -->
              <div v-if="lastReview" class="rv-last text-sm" data-testid="last-review">
                <span class="truncate"><span class="text-muted">마지막 의견</span> <b>{{ DEC[lastReview.decision]?.label }}</b> <span class="text-muted">· {{ lastReview.reviewer.name }} · {{ fmtDate(lastReview.createdAt) }}</span> — <span class="text-sub">{{ lastReview.opinion }}</span></span>
                <button type="button" class="btn btn-ghost btn-sm nowrap" @click="drawer = 'review'">의견 이력 {{ d.reviews.length }}건 →</button>
              </div>
              <div class="field"><span class="label">결정</span>
                <SegControl v-model="form.decision" :options="decisionOpts" aria-label="결정" />
                <p class="hint" aria-live="polite">{{ DEC[form.decision].to ? `등록하면 상태가 "${S[DEC[form.decision].to!].label}"(으)로 바뀌어요.` : '상태는 바꾸지 않고 의견만 남겨요.' }}</p>
              </div>
              <div class="field"><span class="label">실현 가능성</span>
                <SegControl v-model="form.feasible" :options="feasibleOpts" aria-label="실현 가능성" />
                <p class="hint">아직 확신이 없으면 "검토 중" 그대로 두셔도 돼요.</p>
              </div>
              <div class="field"><label for="approach" class="label">진행 방식 (요청자에게 보여요)</label><input id="approach" v-model="form.approach" class="input" placeholder="예) 모양만 같은 데이터로 행외 개발 → AI-HUB 배포 · BDP 일배치 연계" /></div>
              <div class="field"><label for="opinion" class="label">의견 (필수 · 요청자에게 보여요)</label><textarea id="opinion" v-model="form.opinion" class="textarea" rows="5" placeholder="쉬운 말로. 어렵더라도 이유와 대안을 함께 적어주세요."></textarea></div>
              <div class="field"><span class="label">BRM 개발 예상 기간(주) — 요건 확정 후 기준 (요청자에게 보여요 · 미정이면 비워두세요)</span>
                <div class="row wrap"><input v-model="form.min" type="number" min="0" class="input" style="width:90px;min-height:40px;padding:8px" aria-label="최소 주" placeholder="최소" /> ~ <input v-model="form.max" type="number" min="0" class="input" style="width:90px;min-height:40px;padding:8px" aria-label="최대 주" placeholder="최대" /></div>
              </div>
              <label class="row text-sm" style="align-items:flex-start"><input v-model="form.override" type="checkbox" style="margin-top:3px" /><span>자동 판정을 조정할게요 <span class="text-muted">— 왼쪽 맨 아래 "자동 판정"(도움 방식·데이터·연계)을 BRM 판단으로 바꿔서 저장해요</span></span></label>
              <!-- 판정 카드(도움 방식 → 데이터 → 연결)와 같은 순서로 한 줄에 하나씩 -->
              <div v-if="form.override" class="stack card card-soft" style="padding:14px 16px">
                <!-- 항목 문구는 판정 카드와 같은 두 겹(분류명 — 설명 문장)으로 — 카드에서 본 말이 그대로 보이게 (2026-09-08) -->
                <label class="field text-sm">도움 방식 <span class="text-muted">(카드 "어떻게 도울까요")</span><select v-model="form.track" class="select"><option v-for="(v, k) in TRACK_LABEL" :key="k" :value="k">{{ v.label }} — {{ v.plain }}</option></select></label>
                <label class="field text-sm">만들 때 데이터 <span class="text-muted">(데이터 케이스)</span><select v-model="form.dataCase" class="select"><option value="">해당 없음</option><option v-for="(v, k) in DL" :key="k" :value="k">{{ v.label }} — {{ v.plain }}</option></select></label>
                <label class="field text-sm">완성 후 데이터 연결 <span class="text-muted">(연계 방식)</span><select v-model="form.integration" class="select"><option value="">해당 없음</option><option v-for="(v, k) in IL" :key="k" :value="k">{{ v.label }} — {{ v.plain }}</option></select></label>
              </div>
              <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" :disabled="busy" @click="submitReview">{{ busy ? '등록 중…' : '의견 등록' }}<template v-if="DEC[form.decision].to"> → {{ S[DEC[form.decision].to!].label }}</template></button></div>
            </div>
          </section>

          <section class="card">
            <h2 class="card-title"><Icon3d name="coding-laptop" :size="22" /> 컨셉 목업 (HTML)</h2>
            <ul v-if="mockups.length" class="stack-sm mb-md">
              <li v-for="a in mockups" :key="a.id" class="att"><span class="badge" data-tone="brand">v{{ a.version }}</span><span class="grow truncate"><b>{{ a.fileName }}</b> <span class="text-xs text-muted">· {{ fmtBytes(a.size) }} · {{ a.uploadedBy.name }} · {{ fmtDate(a.uploadedAt) }}<template v-if="a.note"> · {{ a.note }}</template></span></span><button class="btn btn-primary btn-sm" title="새 창에서 열어요" @click="openMockupWindow(a)">미리보기 ↗</button><RevealButton icon="⬇" label="내려받기" @click="download(a)" /><RevealButton icon="🗑" label="삭제" tone="danger" @click="removeAtt(a)" /></li>
            </ul>
            <!-- accept 는 컴포넌트가 shared/mockupTypes.js 로 채운다 — HTML · 이미지 · PDF (2026-09-11 확장) -->
            <FileUpload :request-id="id" kind="mockup" label="목업 파일을 올려주세요 (HTML · 이미지 · PDF)" hint="필수 아니에요 — 필요할 때만 · 브라우저에서 바로 열리는 파일 하나(html · png · jpg · gif · webp · svg · pdf) · 같은 요청에 올리면 버전이 자동으로 올라가요 · 20MB 이하" @uploaded="load" />
          </section>

          <section class="card">
            <h2 class="card-title"><Icon3d name="employee-conversation" :size="22" /> 요청자와의 대화</h2>
            <div v-if="d.comments.length" class="stack-sm mb-md"><div v-for="c in d.comments" :key="c.id" class="cmt" :data-mine="c.author.employeeNo === session.user?.employeeNo"><div class="text-xs text-muted">{{ c.author.name }} · {{ fmtDate(c.createdAt, true) }}</div><p class="text-sm mt-sm" style="white-space:pre-wrap">{{ c.body }}</p></div></div>
            <p v-else class="text-sm text-muted mb-md">아직 대화가 없어요. 확인할 것이 있으면 먼저 말을 걸어보세요.</p>
            <div class="field"><textarea v-model="comment" class="textarea" rows="2" placeholder="요청자에게 답하기" aria-label="답글"></textarea><div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" :disabled="!comment.trim()" @click="sendComment">보내기</button></div></div>
          </section>

        </div>
      </div>

      <AppDrawer v-if="drawer" title="이력" @close="drawer = null">
        <template #tools><SegControl v-model="drawer" :options="drawerTabs" size="sm" aria-label="이력 종류" /></template>
        <p v-if="!timelineShown.length" class="text-sm text-muted">아직 없어요</p>
        <div v-else class="timeline" data-testid="history-timeline">
          <div v-for="(e, i) in timelineShown" :key="e.kind === 'review' ? e.review.id : e.h.id" class="tl-item">
            <div class="tl-rail"><span class="tl-dot" :class="{ 'is-review': e.kind === 'review' }" aria-hidden="true"></span><span v-if="i < timelineShown.length - 1" class="tl-line" aria-hidden="true"></span></div>
            <div v-if="e.kind === 'status'" class="tl-body">
              <div class="fw-600 text-sm"><template v-if="e.h.from === e.h.to">{{ e.h.note || S[e.h.to]?.label }}</template><template v-else>{{ S[e.h.from || '']?.label || '—' }} → {{ S[e.h.to]?.label }}</template></div>
              <div class="tl-meta">{{ e.h.by.name }} · {{ fmtDate(e.h.at, true) }}<template v-if="e.h.note && e.h.from !== e.h.to"> · {{ e.h.note }}</template></div>
            </div>
            <article v-else class="tl-body rev">
              <div class="fw-700 text-sm"><span class="badge" data-tone="brand" style="margin-right:6px">의견</span>{{ DEC[e.review.decision]?.label }}<span v-if="e.review.feasible" class="text-muted"> · {{ FEA[e.review.feasible]?.label }}</span></div>
              <div class="tl-meta">{{ e.review.reviewer.name }} · {{ fmtDate(e.review.createdAt, true) }}</div>
              <p class="text-sm mt-sm" style="white-space:pre-wrap">{{ e.review.opinion }}</p>
              <p v-if="e.review.approach" class="text-xs text-sub mt-sm">진행 방식: {{ e.review.approach }}</p>
              <p v-if="e.review.estimatedWeeksMin || e.review.estimatedWeeksMax" class="text-xs text-sub">예상 {{ e.review.estimatedWeeksMin ?? '?' }}~{{ e.review.estimatedWeeksMax ?? '?' }}주</p>
              <p v-if="e.review.judgementOverride" class="text-xs text-muted">판정 조정 포함</p>
            </article>
          </div>
        </div>
      </AppDrawer>

      <AppModal v-if="deleteOpen" title="접수 삭제 · 되돌릴 수 없어요" @close="deleteOpen = false">
        <p class="text-sm"><b>{{ d.request.reqNo }}</b> · {{ d.request.title }}<br /><span class="text-muted">{{ d.request.requester.orgNm }} {{ d.request.requester.name }} · {{ S[d.request.status].label }}</span></p>
        <p class="text-sm mt-md">잘못 접수됐거나 테스트로 들어온 건을 접수함에서 완전히 지우는 관리자 기능이에요. 의견 {{ d.reviews.length }}건, 이력 {{ d.history.length }}건, 첨부 {{ d.attachments.length }}건, 대화 {{ d.comments.length }}건이 함께 삭제되고 요청자 화면과 통계에서도 사라져요. <b>되돌릴 수 없어요.</b> 정상 접수된 건은 삭제 대신 "반려"로 종결해 주세요.</p>
        <div class="field mt-md"><label for="delconfirm" class="label">확인을 위해 접수번호를 그대로 입력해 주세요</label><input id="delconfirm" v-model="deleteConfirm" class="input" :placeholder="d.request.reqNo || ''" autocomplete="off" data-testid="delete-confirm" @keydown.enter="confirmDelete" /></div>
        <template #foot><button class="btn btn-ghost" @click="deleteOpen = false">취소</button><SubmitButton :state="deleteState" :disabled="!deleteReady" class="rv-del-btn" data-testid="delete-submit" @click="confirmDelete">영구 삭제</SubmitButton></template>
      </AppModal>

      <AppModal v-if="statusTo" :title="`단계 이동 · ${statusToLabel}`" @close="statusTo = null">
        <p class="text-sm"><b>{{ S[d.request.status].label }}</b> <span class="text-muted">→</span> <b>{{ statusToLabel }}</b> 단계로 바꿔요. 요청자 화면의 진행 단계에도 바로 반영돼요.</p>
        <!-- 완료 처리 — 어떻게 종결됐는지 두 가지를 반드시 고른다 (통계 "완료 건 종결 분류"의 근거) -->
        <template v-if="statusTo === 'done'">
          <div class="field mt-md"><span class="label">배포 위치 <span class="badge" data-tone="brand" style="margin-left:4px">필수</span></span>
            <SegControl v-model="closurePick.deploy" :options="deployOpts" size="sm" aria-label="배포 위치" />
            <p class="hint" aria-live="polite">{{ CD[closurePick.deploy]?.desc || '완결된 결과물이 어디에 올라갔는지 골라주세요' }}</p>
          </div>
          <div class="field mt-md"><span class="label">완성 형태 <span class="badge" data-tone="brand" style="margin-left:4px">필수</span></span>
            <SegControl v-model="closurePick.form" :options="formOpts" size="sm" aria-label="완성 형태" />
            <p class="hint" aria-live="polite">{{ CF[closurePick.form]?.desc || '어디까지 만들었는지 골라주세요' }}</p>
          </div>
        </template>
        <div class="field mt-md"><label for="stnote" class="label">메모 (선택 · 상태 이력에 남아요)</label><input id="stnote" v-model="statusNote" class="input" :placeholder="statusTo === 'done' ? '예) 9월 오픈 · 운영 이관 완료' : '예) 개발 착수'" aria-label="상태 변경 메모" @keydown.enter="confirmStatus" /></div>
        <template #foot><button class="btn btn-ghost" @click="statusTo = null">취소</button><SubmitButton :state="statusState" :disabled="!closureReady" @click="confirmStatus">{{ statusTo === 'done' ? '완료 처리' : '바꾸기' }}</SubmitButton></template>
      </AppModal>

    </template>
  </BrmShell>
</template>

<style scoped>
.rv-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; }
.rv-guide { padding: 12px 16px; line-height: 1.8; }
.rv-ref { min-width: 0; }
.rv-head { margin-bottom: 20px; }
.rv-assignee { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
@media (min-width: 1280px) {
  /* 헤더(제목·상태·단계 이동)는 스크롤해도 상단바 아래에 고정 — 어떤 요청·어느 단계인지 항상 보이게 */
  .rv-head { position: sticky; top: 60px; z-index: 30; background: var(--bg, #F4F8F7); padding: 10px 0 12px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
}
.rv-toggle { width: 100%; text-align: left; padding: 2px 0; background: none; border: 0; font-family: inherit; cursor: pointer; }
.ans-sec-title { font-size: 12.5px; font-weight: 700; color: var(--text-sub); background: var(--surface-2); border-radius: var(--radius-sm); padding: 6px 10px; margin: 0 0 8px; }
/* 참조 패널에 내부 스크롤을 두지 않는다 — 스크롤 막대가 여러 개면 휠이 어디를 움직일지 헷갈린다.
   페이지 스크롤 하나로 통일하고, 문맥 유지는 고정 헤더(.rv-head)가 담당한다 (2026-09-03) */
.rv-steps { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.rv-path { display: flex; align-items: center; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
.rv-path li { display: flex; align-items: center; }
.rv-path li + li::before { content: ''; width: 20px; height: 2px; background: var(--line); margin: 0 3px; }
.rv-path li[data-state="done"] + li::before { background: var(--brand-300); }
.rv-step { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); border: 0; background: none; padding: 4px 8px; border-radius: 999px; font-family: inherit; }
.rv-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--line); flex: none; }
.rv-path li[data-state="done"] .rv-dot { background: var(--brand-300); }
.rv-path li[data-state="current"] .rv-step { color: var(--text); font-weight: 700; }
.rv-path li[data-state="current"] .rv-dot { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
button.rv-step.is-next { cursor: pointer; color: var(--accent); border: 1px dashed var(--brand-300); background: #fff; }
button.rv-step.is-next:hover { background: var(--accent-soft); border-style: solid; }
button.rv-step.is-next .rv-dot { background: #fff; border: 2px solid var(--accent); }
.rv-here { font-size: 10.5px; background: var(--accent-soft); color: var(--accent); border-radius: 6px; padding: 1px 6px; margin-left: 2px; }
@media (min-width: 1280px) { .rv-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
/* 질문 위 · 답변 아래 세로 배치 — 주관식 답변이 길어도 줄이 어긋나지 않는다 (2026-09-03) */
.ans { display: flex; flex-direction: column; margin: 0; font-size: 14px; }
.ans dt { color: var(--text-muted); margin-top: 12px; }
.ans dt:first-of-type { margin-top: 0; }
.ans dd { margin: 2px 0 0; font-weight: 600; white-space: pre-wrap; padding-left: 26px; }
.ans dd.is-unknown { color: var(--warning); }
.ans dd.is-unknown::before { content: '🔍 '; }
.ans dd.is-empty { font-weight: 400; color: var(--text-muted); font-style: italic; }
.rv-del-btn:not(:disabled) { background: var(--danger); border-color: var(--danger); color: #fff; }
.rv-last { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--surface-2); min-width: 0; }
.rv-last .truncate { min-width: 0; }
/* 이력 서랍 — 의견 사건은 점을 브랜드색 테두리로 구분 */
.tl-dot.is-review { background: var(--surface); border: 3px solid var(--brand-500); }
.rev.tl-body { padding-bottom: 20px; }
.att { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 14px; }
.cmt { padding: 10px 12px; border-radius: var(--radius-sm); background: var(--surface-2); }
.cmt[data-mine="true"] { background: var(--accent-soft); }
</style>
