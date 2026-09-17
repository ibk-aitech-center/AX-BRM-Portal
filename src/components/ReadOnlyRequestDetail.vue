<script setup lang="ts">
/**
 * 조회 전용 요청 상세 — DATA-BRM(데이터 요청)·그룹기획(접수현황 조회)이 같이 쓴다. 감싸는 틀(DataShell·StatusShell)은 각 화면이 둔다.
 * 요청자 답변 전체, 자동 판정, AX-BRM 의견, 목업(미리보기·내려받기), 참고 자료, 요청자와 나눈 대화, 진행 이력을
 * 전부 보여 주되 어떤 입력·버튼도 두지 않는다. 서버도 두 역할의 쓰기 API 를 전부 403 으로 막는다 (server/auth.js canReadRequest).
 *   highlightData — 데이터 구간(C)을 강조 (DATA-BRM 만). 그룹기획은 모든 구간을 같은 무게로 본다.
 */
import RevealButton from '@/components/RevealButton.vue';
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, humanMessage, downloadWithAuth } from '@/services/api';
import { toast } from '@/services/toast';
import type { RequestDetail, Attachment, Judgement } from '@/types';
import { STATUS, DECISION, FEASIBLE, CHANNEL_LABEL } from '@shared/statuses.js';
import { SECTIONS, visibleQuestions, formatAnswer } from '@shared/questions.js';
import StatusBadge from '@/components/StatusBadge.vue';
import ProgressSteps from '@/components/ProgressSteps.vue';
import JudgementPanel from '@/components/JudgementPanel.vue';
import { openMockupWindow } from '@/services/mockupWindow';
import { fmtDate, fmtBytes, fmtRelative } from '@/services/format';

const props = defineProps<{
  /** 목록으로 돌아가는 링크 · 라벨 */
  backTo: string; backLabel: string;
  /** 머리 안내 문구 (누가 무엇을 등록하는지) */
  notice: string;
  /** 데이터 구간(C) 강조 여부 */
  highlightData?: boolean;
}>();
const route = useRoute();
const id = route.params.id as string;
const d = ref<RequestDetail | null>(null);
const loading = ref(true);
const error = ref('');
const S = STATUS as Record<string, { label: string; desc: string }>;
const DEC = DECISION as Record<string, { label: string }>;
const FEA = FEASIBLE as Record<string, { label: string }>;
const CH = CHANNEL_LABEL as Record<string, string>;

async function load() {
  loading.value = true;
  try { d.value = await api.get<RequestDetail>(`/api/requests/${id}`); }
  catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
onMounted(load);

/** 유효 판정 — 서버가 AX-BRM 조정을 이미 덮어서 준다 (server/judgement.js) */
const judgement = computed<Judgement | null>(() => d.value?.request.judgement ?? null);
const grouped = computed(() => {
  if (!d.value) return [];
  const vis = visibleQuestions(d.value.request.answers);
  return SECTIONS.map((s) => ({ s, qs: vis.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.section === s.key) })).filter((g) => g.qs.length);
});
/** 데이터 구간(C)은 DATA-BRM 이 가장 먼저 봐야 할 부분 — 답변 전체 안에서 강조한다 (2026-09-08: 별도 카드 대신 전체 목록 + 하이라이트) */
const isDataSection = (key: string) => !!props.highlightData && key === 'C';
const mockups = computed(() => (d.value?.attachments || []).filter((a) => a.kind === 'mockup'));
const refs = computed(() => (d.value?.attachments || []).filter((a) => a.kind !== 'mockup'));

async function download(a: Attachment) {
  try { await downloadWithAuth(`/api/attachments/${a.id}/download`, a.fileName); } catch (e) { toast(humanMessage(e), 'danger'); }
}
</script>

<template>
  <div>
    <div v-if="loading" class="center" style="padding:48px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <div v-else-if="error" class="empty card"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><router-link :to="backTo" class="btn btn-secondary mt-md">{{ backLabel }}으로</router-link></div>

    <template v-else-if="d">
      <router-link :to="backTo" class="text-sm">← {{ backLabel }}</router-link>

      <header class="card dv-head mt-md">
        <div class="dv-head-grid">
          <div class="min0">
            <div class="row wrap"><StatusBadge :status="d.request.status" /><span class="badge" data-tone="neutral">{{ CH[d.request.channel || ''] || '' }}</span><span class="badge" data-tone="neutral">조회 전용</span></div>
            <h1 class="serif dv-title mt-sm">{{ d.request.title }}</h1>
            <p class="text-sub text-sm mt-sm">요청일 <b class="num" style="color:var(--text)">{{ fmtDate(d.request.submittedAt) }}</b> · {{ d.request.requester.orgNm }} {{ d.request.requester.name }}{{ d.request.requester.position ? ' ' + d.request.requester.position : '' }} · 접수번호 <span class="identifier">{{ d.request.reqNo }}</span></p>
            <p class="dv-assignee text-sm mt-sm">
              <Icon3d name="employee-id" :size="16" /><span class="text-muted">AX-BRM 담당자</span>
              <b v-if="d.request.assignee">{{ d.request.assignee.name }}{{ d.request.assignee.position ? ' ' + d.request.assignee.position : '' }}</b>
              <span v-else class="badge" data-tone="neutral">담당자 미지정</span>
            </p>
          </div>
          <div class="dv-steps">
            <p class="eyebrow mb-sm">진행 단계</p>
            <ProgressSteps :status="d.request.status" />
          </div>
        </div>
        <p class="notice mt-lg" data-level="info">
          <span class="notice-emoji" aria-hidden="true"><Icon3d name="document-analytics" :size="20" /></span>
          <span>{{ notice }}</span>
        </p>
      </header>

      <div class="dv-grid mt-lg">
        <div class="stack-lg min0">
          <!-- 요청자 답변 전체 — 데이터 구간(C)만 강조. 접지 않고 항상 펼쳐 둔다 -->
          <section class="card" data-testid="data-answers">
            <h2 class="card-title"><Icon3d name="feedback-survey" :size="22" /> 요청자 답변 <span v-if="highlightData" class="text-xs text-muted" style="font-weight:500">· <span class="ans-legend"></span> 데이터 협의와 관련된 답변</span></h2>
            <div class="ans-list mt-md">
              <section v-for="g in grouped" :key="g.s.key" class="ans-sec" :data-highlight="isDataSection(g.s.key)" :aria-label="g.s.title">
                <header class="ans-head"><span class="ans-head-title">{{ g.s.title }}</span><span v-if="isDataSection(g.s.key)" class="badge" data-tone="brand" style="font-size:10.5px;padding:1px 7px">데이터 협의 관련</span></header>
                <dl class="ans">
                  <div v-for="x in g.qs" :key="x.q.id" class="ans-row">
                    <span class="ans-n num" aria-hidden="true">{{ String(x.n).padStart(2, '0') }}</span>
                    <dt class="ans-q">{{ x.q.ask }}</dt>
                    <dd class="ans-a" :data-empty="!d.request.answers[x.q.id]">{{ formatAnswer(x.q, d.request.answers[x.q.id]) }}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </section>

          <section class="card">
            <h2 class="card-title"><Icon3d name="suggestion-box" :size="22" /> AX-BRM 의견</h2>
            <div v-if="!d.reviews.length" class="text-sm text-sub">아직 등록된 의견이 없어요.</div>
            <div v-else class="stack">
              <article v-for="r in d.reviews" :key="r.id" class="review">
                <div class="row-between wrap">
                  <span class="fw-700 text-sm">{{ DEC[r.decision]?.label }}<span v-if="r.feasible" class="text-muted"> · 실현 가능성: {{ FEA[r.feasible]?.label }}</span></span>
                  <span class="text-xs text-muted">{{ r.reviewer.name }} · {{ fmtDate(r.createdAt, true) }}</span>
                </div>
                <p class="mt-sm" style="white-space:pre-wrap">{{ r.opinion }}</p>
                <div v-if="r.approach || r.estimatedWeeksMin || r.estimatedWeeksMax" class="review-meta mt-sm">
                  <span v-if="r.approach"><b>진행 방식</b> {{ r.approach }}</span>
                  <span v-if="r.estimatedWeeksMin || r.estimatedWeeksMax"><b>BRM 개발 예상 기간(요건 확정 후)</b> 약 {{ r.estimatedWeeksMin ?? '?' }}~{{ r.estimatedWeeksMax ?? '?' }}주</span>
                </div>
              </article>
            </div>
          </section>

          <section class="card">
            <h2 class="card-title"><Icon3d name="coding-laptop" :size="22" /> 화면 컨셉(목업)</h2>
            <div v-if="!mockups.length" class="text-sm text-sub">아직 올라온 목업이 없어요.</div>
            <ul v-else class="stack-sm">
              <li v-for="a in mockups" :key="a.id" class="att">
                <span class="badge" data-tone="brand">v{{ a.version }}</span>
                <span class="grow min0"><b class="truncate" style="display:block">{{ a.fileName }}</b><span class="text-xs text-muted">{{ fmtDate(a.uploadedAt) }} · {{ fmtBytes(a.size) }}<template v-if="a.note"> · {{ a.note }}</template></span></span>
                <button class="btn btn-primary btn-sm" title="새 창에서 열어요" @click="openMockupWindow(a)">미리보기 ↗</button>
                <RevealButton icon="⬇" label="내려받기" @click="download(a)" />
              </li>
            </ul>
          </section>

          <section class="card">
            <h2 class="card-title"><Icon3d name="project-folder" :size="22" /> 참고 자료</h2>
            <div v-if="!refs.length" class="text-sm text-sub">요청자가 올린 참고 자료가 없어요.</div>
            <ul v-else class="stack-sm">
              <li v-for="a in refs" :key="a.id" class="att">
                <span class="grow min0"><span class="truncate" style="display:block">{{ a.fileName }}</span><span class="text-xs text-muted">{{ fmtBytes(a.size) }} · {{ a.uploadedBy.name }}<template v-if="a.note"> · {{ a.note }}</template></span></span>
                <button class="btn btn-ghost btn-sm" @click="download(a)">⬇ 받기</button>
              </li>
            </ul>
          </section>

          <section class="card">
            <h2 class="card-title"><Icon3d name="employee-conversation" :size="22" /> 요청자 · AX-BRM 대화</h2>
            <div v-if="!d.comments.length" class="text-sm text-sub">아직 나눈 대화가 없어요.</div>
            <div v-else class="stack-sm">
              <div v-for="c in d.comments" :key="c.id" class="cmt" :data-brm="c.author.role !== 'requester'">
                <div class="text-xs text-muted">{{ c.author.name }}<span v-if="c.author.role !== 'requester'" class="badge" data-tone="brand" style="margin-left:6px;font-size:10.5px;padding:1px 6px">AX-BRM</span> · {{ fmtRelative(c.createdAt) }}</div>
                <p class="mt-sm" style="white-space:pre-wrap">{{ c.body }}</p>
              </div>
            </div>
          </section>
        </div>

        <aside class="stack-lg min0">
          <section class="card">
            <h2 class="card-title"><Icon3d name="time-clock" :size="22" /> 진행 이력</h2>
            <div class="timeline">
              <div v-for="(h, i) in d.history" :key="h.id" class="tl-item">
                <div class="tl-rail"><span class="tl-dot" aria-hidden="true"></span><span v-if="i < d.history.length - 1" class="tl-line" aria-hidden="true"></span></div>
                <div class="tl-body"><div class="fw-600">{{ h.from === h.to && h.note ? h.note : S[h.to]?.label }}</div><div class="tl-meta">{{ fmtDate(h.at, true) }} · {{ h.by.name }}<template v-if="h.note && h.from !== h.to"> · {{ h.note }}</template></div></div>
              </div>
            </div>
          </section>
          <section v-if="judgement">
            <h2 class="card-title"><Icon3d name="credit-review" :size="22" /> 자동 판정{{ d.reviews.some((r) => r.judgementOverride) ? ' (+ BRM 조정)' : '' }}</h2>
            <JudgementPanel :judgement="judgement" mode="side" internal />
          </section>
        </aside>
      </div>

    </template>
  </div>
</template>

<style scoped>
.min0 { min-width: 0; }
.dv-head { padding: 28px; }
.dv-assignee { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dv-head-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 32px; align-items: start; }
.dv-title { font-size: clamp(22px, 2.6vw, 28px); line-height: 1.3; }
.dv-steps { padding-top: 6px; }
/* 오른쪽 판정 패널은 420px — 카드 헤더(제목 + 내부 용어 태그)가 한 줄에 들어가는 폭. 답변 영역이 그만큼 줄어든다 (2026-09-08) */
.dv-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 24px; align-items: start; }
@media (max-width: 1024px) { .dv-grid, .dv-head-grid { grid-template-columns: 1fr; } }
.review + .review { border-top: 1px solid var(--line); padding-top: 16px; }
.review-meta { display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 13.5px; color: var(--text-sub); }
.review-meta b { color: var(--text); margin-right: 4px; }
.att { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 14px; }
.cmt { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); font-size: 14px; }
.cmt[data-brm="true"] { background: var(--accent-soft); }
.ans-list { display: flex; flex-direction: column; gap: 24px; }
.ans-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 4px; background: var(--surface-2); border-radius: var(--radius-sm); }
/* 데이터 구간 강조 — 왼쪽 브랜드 선 + 옅은 브랜드 배경. 다른 구간은 그대로라 눈이 먼저 여기로 간다 */
.ans-sec[data-highlight="true"] { border-left: 3px solid var(--brand-500); background: var(--accent-soft); border-radius: var(--radius-sm); padding: 6px 8px 4px; margin: 0 -8px; }
.ans-sec[data-highlight="true"] .ans-head { background: rgba(255,255,255,.55); }
.ans-sec[data-highlight="true"] .ans-row:hover { background: rgba(255,255,255,.45); }
.ans-legend { display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: var(--accent-soft); border-left: 3px solid var(--brand-500); vertical-align: -1px; }
.ans-head-title { font-size: 13px; font-weight: 700; color: var(--text-sub); }
.ans { margin: 0; }
.ans-row { display: grid; grid-template-columns: 28px minmax(0, 340px) minmax(0, 1fr); gap: 0 14px; align-items: baseline; padding: 10px 12px; border-top: 1px solid var(--line); }
.ans-row:first-child { border-top: 0; }
.ans-row:hover { background: var(--ink-50); }
.ans-n { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); padding-top: 2px; }
.ans-q { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text-sub); }
.ans-a { margin: 0; font-size: 14px; line-height: 1.5; font-weight: 600; color: var(--text); white-space: pre-wrap; }
.ans-a[data-empty="true"] { font-weight: 400; color: var(--text-muted); font-style: italic; }
@media (max-width: 640px) { .ans-row { grid-template-columns: 28px 1fr; } .ans-a { grid-column: 2; padding-top: 2px; } }
</style>
