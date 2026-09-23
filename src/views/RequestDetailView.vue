<script setup lang="ts">
import RevealButton from '@/components/RevealButton.vue';
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, humanMessage, downloadWithAuth } from '@/services/api';
import { toast } from '@/services/toast';
import { session, isBrm } from '@/services/session';
import type { RequestDetail, Attachment } from '@/types';
import { STATUS, DECISION, FEASIBLE, CHANNEL_LABEL } from '@shared/statuses.js';
import { SECTIONS, visibleQuestions, formatAnswer } from '@shared/questions.js';
import StatusBadge from '@/components/StatusBadge.vue';
import ProgressSteps from '@/components/ProgressSteps.vue';
import JudgementPanel from '@/components/JudgementPanel.vue';
import { openMockupWindow } from '@/services/mockupWindow';
import FileUpload from '@/components/FileUpload.vue';
import { fmtDate, fmtBytes, fmtRelative } from '@/services/format';

const route = useRoute();
const id = route.params.id as string;
const d = ref<RequestDetail | null>(null);
const loading = ref(true);
const error = ref('');
const comment = ref('');
const sending = ref(false);
const showAnswers = ref(false);
const S = STATUS as Record<string, { label: string; requesterDesc: string }>;
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
const judgement = computed(() => d.value?.request.judgement ?? null);
const mockups = computed(() => (d.value?.attachments || []).filter((a) => a.kind === 'mockup'));
const others = computed(() => (d.value?.attachments || []).filter((a) => a.kind !== 'mockup'));
const grouped = computed(() => {
  if (!d.value) return [];
  const vis = visibleQuestions(d.value.request.answers);
  return SECTIONS.map((s) => ({ s, qs: vis.map((q, i) => ({ q, n: i + 1 })).filter((x) => x.q.section === s.key) })).filter((g) => g.qs.length);
});
const noticeLevel = computed(() => {
  const st = d.value?.request.status || '';
  return st === 'hold' ? 'warn' : ['accepted', 'done', 'guided', 'developing', 'rejected'].includes(st) ? 'success' : 'info';
});

async function download(a: Attachment) {
  try { await downloadWithAuth(`/api/attachments/${a.id}/download`, a.fileName); } catch (e) { toast(humanMessage(e), 'danger'); }
}
async function send() {
  if (!comment.value.trim()) return;
  sending.value = true;
  try { await api.post(`/api/requests/${id}/comments`, { body: comment.value }); comment.value = ''; toast('문의를 남겼어요. AX-BRM이 확인하고 답할게요.', 'success'); await load(); }
  catch (e) { toast(humanMessage(e), 'danger'); }
  finally { sending.value = false; }
}
</script>

<template>
  <div class="container rd">
    <div v-if="loading" class="center" style="padding:64px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <div v-else-if="error" class="empty"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><router-link to="/requests" class="btn btn-secondary mt-md">내 요청으로</router-link></div>

    <template v-else-if="d">
      <router-link :to="isBrm && d.request.requester.employeeNo !== session.user?.employeeNo ? '/brm' : '/requests'" class="text-sm">← 목록으로</router-link>

      <!-- 헤더: 제목 · 메타 · 진행 단계 · 현재 상태 안내 -->
      <header class="card rd-head mt-md">
        <div class="rd-head-grid">
          <div class="min0">
            <div class="row wrap"><StatusBadge :status="d.request.status" /><span class="badge" data-tone="neutral">{{ CH[d.request.channel || ''] || '' }}</span></div>
            <h1 class="serif rd-title mt-sm">{{ d.request.title }}</h1>
            <p class="text-sub text-sm mt-sm">요청일 <b class="num" style="color:var(--text)">{{ fmtDate(d.request.submittedAt) }}</b> · {{ d.request.requester.orgNm }} {{ d.request.requester.name }}{{ d.request.requester.position ? " " + d.request.requester.position : "" }} · 접수번호 <span class="identifier">{{ d.request.reqNo }}</span></p>
            <!-- 담당자 — 지정되면 이름·직위, 아니면 "미지정" 배지. 요청자가 누구에게 물어볼지 알 수 있게 -->
            <p class="rd-assignee text-sm mt-sm" data-testid="assignee-line">
              <Icon3d name="employee-id" :size="16" /><span class="text-muted">AX-BRM 담당자</span>
              <b v-if="d.request.assignee">{{ d.request.assignee.name }}{{ d.request.assignee.position ? ' ' + d.request.assignee.position : '' }}</b>
              <template v-else><span class="badge" data-tone="neutral">담당자 미지정</span><span class="text-xs text-muted">· 검토가 진행되면 담당자가 정해져요</span></template>
            </p>
          </div>
          <div class="rd-steps">
            <p class="eyebrow mb-sm">진행 단계</p>
            <ProgressSteps :status="d.request.status" />
          </div>
        </div>
        <p class="notice mt-lg" :data-level="noticeLevel">
          <span class="notice-emoji" aria-hidden="true"><Icon3d name="suggestion-box" :size="20" /></span><span>{{ S[d.request.status]?.requesterDesc }}</span>
        </p>
        <router-link v-if="isBrm" :to="{ name: 'review', params: { id } }" class="btn btn-secondary btn-sm mt-md">AX-BRM 검토 화면으로</router-link>
      </header>

      <div class="rd-grid mt-lg">
        <!-- 본문: 의견 · 목업 · 자료 · 문의 -->
        <div class="stack-lg min0">
          <section class="card">
            <h2 class="card-title"><Icon3d name="suggestion-box" :size="22" /> AX-BRM 의견</h2>
            <div v-if="!d.reviews.length" class="text-sm text-sub">아직 의견이 없어요. 열심히 검토 중입니다.</div>
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
            <div v-if="!mockups.length" class="text-sm text-sub">필요한 경우 AX-BRM이 화면 컨셉(목업)을 만들어 여기에 올려요.</div>
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
            <ul v-if="others.length" class="stack-sm mb-md">
              <li v-for="a in others" :key="a.id" class="att">
                <span class="grow min0"><span class="truncate" style="display:block">{{ a.fileName }}</span><span class="text-xs text-muted">{{ fmtBytes(a.size) }} · {{ a.uploadedBy.name }}<template v-if="a.note"> · {{ a.note }}</template></span></span>
                <button class="btn btn-ghost btn-sm" @click="download(a)">⬇ 받기</button>
              </li>
            </ul>
            <FileUpload :request-id="id" kind="reference" label="화면 캡처·엑셀 양식 등을 올려주세요" hint="AX-BRM이 검토할 때 큰 도움이 돼요 · 20MB 이하" @uploaded="load" />
          </section>

          <section class="card">
            <h2 class="card-title"><Icon3d name="employee-conversation" :size="22" /> 문의 · 대화</h2>
            <div v-if="d.comments.length" class="stack-sm mb-md">
              <div v-for="c in d.comments" :key="c.id" class="cmt" :data-mine="c.author.employeeNo === session.user?.employeeNo">
                <div class="text-xs text-muted">{{ c.author.name }}<span v-if="c.author.role !== 'requester'" class="badge" data-tone="brand" style="margin-left:6px;font-size:10.5px;padding:1px 6px">AX-BRM</span> · {{ fmtRelative(c.createdAt) }}</div>
                <p class="mt-sm" style="white-space:pre-wrap">{{ c.body }}</p>
              </div>
            </div>
            <div class="field">
              <label for="cmt" class="label">궁금한 점을 남겨주세요</label>
              <textarea id="cmt" v-model="comment" class="textarea" rows="3" placeholder="예) 목업에서 지점 필터가 있으면 좋겠어요"></textarea>
              <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" :disabled="sending || !comment.trim()" @click="send">문의 남기기</button></div>
            </div>
          </section>
        </div>

        <!-- 사이드: 이력 · 판정 -->
        <aside class="stack-lg min0">
          <section class="card">
            <h2 class="card-title"><Icon3d name="time-clock" :size="22" /> 진행 이력</h2>
            <div class="timeline">
              <div v-for="(h, i) in d.history" :key="h.id" class="tl-item">
                <div class="tl-rail"><span class="tl-dot" aria-hidden="true"></span><span v-if="i < d.history.length - 1" class="tl-line" aria-hidden="true"></span></div>
                <div class="tl-body"><div class="fw-600">{{ h.from === h.to && h.note ? h.note : S[h.to]?.label }}</div><div class="tl-meta">{{ fmtDate(h.at, true) }}<template v-if="h.note && h.from !== h.to"> · {{ h.note }}</template></div></div>
              </div>
            </div>
          </section>
          <section v-if="judgement">
            <h2 class="card-title"><Icon3d name="credit-review" :size="22" /> 정리된 판정</h2>
            <JudgementPanel :judgement="judgement" mode="side" />
            <p class="hint mt-sm">AX-BRM이 검토하며 조정한 내용이 있으면 반영돼요.</p>
          </section>
        </aside>
      </div>

      <!-- 내가 답한 내용: 전체 폭 · 한 열로 아래로 나열(주관식 답이 길어져도 무너지지 않게) · 접힘 기본 -->
      <section class="card mt-lg">
        <button class="row-between ans-toggle" :aria-expanded="showAnswers" @click="showAnswers = !showAnswers">
          <span class="card-title" style="margin:0">📝 내가 답한 내용</span>
          <span class="text-sm text-accent fw-600">{{ showAnswers ? '접기 −' : '펼치기 +' }}</span>
        </button>
        <div v-if="showAnswers" class="ans-list mt-md">
          <section v-for="g in grouped" :key="g.s.key" class="ans-sec" :aria-label="g.s.title">
            <header class="ans-head"><span class="ans-head-title">{{ g.s.title }}</span></header>
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

    </template>
  </div>
</template>

<style scoped>
.rd { padding-top: 28px; padding-bottom: 96px; }
.min0 { min-width: 0; }
.rd-head { padding: 28px; }
.rd-assignee { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rd-head-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 32px; align-items: start; }
.rd-title { font-size: clamp(22px, 2.6vw, 28px); line-height: 1.3; }
.rd-steps { padding-top: 6px; }
/* 오른쪽 판정 패널은 420px — 카드 헤더(제목 + 내부 용어 태그)가 한 줄에 들어가는 폭. 답변 영역이 그만큼 줄어든다 (2026-09-08) */
.rd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 24px; align-items: start; }
@media (max-width: 1024px) { .rd-grid, .rd-head-grid { grid-template-columns: 1fr; } }
.review + .review { border-top: 1px solid var(--line); padding-top: 16px; }
.review-meta { display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 13.5px; color: var(--text-sub); }
.review-meta b { color: var(--text); margin-right: 4px; }
.att { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 14px; }
.cmt { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); font-size: 14px; }
.cmt[data-mine="true"] { background: var(--accent-soft); }
.ans-toggle { width: 100%; text-align: left; padding: 2px 0; }
/* 다단 컬럼: 구간 길이가 달라도 두 열 높이가 자동으로 균형을 맞춘다. 구간은 열 사이에서 끊기지 않는다. */
.ans-list { display: flex; flex-direction: column; gap: 28px; }
.ans-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 4px; background: var(--surface-2); border-radius: var(--radius-sm); }
.ans-head-title { font-size: 13px; font-weight: 700; color: var(--text-sub); }
.ans { margin: 0; }
/* 한 행 = 번호(고정) · 질문(고정 비율) · 답(가변). 구분선은 행 전체에 한 줄로 이어진다. */
.ans-row { display: grid; grid-template-columns: 28px minmax(0, 340px) minmax(0, 1fr); gap: 0 14px; align-items: baseline; padding: 10px 12px; border-top: 1px solid var(--line); }
.ans-row:first-child { border-top: 0; }
.ans-row:hover { background: var(--ink-50); }
.ans-n { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); padding-top: 2px; }
.ans-q { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text-sub); }
.ans-a { margin: 0; font-size: 14px; line-height: 1.5; font-weight: 600; color: var(--text); white-space: pre-wrap; }
.ans-a[data-empty="true"] { font-weight: 400; color: var(--text-muted); font-style: italic; }
@media (max-width: 640px) { .ans-row { grid-template-columns: 28px 1fr; } .ans-a { grid-column: 2; padding-top: 2px; } }
</style>
