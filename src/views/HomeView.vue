<script setup lang="ts">
import Icon3d from '@/components/Icon3d.vue';
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { session, canRequest, HQ_ONLY_NOTICE } from '@/services/session';
import AppModal from '@/components/AppModal.vue';
import { api } from '@/services/api';
import { isPendingDelete } from '@/services/pendingDelete';
import { PRESETS } from '@shared/questions.js';
import type { RequestSummary } from '@/types';
import HeroSequence from '@/components/HeroSequence.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { fmtRelative, fmtDate } from '@/services/format';
import { STATUS } from '@shared/statuses.js';
import { TRACK_LABEL, DATACASE_LABEL, leadtimeText, leadtimeLabel } from '@shared/rules.js';
import ProgressSteps from '@/components/ProgressSteps.vue';

const router = useRouter();
const route = useRoute();
const mine = ref<RequestSummary[]>([]);
const loaded = ref(false);
const drafts = computed(() => mine.value.filter((r) => r.status === 'draft' && !isPendingDelete(r.id)));
const submittedCount = computed(() => mine.value.filter((r) => r.status !== 'draft').length);
const active = computed(() => mine.value.filter((r) => r.status !== 'draft').slice(0, 3));
const firstName = computed(() => session.user?.name || '');

onMounted(async () => {
  try { const { items } = await api.get<{ items: RequestSummary[] }>('/api/requests'); mine.value = items; }
  catch { /* 랜딩은 목록 없이도 동작 */ }
  finally { loaded.value = true; }
});

/** 본부부서 직원이 아니면 상담 화면으로 보내지 않고 안내 모달 — 히어로·프리셋 카드·마지막 CTA 가 전부 이 함수를 탄다 */
const hqNoticeOpen = ref(false);
function start(preset?: string) {
  if (!canRequest.value) { hqNoticeOpen.value = true; return; }
  router.push({ name: 'interview', query: preset ? { preset } : {} });
}
// 라우터 가드가 상담 주소를 직접 친 비대상 직원을 ?notice=hq 로 돌려보낸다 → 같은 모달을 띄우고 주소는 정리
if (route.query.notice === 'hq') { hqNoticeOpen.value = true; router.replace({ name: 'home' }); }

/** 요청 카드의 "지금은" 패널 — 랜딩에서 요청자가 바로 알아야 할 현재 상황 한 줄 + 다음에 일어날 일 한 줄 */
const NOW: Record<string, { now: string; hint: string }> = {
  submitted: { now: '잘 신청됐어요. AX-BRM이 곧 검토를 시작해요.', hint: '보통 3~5영업일 안에 검토 의견을 남겨요.' },
  reviewing: { now: 'AX-BRM이 내용을 살펴보고 있어요.', hint: '확인할 점이 있으면 담당자가 연락드려요.' },
  hold: { now: '몇 가지 확인이 더 필요해요.', hint: '남겨진 의견을 확인하고 보완해 주시면 다시 검토해요.' },
  accepted: { now: '진행이 확정됐어요!', hint: '담당자가 일정과 진행 방식을 협의하러 연락드려요.' },
  developing: { now: '함께 만들고 있어요.', hint: '진행 상황과 목업은 요청 상세에서 확인할 수 있어요.' },
  done: { now: '완성됐어요! 수고 많으셨어요.', hint: '새로운 아이디어가 생기면 언제든 다시 상담해 주세요.' },
  guided: { now: '이미 있는 행내 도구로 해결할 수 있어요.', hint: '안내받은 도구(GENI·알대리) 이용 방법을 상세에서 확인해 주세요.' },
  rejected: { now: '아쉽지만 이번에는 진행이 어려워요.', hint: '사유를 확인하고, 다른 아이디어로 다시 상담할 수 있어요.' },
};
/** 종결 상태(안내 종결·반려)는 상태 배지가 이미 결론을 말하므로 진행 단계 줄을 겹쳐 그리지 않는다 */
const isTerminal = (status: string) => status === 'guided' || status === 'rejected';
/** 카드에 곁들일 핵심 사실 — 진행 방식 · 데이터 방식 · 예상 기간(진행 중인 건만). 판정이 없으면 빈 배열 */
function factsOf(r: RequestSummary): { k: string; v: string }[] {
  const j = r.judgement; if (!j) return [];
  const out: { k: string; v: string }[] = [];
  if (j.track && TRACK_LABEL[j.track]) out.push({ k: '진행 방식', v: TRACK_LABEL[j.track].plain });
  if (j.dataCase && DATACASE_LABEL[j.dataCase]) out.push({ k: '데이터', v: DATACASE_LABEL[j.dataCase].label });
  if (!isTerminal(r.status) && r.status !== 'done' && j.leadtime !== undefined) out.push({ k: `${leadtimeLabel(j).short} (요건 확정 후·참고)`, v: leadtimeText(j.leadtime ?? null) });
  return out;
}
const nowOf = (status: string) => NOW[status] ?? { now: (STATUS as Record<string, { requesterDesc: string }>)[status]?.requesterDesc ?? '', hint: '' };

const faqs = [
  { q: '외부망 개발시 데이터는 어떻게 하나요?', a: '데이터가 필요하면 "모양만 같은" 가짜 데이터로 먼저 만들 수 있어서, 행내 데이터가 밖으로 나가는 일은 없어요. 실제 내부망으로 반입할 때 실데이터 연계 작업을 도와드립니다.' },
  { q: '개발을 전혀 못 하는데요?', a: '괜찮아요. 코딩이 아니라 "이런 화면이 필요해요"라고 말하면 AI가 만들어주는 방식이에요. 기존 업무 프로세스를 어떻게 바꾸고 싶으신지만 명확하면 AI와 대화하며 만들어나갈 수 있어요.' },
  { q: '얼마나 걸리나요?', a: '가짜 데이터로 컨셉과 가능성을 보는건 1~2주일이면 충분해요. 데이터 연계 및 서비스 완성까지는 빠르면 4~8주 정도예요. 개발기간은 프로세스 복잡도에 따라 달라질 수 있어요.' },
  { q: '신청만하면 진행되나요?', a: '모든 요청은 AX-BRM이 검토하고 의견을 남겨요. 서비스 특성에 따라 AI 거버넌스 및 보안성 심의 절차가 진행될 수 있습니다.' },
];
const open = ref<number | null>(null);

const steps = [
  { e: 'employee-conversation', t: '편하게 답하기', d: '기존 처리 방식을 그대로 알려주세요.\n어떻게 바꿀지는 AX-BRM과 함께 고민해요.', m: '잠깐이면 돼요' },
  { e: 'credit-review', t: '정리된 요약 확인', d: '답변이 신청서로 정리돼요.\n진행 방식과 기간을 미리 확인할 수 있어요.', m: '즉시' },
  { e: 'approved-stamp', t: 'AX-BRM 검토·연락', d: '담당자가 내용을 살펴보고 진행 방식과 의견을 남겨요.', m: '3~5영업일' },
  { e: 'ai-toolbox', t: '함께 만들기', d: '진행이 확정되면 함께 만들기 시작해요.\n필요하면 화면 컨셉(목업)을 먼저 봐요.', m: '수 주' },
];

const flow = [
  { e: 'notepad-pen', who: 'AX-BRM', t: '원하는 일 함께 정리', d: '무엇을 만들지 함께 구체화해요.\n필요하면 화면 시안으로 컨셉을 먼저 잡아드려요.', cls: 'card-mint' },
  { e: 'coding-laptop', who: '현업', t: '업무 순서 정리 · 초안 만들기', d: 'AI와 대화하며 업무 순서를 정리하고\n초안을 만들어요. AX-BRM이 도와드려요.', cls: 'flow-me', me: true },
  { e: 'package-conveyor', who: 'AX-BRM', t: '데이터·AI 연결 · 서비스 완성', d: '데이터와 AI 기능을 연결해\n서비스를 완성해요.', cls: 'card-blush' },
];
</script>

<template>
  <div class="home">
    <!-- 히어로 -->
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <p class="eyebrow rise rise-1">AX디지털추진부 · AX-BRM 포탈</p>
          <h1 class="hero-title serif rise rise-2">
            <template v-if="firstName"><span class="hero-name">{{ firstName }}님,</span><br /></template>AI, 잘 몰라도 괜찮아요.<br />
            <span class="hl">하고 싶은 일</span>만 말해주세요.
          </h1>
          <p class="hero-sub rise rise-3">몇 가지 질문에 답하면,<br />AX-BRM이 어떻게 진행할지 함께 도와드려요.</p>
          <div class="row wrap rise rise-4" style="gap:12px">
            <!-- 종 흔들듯 살랑살랑 계속 흔들려 클릭을 유도. 흔들림은 래퍼에 두어 버튼 자체의 hover 스프링과 부딪히지 않게 -->
            <span class="jingle"><button class="btn btn-primary btn-lg" @click="start()">상담 시작하기</button></span>
            <a href="#how" class="btn btn-secondary btn-lg">어떻게 진행되나요?</a>
          </div>
          <div v-if="drafts.length" class="resume rise rise-4">
            <span aria-hidden="true">✏️</span>
            <span class="grow">작성 중인 상담이 있어요 — <b>{{ drafts[0].title || '제목 없음' }}</b> <span class="text-muted text-sm">({{ fmtRelative(drafts[0].updatedAt) }})</span></span>
            <router-link v-if="canRequest" :to="{ name: 'interview', params: { id: drafts[0].id } }" class="btn btn-secondary btn-sm">이어하기</router-link>
          </div>
        </div>
        <div class="hero-art rise rise-3"><HeroSequence /></div>
      </div>
    </section>


    <!-- 내 요청 현황 -->
    <section v-if="active.length" class="section">
      <div class="container">
        <div class="row-between mb-md">
          <h2 class="sec-title">내 요청 현황 <span class="sec-count num">{{ submittedCount }}건</span></h2>
          <router-link to="/requests" class="text-sm">전체 보기 →</router-link>
        </div>
        <!-- 건수에 맞춰 판을 짠다: 1건은 가로로 펼친 대표 카드(진행 단계 + "지금은" 패널), 2건은 2열, 3건은 3열 -->
        <div class="req-grid" :data-count="active.length">
          <router-link v-for="r in active" :key="r.id" :to="{ name: 'request', params: { id: r.id } }" class="card card-hover req-card" :class="{ featured: active.length === 1 }">
            <div class="req-main">
              <div class="row-between">
                <span class="text-xs text-muted">요청일 {{ fmtDate(r.submittedAt) }}<span v-if="r.reqNo" class="req-no"> · <span class="num">{{ r.reqNo }}</span></span></span>
                <StatusBadge :status="r.status" size="sm" />
              </div>
              <div class="req-title fw-700 mt-sm">{{ r.title || '제목 없음' }}</div>
              <dl v-if="factsOf(r).length" class="req-facts">
                <div v-for="f in factsOf(r)" :key="f.k" class="req-fact"><dt>{{ f.k }}</dt><dd>{{ f.v }}</dd></div>
              </dl>
              <ProgressSteps v-if="!isTerminal(r.status)" :status="r.status" :compact="active.length > 1" class="mt-md" />
              <div class="text-xs text-muted mt-sm">{{ fmtRelative(r.updatedAt) }} 업데이트</div>
            </div>
            <div class="req-now">
              <span class="req-now-label">지금은</span>
              <span class="req-now-text">{{ nowOf(r.status).now }}</span>
              <span v-if="nowOf(r.status).hint" class="req-now-hint text-sm text-sub">{{ nowOf(r.status).hint }}</span>
              <span class="req-now-cta text-sm text-accent fw-600">자세히 보기 →</span>
            </div>
          </router-link>
        </div>
      </div>
    </section>

    <!-- 공감 카드 -->
    <section class="section">
      <div class="container">
        <p class="eyebrow">이런 고민 있으셨죠?</p>
        <h2 class="sec-title mt-sm">하나라도 해당되면, 바로 시작해도 좋아요</h2>
        <p class="text-sub mt-sm">카드를 누르면 그 고민에 맞춰 상담이 시작돼요.</p>
        <div class="grid-4 mt-lg">
          <button v-for="(p, i) in PRESETS" :key="p.key" class="card card-hover preset" :class="i % 2 === 0 ? 'card-mint' : 'card-blush'" @click="start(p.key)">
            <span class="preset-emoji" aria-hidden="true"><Icon3d v-if="p.icon" :name="p.icon" :size="34" /><template v-else>{{ p.emoji }}</template></span>
            <span class="preset-title fw-700 text-lg">{{ p.title }}</span>
            <span class="preset-desc text-sm text-sub">{{ p.desc }}</span>
            <span class="preset-cta text-sm text-accent fw-600">이 고민으로 시작 →</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 진행 순서 -->
    <section id="how" class="section section-alt">
      <div class="container">
        <p class="eyebrow">이렇게 진행돼요</p>
        <h2 class="sec-title mt-sm">신청부터 함께 만들기까지</h2>
        <ol class="how-grid mt-lg">
          <li v-for="(s, i) in steps" :key="i" class="card how-card">
            <span class="how-num num" aria-hidden="true">{{ i + 1 }}</span>
            <span class="how-emoji" aria-hidden="true"><Icon3d :name="s.e" :size="34" /></span>
            <span class="fw-700 text-lg">{{ s.t }}</span>
            <span class="text-sm text-sub" style="white-space:pre-line">{{ s.d }}</span>
            <span class="badge mt-sm" data-tone="neutral">{{ s.m }}</span>
          </li>
        </ol>
      </div>
    </section>

    <!-- 함께 만드는 방식 (역할 분담) -->
    <section class="section">
      <div class="container">
        <p class="eyebrow">함께 만드는 방식</p>
        <h2 class="sec-title mt-sm">역할을 나눠 이렇게 만들어요</h2>
        <ol class="flow-grid mt-lg">
          <li v-for="(f, i) in flow" :key="i" class="card flow-card" :class="f.cls">
            <!-- 현업 카드만 앞으로 — 세 단계 중 현업이 직접 맡는 곳이 한눈에 보이게. 화면은 BRM도 보므로 "내" 같은 1인칭은 쓰지 않는다 (2026-09-09) -->
            <span v-if="f.me" class="flow-me-tag">현업이 맡는 단계</span>
            <div class="row-between" style="width:100%">
              <span class="flow-emoji" aria-hidden="true"><Icon3d :name="f.e" :size="36" /></span>
              <span class="badge" :data-tone="f.who === 'AX-BRM' ? 'brand' : 'success'">{{ f.who }}</span>
            </div>
            <h3 class="text-lg fw-700">{{ f.t }}</h3>
            <p class="text-sm text-sub" style="white-space:pre-line">{{ f.d }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- FAQ -->
    <section class="section section-alt">
      <div class="container">
        <p class="eyebrow">자주 묻는 질문</p>
        <h2 class="sec-title mt-sm">궁금한 점, 먼저 답해드릴게요</h2>
        <div class="faq mt-lg">
          <div v-for="(f, i) in faqs" :key="i" class="faq-item">
            <button class="faq-q" :aria-expanded="open === i" @click="open = open === i ? null : i">
              <span class="grow">{{ f.q }}</span><span aria-hidden="true">{{ open === i ? '−' : '+' }}</span>
            </button>
            <div class="faq-a" :data-open="open === i"><div><p class="text-sub">{{ f.a }}</p></div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 마지막 CTA -->
    <section class="cta">
      <div class="container center">
        <h2 class="serif cta-title">고민만 있어도 충분해요.<br />나머지는 함께 정리해요.</h2>
        <div class="row wrap mt-lg" style="justify-content:center;gap:12px">
          <button class="btn btn-lg cta-btn" @click="start()">상담 시작하기</button>
          <router-link to="/requests" class="btn btn-lg cta-ghost">내 요청 보기</router-link>
        </div>
      </div>
    </section>

    <footer class="foot">
      <div class="container row-between wrap text-xs text-muted">
        <span>IBK AX디지털추진부 · AX-BRM 포탈</span>
        <span>궁금한 점은 AX디지털추진부 AX추진기획팀으로 문의해 주세요</span>
      </div>
    </footer>

    <!-- 본부부서가 아닌 직원 — 상담 시작·프리셋 카드·이어하기 대신 안내만. 서버(HQ_ONLY)가 같은 규칙으로 쓰기 API 를 막는다 -->
    <AppModal v-if="hqNoticeOpen" :title="HQ_ONLY_NOTICE.title" @close="hqNoticeOpen = false">
      <p v-for="line in HQ_ONLY_NOTICE.lines" :key="line" class="text-sm hq-line">{{ line }}</p>
      <template #foot><button class="btn btn-primary" @click="hqNoticeOpen = false">확인</button></template>
    </AppModal>
  </div>
</template>

<style scoped>
.hq-line { line-height: 1.7; }
.hq-line + .hq-line { margin-top: 6px; }
.hero { padding: 56px 0 40px; }
.hero-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 40px; align-items: center; }
.hero-title { font-size: clamp(30px, 4.2vw, 46px); line-height: 1.25; margin: 14px 0 18px; color: var(--ink-900); text-wrap: initial; }
.hero-name { color: var(--accent); }
/* 형광펜 — 글자 아래 2/3 를 덮는 노란 띠. 양 끝을 살짝 비스듬히 흐려 펜이 지나간 느낌, multiply 로 글자는 그대로 진하게 */
.hl {
  padding: 0 4px;
  margin: 0 -2px;
  --marker-ink: rgba(255, 233, 92, .5); /* --marker(#FFE95C) 투명도 50% — 구형 브라우저 호환을 위해 color-mix 대신 rgba */
  background-image: linear-gradient(100deg, transparent 0, var(--marker-ink) 3%, var(--marker-ink) 96%, transparent 100%);
  background-repeat: no-repeat;
  background-size: 100% 66%;
  background-position: 0 84%;
  border-radius: 2px;
  mix-blend-mode: multiply;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.hero-sub { font-size: 17px; color: var(--text-sub); margin-bottom: 26px; }
@media (max-width: 640px) { .hero-title { text-wrap: balance; } .hero-sub br { display: none; } }
.hero-art { display: flex; justify-content: center; }
.resume { display: flex; align-items: center; gap: 10px; margin-top: 22px; padding: 12px 16px; background: var(--sand); border-radius: var(--radius-md); font-size: 14px; }
.section { padding: 64px 0; }
.section-alt { background: var(--surface); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.sec-title { font-size: 26px; font-weight: 700; }
.sec-count { font-size: 15px; font-weight: 600; color: var(--text-muted); margin-left: 6px; vertical-align: 2px; }
/* 카드 안 4개 존(이모지·제목·설명·CTA)의 시작선을 카드끼리 맞춘다:
   제목은 2줄 높이를 예약해 1줄짜리 제목도 설명 시작선이 같고, CTA는 margin-top:auto 로 항상 좌측 하단 */
.preset { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; height: 100%; text-align: left; cursor: pointer; }
.preset-emoji { font-size: 30px; line-height: 34px; height: 34px; margin-bottom: 4px; } /* 3D 아이콘(34px)과 이모지 대체가 같은 높이를 차지한다 */
.preset-title { min-height: calc(2 * 1.4em); line-height: 1.4; align-content: flex-start; white-space: pre-line; }
.preset-desc { white-space: pre-line; }
.preset-cta { margin-top: auto; padding-top: 14px; }
/* 내 요청 현황 — 열 수를 건수에 맞춘다(1·2·3열). 1건일 때는 카드가 가로로 펼쳐져 오른쪽에 "지금은" 패널이 자리해 빈 공간이 남지 않는다 */
.req-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-md); }
.req-grid[data-count="1"] { grid-template-columns: 1fr; }
.req-grid[data-count="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.req-card { color: inherit; display: flex; flex-direction: column; gap: 16px; }
.req-card:hover { text-decoration: none; }
.req-main { min-width: 0; }
.req-title { line-height: 1.4; overflow-wrap: anywhere; }
.req-facts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 10px 0 0; }
.req-fact { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 13px; }
.req-fact dt { flex: none; font-size: 11.5px; font-weight: 600; color: var(--text-muted); }
.req-fact dd { margin: 0; font-weight: 600; color: var(--text-sub); overflow-wrap: anywhere; }
.req-grid[data-count="3"] .req-facts { flex-direction: column; gap: 4px; }
.req-grid[data-count="3"] .req-fact dd { font-size: 12.5px; }
.req-grid[data-count="3"] .req-no { display: none; }
.req-main > .row-between { gap: 8px; align-items: flex-start; }
.req-main > .row-between > .text-xs { white-space: nowrap; padding-top: 3px; }
.req-now { display: flex; flex-direction: column; gap: 6px; margin-top: auto; padding: 14px 16px; background: var(--brand-50); border-radius: var(--radius-md); font-size: 14px; }
.req-now-label { font-size: 11.5px; font-weight: 700; color: var(--brand-700); letter-spacing: .04em; }
.req-now-text { font-weight: 600; }
.req-now-cta { margin-top: 6px; }
.req-card.featured { flex-direction: row; align-items: stretch; gap: 32px; padding: 28px 32px; }
.req-card.featured .req-main { flex: 1 1 auto; display: flex; flex-direction: column; }
.req-card.featured .req-title { font-size: 20px; margin-top: 10px; }
.req-card.featured .req-facts { margin-top: 12px; gap: 6px 24px; }
.req-card.featured .req-fact { font-size: 14px; }
.req-card.featured .req-fact dt { font-size: 12px; }
.req-card.featured :deep(.ps) { max-width: 520px; margin-top: 22px; }
.req-card.featured .req-now { flex: 0 0 320px; margin-top: 0; padding: 18px 20px; font-size: 15px; }
.req-grid[data-count="3"] .req-now-hint { display: none; }
.how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.how-card { display: flex; flex-direction: column; gap: 6px; position: relative; }
.how-num { position: absolute; top: 18px; right: 20px; font-family: var(--font-mono); color: var(--text-muted); font-size: 13px; }
.how-emoji { font-size: 28px; }
.flow-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.flow-card { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 28px; position: relative; }
.flow-emoji { font-size: 30px; }
/* 현업 카드 강조: 브랜드색 굵은 테두리 + 그림자로 한 단 앞에, 위쪽 꼬리표. 좌우 AX-BRM 카드는 옅은 색 그대로라 대비가 생긴다 */
.flow-card.flow-me { border: 2px solid var(--brand-500); background: var(--surface); box-shadow: var(--shadow-accent); overflow: visible; }
.flow-card.flow-me h3 { color: var(--brand-700); }
.flow-me-tag { position: absolute; top: -13px; left: 24px; padding: 4px 12px; border-radius: var(--radius-full); background: var(--brand-500); color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .02em; box-shadow: var(--shadow-accent); }
@media (min-width: 900px) { .flow-card.flow-me { transform: translateY(-10px) scale(1.02); } }
.faq { max-width: var(--column-max); }
.faq-item { border-bottom: 1px solid var(--line); }
.faq-q { width: 100%; display: flex; align-items: center; gap: 12px; padding: 18px 4px; font-weight: 700; font-size: 16px; text-align: left; color: var(--text); }
.faq-a { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--transition); }
.faq-a[data-open="true"] { grid-template-rows: 1fr; }
.faq-a > div { overflow: hidden; }
.faq-a p { padding: 0 4px 18px; }
.cta { background: var(--brand-500); color: #fff; padding: 72px 0; }
.cta-title { font-size: clamp(26px, 3.4vw, 38px); line-height: 1.3; color: #fff; }
/* 살랑살랑 — 멈춤 없이 ±2° 로 계속 흔들린다. 한 왕복 1.4초(느리면 눈에 안 띈다), 양 끝에서 ease-in-out 으로 되돌아서 멈칫하지 않는다. 위쪽(매단 자리)을 축으로 */
.jingle { display: inline-block; transform-origin: 50% -30%; animation: jingle 1.4s ease-in-out infinite; will-change: transform; }
.jingle:hover, .jingle:focus-within { animation-play-state: paused; }
@keyframes jingle { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
.cta-btn { background: #fff; color: var(--brand-700); }
.cta-btn:hover { background: var(--brand-50); }
.cta-ghost { color: #fff; border-color: rgba(255,255,255,.55); }
.cta-ghost:hover { background: rgba(255,255,255,.1); text-decoration: none; }
.foot { padding: 24px 0; }
@media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; } .hero-art { order: -1; } .hero-art :deep(.hs) { max-width: 440px; } .section { padding: 44px 0; } }
@media (max-width: 900px) { .req-grid, .req-grid[data-count="2"] { grid-template-columns: 1fr; } .req-card.featured { flex-direction: column; gap: 16px; padding: 24px; } .req-card.featured .req-now { flex-basis: auto; } .req-grid[data-count="3"] .req-now-hint { display: block; } }
</style>
