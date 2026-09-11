<script setup lang="ts">
import Icon3d from '@/components/Icon3d.vue';
import { ref, computed, onMounted } from 'vue';
import { api, humanMessage } from '@/services/api';
import { canRequest, HQ_ONLY_NOTICE } from '@/services/session';
import { toast } from '@/services/toast';
import { isPendingDelete, scheduleDelete, cancelDelete } from '@/services/pendingDelete';
import type { RequestSummary } from '@/types';
import StatusBadge from '@/components/StatusBadge.vue';
import ProgressSteps from '@/components/ProgressSteps.vue';
import { fmtDate, fmtRelative } from '@/services/format';
import { STATUS } from '@shared/statuses.js';
import { TRACK_LABEL } from '@shared/rules.js';

const items = ref<RequestSummary[]>([]);
const loading = ref(true);
const error = ref('');
const drafts = computed(() => items.value.filter((r) => r.status === 'draft' && !isPendingDelete(r.id)));
const submitted = computed(() => items.value.filter((r) => r.status !== 'draft'));
const S = STATUS as Record<string, { requesterDesc: string }>;

async function load() {
  loading.value = true;
  try { items.value = (await api.get<{ items: RequestSummary[] }>('/api/requests')).items; }
  catch (e) { error.value = humanMessage(e); }
  finally { loading.value = false; }
}
onMounted(load);

/** 목록에서는 바로 숨기고 서버 삭제는 8초 뒤 — 그 사이 화면을 떠나도 pendingDelete 가 바로 보내 준다 */
function removeDraft(r: RequestSummary) {
  scheduleDelete(r.id, { onError: (e) => { toast(humanMessage(e), 'danger'); load(); } });
  toast('작성 중인 상담을 지웠어요.', 'info', { action: { label: '실행 취소', run: () => { cancelDelete(r.id); } } });
}
</script>

<template>
  <div class="container" style="padding-top:32px;padding-bottom:96px">
    <div class="row-between wrap mb-lg">
      <div><p class="eyebrow">내 요청</p><h1 style="font-size:26px;margin-top:6px">신청한 상담과 작성 중인 상담</h1></div>
      <!-- 목록이 비어 있으면 빈 상태 카드의 "상담 시작하기"가 유일한 CTA — 같은 버튼을 둘 두지 않는다 -->
      <router-link v-if="canRequest && !loading && items.length" :to="{ name: 'interview' }" class="btn btn-primary">새 상담 시작하기</router-link>
    </div>

    <!-- 본부부서가 아닌 직원 — 안내를 위에 두고, 규칙 적용 전에 올린 기존 요청은 아래에서 조회만 할 수 있다 (2026-09-11).
         새 상담·이어하기 버튼은 숨기고 서버도 쓰기 API 를 HQ_ONLY 로 막는다 -->
    <div v-if="!canRequest" class="card hq-notice mb-lg" role="status">
      <div class="row" style="gap:14px;align-items:flex-start">
        <span class="hq-emoji" aria-hidden="true">🏢</span>
        <div>
          <div class="fw-700">{{ HQ_ONLY_NOTICE.title }}</div>
          <p v-for="line in HQ_ONLY_NOTICE.lines" :key="line" class="text-sm text-sub hq-line">{{ line }}</p>
        </div>
      </div>
    </div>
    <div v-if="loading" class="center" style="padding:64px" role="status"><div class="spinner" style="margin:0 auto" aria-hidden="true"></div></div>
    <div v-else-if="error" class="empty"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div><button class="btn btn-secondary mt-md" @click="load">다시 불러오기</button></div>

    <template v-else>
      <section v-if="drafts.length" class="mb-xl">
        <p class="eyebrow mb-sm">작성 중</p>
        <div class="grid-3">
          <div v-for="r in drafts" :key="r.id" class="card">
            <div class="row-between"><StatusBadge status="draft" size="sm" /><span class="text-xs text-muted">{{ fmtRelative(r.updatedAt) }}</span></div>
            <div class="fw-700 mt-sm">{{ r.title || '아직 제목이 없어요' }}</div>
            <div class="row mt-md"><router-link v-if="canRequest" :to="{ name: 'interview', params: { id: r.id } }" class="btn btn-primary btn-sm">이어하기</router-link><button class="btn btn-ghost btn-sm" @click="removeDraft(r)">지우기</button></div>
          </div>
        </div>
      </section>

      <section>
        <p class="eyebrow mb-sm">신청한 상담</p>
        <div v-if="!submitted.length" class="empty card">
          <div class="empty-emoji" aria-hidden="true"><Icon3d name="customer-chatbot" :size="48" /></div>
          <div class="empty-title">아직 신청한 상담이 없어요</div>
          <template v-if="canRequest">
            <p>고민만 있어도 충분해요. 몇 가지 질문에 답하면 첫 상담을 신청할 수 있어요.</p>
            <router-link :to="{ name: 'interview' }" class="btn btn-primary mt-lg">상담 시작하기</router-link>
          </template>
          <p v-else>이 시스템에서는 새 상담을 신청할 수 없어요. 업무 개선 아이디어는 지식제안을 이용해 주세요.</p>
        </div>
        <div v-else class="stack-sm">
          <router-link v-for="r in submitted" :key="r.id" :to="{ name: 'request', params: { id: r.id } }" class="card card-hover req">
            <div class="req-grid">
              <div>
                <div class="row wrap"><span class="text-xs text-muted">요청일 {{ fmtDate(r.submittedAt) }}</span><StatusBadge :status="r.status" size="sm" /><span v-if="r.judgement?.track" class="badge" data-tone="neutral" style="font-size:11.5px">{{ TRACK_LABEL[r.judgement.track].plain }}</span></div>
                <div class="fw-700 mt-sm text-lg">{{ r.title }}</div>
                <div class="text-sm text-sub mt-sm">{{ S[r.status]?.requesterDesc }}</div>
                <div class="text-xs text-muted mt-sm">업데이트 {{ fmtRelative(r.updatedAt) }} · 접수번호 <span class="identifier">{{ r.reqNo }}</span> · 담당 AX-BRM <b v-if="r.assignee" class="req-assignee">{{ r.assignee.name }}{{ r.assignee.position ? ' ' + r.assignee.position : '' }}</b><span v-else>미지정</span></div>
              </div>
              <ProgressSteps :status="r.status" class="req-steps" />
            </div>
          </router-link>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.hq-notice { background: var(--accent-soft); border-color: transparent; }
.hq-emoji { font-size: 28px; line-height: 1; }
.hq-line { line-height: 1.6; margin: 4px 0 0; }
.req { display: block; color: inherit; }
.req:hover { text-decoration: none; }
.req-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: center; }
.req-steps { padding-top: 4px; }
.req-assignee { color: var(--text); font-weight: 700; }
@media (max-width: 860px) { .req-grid { grid-template-columns: 1fr; } }
</style>
