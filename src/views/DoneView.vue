<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, humanMessage } from '@/services/api';
import type { RequestFull } from '@/types';
import { computed } from 'vue';
import { leadtimeText, leadtimeLabel, LEADTIME_CAVEAT } from '@shared/rules.js';

const route = useRoute();
const req = ref<RequestFull | null>(null);
const error = ref('');
const j = computed(() => req.value?.judgement ?? null);
const lt = computed(() => leadtimeLabel(j.value));
onMounted(async () => {
  try { req.value = (await api.get<{ request: RequestFull }>(`/api/requests/${route.params.id}`)).request; }
  catch (e) { error.value = humanMessage(e); }
});
</script>

<template>
  <div class="column" style="padding-top:56px;padding-bottom:96px">
    <div v-if="error" class="empty"><div class="empty-emoji" aria-hidden="true">☁️</div><div class="empty-title">{{ error }}</div></div>
    <div v-else-if="req" class="card done rise">
      <svg class="check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--mint)"/><path d="M20 33l8 8 16-18" fill="none" stroke="var(--brand-500)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="check-path"/></svg>
      <p class="eyebrow mt-md">신청 완료</p>
      <h1 class="serif" style="font-size:28px;margin-top:8px">잘 신청됐어요!</h1>
      <p class="text-sub mt-sm">접수번호 <b class="identifier" style="color:var(--text)">{{ req.reqNo }}</b> · <b>{{ req.title }}</b></p>

      <div class="card card-soft mt-xl" style="text-align:left">
        <h2 class="card-title">다음은 이렇게 진행돼요</h2>
        <ol class="stack-sm text-sm">
          <li class="row" style="align-items:flex-start"><span class="num fw-700" style="color:var(--accent)">1</span><span><b>3~5영업일 안에</b> AX-BRM 담당자가 내용을 검토하고 의견을 남겨요. 필요하면 짧게 연락드릴 수 있어요.</span></li>
          <li class="row" style="align-items:flex-start"><span class="num fw-700" style="color:var(--accent)">2</span><span>의견과 진행 상태는 <b>내 요청</b> 화면에서 볼 수 있어요. 궁금한 점은 그 화면에서 문의를 남기면 돼요.</span></li>
          <li class="row" style="align-items:flex-start"><span class="num fw-700" style="color:var(--accent)">3</span><span>진행이 확정되면 함께 만들기 시작해요. 필요하면 화면 컨셉(목업)을 먼저 보여드려요.</span></li>
        </ol>
      </div>

      <!-- 요건 확정 후 개발 예상 기간 — 신청 중·요약 화면과 같은 기준·같은 문구 (2026-09-08) -->
      <div v-if="j?.leadtime" class="card mt-md lead" style="text-align:left" data-testid="done-leadtime">
        <div class="row-between wrap" style="gap:8px;align-items:baseline">
          <h2 class="card-title" style="margin:0">{{ lt.title }} <span class="badge" data-tone="warning" style="font-size:10.5px;padding:1px 7px;vertical-align:middle">예상치 · 확정 아님</span></h2>
          <b class="num lead-value" :class="{ 'is-tbd': j.leadtime.tbd }"><span v-if="!j.leadtime.tbd" class="lead-tag">예상</span>{{ leadtimeText(j.leadtime) }}</b>
        </div>
        <p v-if="!j.leadtime.tbd" class="lead-caveat"><span aria-hidden="true">≈</span>{{ LEADTIME_CAVEAT }}</p>
        <p class="text-sm text-sub mt-sm" style="margin-bottom:0">{{ j.leadtime.tbd ? lt.sub : lt.sub + ' ' + lt.note }}</p>
      </div>

      <div class="row wrap mt-xl" style="justify-content:center">
        <router-link :to="{ name: 'request', params: { id: req.id } }" class="btn btn-primary btn-lg">요청 상세 보기</router-link>
        <router-link to="/" class="btn btn-secondary btn-lg">홈으로</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.done { text-align: center; padding: 48px 40px; border-radius: var(--radius-lg); }
.lead { border: 1.5px dashed var(--warning-fill); background: color-mix(in srgb, var(--warning-bg) 35%, var(--surface)); }
.lead-value { font-size: 20px; font-weight: 700; color: var(--text); }
.lead-tag { display: inline-block; vertical-align: middle; margin: -3px 8px 0 0; padding: 2px 8px; border-radius: var(--radius-full); background: var(--warning-bg); color: var(--warning); font-size: 12px; font-weight: 700; }
.lead-caveat { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12.5px; font-weight: 600; color: var(--warning); }
.lead-caveat > span { font-size: 15px; line-height: 1; }
.lead-value.is-tbd { font-size: 15px; color: var(--text-sub); }
.check { width: 72px; height: 72px; margin: 0 auto; }
.check-path { stroke-dasharray: 40; stroke-dashoffset: 40; animation: draw .7s var(--ease-out) .2s forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
</style>
