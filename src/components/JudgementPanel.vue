<script setup lang="ts">
import Icon3d from '@/components/Icon3d.vue';
/**
 * 판정(초안) 패널 — 사이드(요약) / 풀(결과·검토 화면) 두 모드.
 * 라벨 3층: plain(실제 행동, 제목) · analogy(비유, 보조 한 줄) · label(BRM 내부 용어 — internal 모드에서 우상단 태그).
 */
import { computed, ref } from 'vue';
import { TRACK_LABEL, DATACASE_LABEL, INTEGRATION_LABEL, leadtimeText, leadtimeLabel, weeksText, LEADTIME_CAVEAT, GOVERNANCE_NOTICES, EMBED_NOTICE } from '@shared/rules.js';
import type { Judgement } from '@/types';

const props = defineProps<{ judgement: Judgement; mode?: 'side' | 'full'; internal?: boolean }>();
type L = { label: string; plain: string; analogy: string; desc: string };
const D = DATACASE_LABEL as Record<string, L>;
const I = INTEGRATION_LABEL as Record<string, L & { weeks: number[] }>;

const cards = computed(() => {
  const j = props.judgement;
  const t = TRACK_LABEL[j.track];
  const out: { key: string; emoji: string; title: string; plain: string; analogy: string; desc: string; internal: string; tone: string }[] = [
    { key: 'track', emoji: j.track === 'dev' ? 'ai-toolbox' : j.track === 'consult' ? 'employee-conversation' : 'rocket-launch', title: '어떻게 도울까요', plain: t.plain, analogy: t.analogy, desc: t.desc, internal: t.label, tone: 'mint' },
  ];
  if (j.dataCase) out.push({ key: 'data', emoji: j.dataCase === 'A' ? 'loan-calculator' : j.dataCase === 'B' ? 'home-key' : 'secure-folder', title: '만들 때 데이터는', plain: D[j.dataCase].plain, analogy: D[j.dataCase].analogy, desc: D[j.dataCase].desc, internal: D[j.dataCase].label, tone: '' });
  if (j.integration) out.push({ key: 'integ', emoji: { none: 'approved-stamp', mart: 'analytics-dashboard', api: 'bank-transfer', file: 'project-folder', bulk: 'document-stack', bdp: 'package-conveyor', tbd: 'magnifying-glass' }[j.integration] || 'magnifying-glass', title: '완성 후 행내 데이터 연결은', plain: I[j.integration].plain, analogy: I[j.integration].analogy, desc: I[j.integration].desc, internal: I[j.integration].label, tone: '' });
  return out;
});
const flagEmoji: Record<string, string> = { warn: 'risk-review', info: 'lightbulb-idea', check: 'magnifying-glass' };
const full = computed(() => props.mode === 'full');
const lt = computed(() => leadtimeLabel(props.judgement));
const hasParallel = computed(() => !!props.judgement.leadtime?.items.some((i) => i.parallel));

/**
 * 항목을 시간축 위에 놓는다 (길이는 최대치 기준, 라벨은 범위 그대로).
 *  · 차례로 진행 항목은 앞 항목이 끝난 뒤 시작
 *  · 병행 항목은 개발(AI와 함께 초안 만들기) 시작점부터 심의 → 연결 순서로 이어서 진행 — 개발 막대와 같은 구간에 그려진다
 *  · 병행 묶음이 개발보다 길면 그 뒤 항목(반입 점검)은 병행이 끝난 뒤 시작 → 튀어나온 부분(over)만 합계에 더해진다
 */
interface GRow { label: string; weeks: string; parallel: boolean; start: number; end: number; over: number }
const gantt = computed(() => {
  const items = props.judgement.leadtime?.items ?? [];
  const rows: GRow[] = [];
  let t = 0, devStart = 0, devEnd = 0, parCursor = -1, parEnd = 0;
  for (const it of items) {
    // dev 플래그가 없는 옛 판정 스냅샷은 라벨로 판별 (2026-09-09 이전 접수 건)
    const isDev = !!it.dev || (!it.parallel && /초안/.test(it.label));
    if (!it.parallel) {
      if (parEnd > t) t = parEnd; // 병행 묶음이 개발보다 길면 그 뒤부터
      const start = t, end = t + it.max;
      if (isDev) { devStart = start; devEnd = end; parCursor = start; }
      rows.push({ label: it.label, weeks: weeksText(it), parallel: false, start, end, over: 0 });
      t = end;
    } else {
      const start = parCursor < 0 ? devStart : parCursor, end = start + it.max;
      parCursor = end; parEnd = Math.max(parEnd, end);
      rows.push({ label: it.label, weeks: weeksText(it), parallel: true, start, end, over: Math.max(0, end - devEnd) });
    }
  }
  const total = Math.max(1, t, parEnd);
  const step = total > 16 ? 4 : 2;
  const ticks: number[] = []; for (let w = 0; w <= total; w += step) ticks.push(w);
  return { rows, total, devStart, devEnd, hasDev: devEnd > devStart, ticks };
});
const pct = (v: number) => `${(v / gantt.value.total) * 100}%`;
const showAllFlags = ref(false);
const shownFlags = computed(() => (full.value || showAllFlags.value ? props.judgement.flags : props.judgement.flags.slice(0, 2)));
const hiddenFlagCount = computed(() => (full.value || showAllFlags.value ? 0 : Math.max(0, props.judgement.flags.length - 2)));
</script>

<template>
  <div class="jp" :class="{ full }">
    <!-- 판정 카드 -->
    <div class="jp-cards jp-judge" :data-count="cards.length">
      <article v-for="c in cards" :key="c.key" class="jcard" :data-tone="c.tone">
        <header class="jcard-head">
          <span class="jcard-emoji" aria-hidden="true"><Icon3d :name="c.emoji" :size="26" /></span>
          <span class="jcard-title">{{ c.title }}</span>
          <span v-if="internal" class="jcard-internal" :title="'BRM 내부 용어'">{{ c.internal }}</span>
        </header>
        <p class="jcard-plain">{{ c.plain }}</p>
        <p v-if="c.analogy" class="jcard-analogy"><span aria-hidden="true">💬</span>{{ c.analogy }}</p>
        <p v-if="full" class="jcard-desc">{{ c.desc }}</p>
      </article>
    </div>

    <!-- 예상 기간 -->
    <section class="jcard jcard-lead" :aria-label="lt.title">
      <header class="jcard-head">
        <span class="jcard-emoji" aria-hidden="true"><Icon3d name="task-calendar" :size="26" /></span>
        <span class="jcard-title">{{ lt.title }}</span>
        <span class="badge" data-tone="warning" style="font-size:10.5px;padding:1px 7px">예상치 · 확정 아님</span>
      </header>
      <!-- 기준을 먼저 읽게 한다 — "요건 확정 후" · "예상" · "달라질 수 있음" 이 숫자보다 앞에 온다 (2026-09-08) -->
      <p class="jcard-lead-sub">{{ lt.sub }}</p>
      <!-- 숫자는 "예상" 태그와 한 덩어리로, 바로 아래 경고 한 줄 — 실제 기간으로 읽히지 않게 (2026-09-09) -->
      <p class="jcard-lead-value num" :class="{ 'is-tbd': judgement.leadtime?.tbd }"><span v-if="!judgement.leadtime?.tbd" class="lead-tag">예상</span>{{ leadtimeText(judgement.leadtime) }}</p>
      <p v-if="!judgement.leadtime?.tbd" class="jcard-lead-caveat"><span aria-hidden="true">≈</span>{{ LEADTIME_CAVEAT }}</p>
      <!-- 답이 거의 없는 요청(상담 필요·데이터 전부 모름)은 숫자 대신 협의 안내. 세부 항목은 BRM 화면(internal)에서만 참고용으로 -->
      <p v-if="judgement.leadtime?.tbd" class="jcard-desc">아직 정해진 내용이 적어 기간을 잡지 않았어요. AX-BRM과 상담하며 어떤 도움이 맞는지, 데이터가 필요한지가 정해지면 그때 기간을 안내해요.</p>
      <template v-if="judgement.leadtime && full && (!judgement.leadtime.tbd || internal)">
        <p v-if="judgement.leadtime.tbd" class="text-xs text-muted" style="margin:8px 0 4px">BRM 참고 — "새로 만드는 경우"를 가정한 초안 약 {{ judgement.leadtime.min }}~{{ judgement.leadtime.max }}주</p>
        <!-- 타임라인 — 어떤 항목이 어느 구간에서 같이 진행되는지 막대 위치로 보여 준다 (2026-09-08).
             병행 항목은 개발 막대와 같은 구간에서 시작하고, 개발보다 더 걸리는 부분만 빗금으로 튀어나온다 → 그만큼만 합계에 더해진다 -->
        <div class="gt" data-testid="lt-gantt" role="img" :aria-label="judgement.leadtime.items.map((it) => `${it.label} ${weeksText(it)}${it.parallel ? ' (초안 만들기와 동시에 진행)' : ''}`).join(', ')">
          <div v-for="(r, i) in gantt.rows" :key="i" class="gt-row" :class="{ parallel: r.parallel }">
            <span class="gt-label">{{ r.label }}<span v-if="r.parallel" class="gt-tag">초안 만들기와 동시에</span></span>
            <span class="gt-track">
              <i v-if="r.parallel && gantt.hasDev" class="gt-band" :style="{ left: pct(gantt.devStart), width: pct(gantt.devEnd - gantt.devStart) }" aria-hidden="true"></i>
              <i class="gt-bar" :class="{ parallel: r.parallel }" :style="{ left: pct(r.start), width: pct(r.end - r.start) }" aria-hidden="true"></i>
              <i v-if="r.over > 0" class="gt-bar over" :style="{ left: pct(r.end - r.over), width: pct(r.over) }" :title="`개발보다 ${r.over}주 더 걸리는 부분 — 이만큼만 합계에 더해요`" aria-hidden="true"></i>
            </span>
            <span class="gt-weeks num">{{ r.weeks }}</span>
          </div>
          <div class="gt-ticks" aria-hidden="true"><span></span><span class="gt-ticks-track"><i v-for="w in gantt.ticks" :key="w" :style="{ left: pct(w) }"><b>{{ w }}</b>{{ w === 0 ? '주' : '' }}</i></span><span></span></div>
          <p v-if="hasParallel" class="lt-legend" data-testid="lt-legend">
            <span class="lt-legend-item"><span class="lt-dot" aria-hidden="true"></span>순서대로 진행</span>
            <span class="lt-legend-item"><span class="lt-dot parallel" aria-hidden="true"></span>초안 만들기와 동시에 진행 (점선 구간 안)</span>
            <span v-if="gantt.rows.some((r) => r.over > 0)" class="lt-legend-item"><span class="lt-dot over" aria-hidden="true"></span>동시에 해도 남는 기간 — 이만큼만 합계에 더해요</span>
          </p>
        </div>
        <!-- 합산에서 뺀 요건 협의 구간 — BRM 내부에서만 참고로 -->
        <p v-if="internal && judgement.leadtime.prep" class="text-xs text-muted" style="margin-top:8px">BRM 참고 — 위 기간에 포함하지 않은 "{{ judgement.leadtime.prep.label }}" 약 {{ judgement.leadtime.prep.min === judgement.leadtime.prep.max ? judgement.leadtime.prep.min : judgement.leadtime.prep.min + '~' + judgement.leadtime.prep.max }}주는 별도예요.</p>
        <p v-if="!judgement.leadtime.tbd" class="jcard-desc">{{ lt.note }}</p>
      </template>
      <p v-else class="jcard-desc">{{ lt.note }}</p>
    </section>

    <!-- 기존 시스템 안에서 동작해야 한다고 명확히 답한 경우 — 예상 기간과 같은 골격의 카드로 협의 필수를 따로 알린다 -->
    <section v-if="judgement.embed" class="jcard jcard-embed" aria-label="기존 시스템 결합">
      <header class="jcard-head">
        <span class="jcard-emoji" aria-hidden="true"><Icon3d name="loan-agreement" :size="26" /></span>
        <span class="jcard-title">{{ EMBED_NOTICE.title }}</span>
        <span class="badge" data-tone="warning" style="font-size:10.5px;padding:1px 7px">{{ EMBED_NOTICE.badge }}</span>
      </header>
      <p class="jcard-plain">{{ EMBED_NOTICE.plain }}</p>
      <p class="jcard-desc">{{ EMBED_NOTICE.desc }}</p>
    </section>

    <!-- 알림: 사이드 모드는 2개까지만 보이고 나머지는 접어둔다 (경고가 화면을 덮지 않게) -->
    <div v-if="judgement.flags.length" class="stack-sm">
      <p v-for="(f, i) in shownFlags" :key="i" class="notice" :data-level="f.level"><span class="notice-emoji" aria-hidden="true"><Icon3d :name="flagEmoji[f.level]" :size="20" /></span><span>{{ f.text }}</span></p>
      <button v-if="hiddenFlagCount > 0" class="btn btn-ghost btn-sm" style="align-self:flex-start" :aria-expanded="showAllFlags" @click="showAllFlags = !showAllFlags">{{ showAllFlags ? '접기' : `확인할 점 ${hiddenFlagCount}개 더 보기` }}</button>
    </div>

    <!-- AI 거버넌스·보안성 심의 필수 안내 (항상 표시) -->
    <div class="notice" data-level="warn"><span class="notice-emoji" aria-hidden="true"><Icon3d name="verified-shield" :size="20" /></span><span><b>꼭 확인하세요</b><ul class="gov-list"><li v-for="(n, i) in GOVERNANCE_NOTICES" :key="i">{{ n }}</li></ul></span></div>

    <!-- 협의처 · 준비물 -->
    <div v-if="full" class="jp-cards">
      <section class="jcard" aria-label="함께 협의할 부서">
        <header class="jcard-head"><span class="jcard-emoji" aria-hidden="true"><Icon3d name="loan-agreement" :size="26" /></span><span class="jcard-title">함께 협의할 부서</span></header>
        <ul class="jlist">
          <li v-for="s in judgement.stakeholders" :key="s.key" class="jlist-item">
            <span class="jlist-name">{{ s.name }}</span>
            <span class="jlist-meta">{{ s.when }}</span>
            <span class="jlist-sub">{{ s.topics }}</span>
          </li>
        </ul>
      </section>
      <section class="jcard" data-tone="soft" aria-label="미리 준비하시면 빨라지는 것">
        <header class="jcard-head"><span class="jcard-emoji" aria-hidden="true"><Icon3d name="hr-checklist" :size="26" /></span><span class="jcard-title">미리 준비하시면 빨라지는 것</span></header>
        <ul class="jlist">
          <li v-for="(p, i) in judgement.prep" :key="i" class="jlist-item jlist-check"><span class="jdash" aria-hidden="true">–</span><span class="jlist-name" style="font-weight:500">{{ p }}</span></li>
        </ul>
        <p class="jcard-desc">지금 없어도 신청할 수 있어요. 검토 때 함께 챙겨요.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.jp { display: flex; flex-direction: column; gap: var(--space-md); }
.jp { container-type: inline-size; }
.jp-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: var(--space-md); }
/* 판정 카드(지원 방식 · 데이터 · 연결) — 풀 모드는 **한 줄에 한 장씩(3행 1열)** 쌓고, 카드 안을 가로로 읽게 한다 (2026-09-04):
     ┌ 아이콘 · 제목 ······································ 내부 용어 태그 ┐   ← 헤더는 카드 전체 폭 — 태그가 항상 오른쪽 끝에 붙는다
     │ 결론(굵게)                        │ 설명                          │
     │ 💬 비유                           │                               │   ← 세로 구분선 하나로 좌(결론) / 우(설명)
   세 장이 같은 골격이라 위아래로 비교하며 읽기 쉽고, 2열일 때 생기던 2+1 빈칸·태그가 카드 중간에 뜨는 문제가 없다.
   패널 폭 560px 이하(사이드 컬럼·모바일)에서는 좌우 칸을 접어 한 덩어리로 — 컨테이너 쿼리로 패널 자신의 폭을 본다 */
.jp.full .jp-judge { grid-template-columns: 1fr; }
.jp.full .jp-judge > .jcard {
  display: grid;
  /* 왼쪽(결론) 열은 세 카드 모두 같은 폭(64%) — 내용 폭(max-content)대로 두면 카드마다 구분선 위치가 달라져 정렬이 어긋나 보인다.
     64% 는 패널이 가장 넓을 때(1920 · 카드 안폭 677px) 제일 긴 제목(자동화 프로그램… 424px)이 줄바꿈 없이 들어가는 최소 비율.
     오른쪽(설명)은 부가라 좁아져도 된다 (2026-09-04) */
  grid-template-columns: 64% minmax(0, 1fr);
  grid-template-areas: "head head" "plain desc" "analogy desc";
  grid-template-rows: auto auto 1fr;
  column-gap: 28px;
  padding: 18px 24px 20px;
}
.jp.full .jp-judge > .jcard > .jcard-head { grid-area: head; margin-bottom: 12px; }
.jp.full .jp-judge > .jcard > .jcard-plain { grid-area: plain; font-size: 17px; }
.jp.full .jp-judge > .jcard > .jcard-plain { white-space: nowrap; }
/* 비유 줄은 열 폭 계산에 끼지 않게(width:0 + min-width:100%) — 제목 폭에 맞춰 줄바꿈된다 */
.jp.full .jp-judge > .jcard > .jcard-analogy { grid-area: analogy; align-self: start; width: 0; min-width: 100%; }
.jp.full .jp-judge > .jcard > .jcard-desc { grid-area: desc; margin-top: 0; padding: 2px 0 0 28px; border-left: 1px solid var(--brand-100); }
@container (max-width: 560px) {
  .jp.full .jp-judge > .jcard { display: block; padding: 18px 20px; }
  .jp.full .jp-judge > .jcard > .jcard-plain { font-size: 16px; white-space: normal; }
  .jp.full .jp-judge > .jcard > .jcard-analogy { width: auto; min-width: 0; }
  .jp.full .jp-judge > .jcard > .jcard-desc { margin-top: 10px; padding: 0; border-left: 0; }
}
.jp:not(.full) .jp-cards { grid-template-columns: 1fr; gap: var(--space-sm); }

.jcard { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 18px 20px; min-width: 0; }
.jcard[data-tone="mint"] { background: var(--mint); border-color: transparent; }
.jcard[data-tone="blush"] { background: var(--blush); border-color: transparent; }
.jcard[data-tone="soft"] { background: var(--surface-2); border-color: transparent; }
.jp:not(.full) .jcard { padding: 14px 16px; }

/* 헤더 한 줄: 이모지 · 제목 · (우측) 내부 용어 태그/개수 — 모든 카드가 같은 골격 */
/* 태그가 길면(사이드 모드 · BRM 내부 용어) 제목을 글자 단위로 쪼개지 말고 태그를 다음 줄로 내린다 (2026-09-08) */
.jcard-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-bottom: 8px; min-height: 22px; }
.jcard-emoji { font-size: 18px; line-height: 1; flex: 0 0 auto; }
.jcard-title { font-size: 12.5px; font-weight: 700; color: var(--text-muted); flex: 1 0 auto; white-space: nowrap; }
.jcard-internal { font-family: var(--font-mono); font-size: 11px; line-height: 1.4; color: var(--brand-700); background: var(--surface); border: 1px solid var(--brand-100); border-radius: var(--radius-full); padding: 2px 9px; white-space: nowrap; margin-left: auto; }
.jcard[data-tone="mint"] .jcard-internal { background: rgba(255,255,255,.75); }

.jcard-plain { font-size: 16px; font-weight: 700; line-height: 1.45; color: var(--text); }
.jp:not(.full) .jcard-plain { font-size: 14px; }
.jcard-analogy { display: flex; gap: 6px; margin-top: 6px; font-size: 12.5px; line-height: 1.45; color: var(--text-muted); }
.jcard-analogy > span[aria-hidden] { opacity: .7; flex: 0 0 auto; }
.jcard-desc { margin-top: 10px; font-size: 13.5px; line-height: 1.55; color: var(--text-sub); }

/* 기존 시스템 결합 — 경고 톤 테두리로 예상 기간 카드와 구분 */
.jcard-embed { border-color: var(--warning); border-width: 1.5px; }
/* 예상 기간 */
/* 예상 기간 카드 — 점선 테두리 + 옅은 노란 바탕으로 "초안·예상" 임을 카드 자체가 말한다 (다른 판정 카드와 구분) */
.jcard-lead { border: 1.5px dashed var(--warning-fill); background: color-mix(in srgb, var(--warning-bg) 35%, var(--surface)); }
.jcard-lead-sub { font-size: 12.5px; line-height: 1.5; color: var(--text-sub); margin: -2px 0 8px; }
.lead-tag { display: inline-block; vertical-align: middle; margin: -4px 8px 0 0; padding: 2px 8px; border-radius: var(--radius-full); background: var(--warning-bg); color: var(--warning); font-size: 12px; font-weight: 700; letter-spacing: .02em; }
.jcard-lead-caveat { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12.5px; font-weight: 600; color: var(--warning); }
.jcard-lead-caveat > span { font-size: 15px; line-height: 1; }
.jp:not(.full) .jcard-lead-sub { font-size: 12px; }
.jcard-lead-value { font-size: 24px; font-weight: 700; line-height: 1.2; }
.jp:not(.full) .jcard-lead-value { font-size: 18px; }
/* 타임라인: 라벨 | 시간축 막대 | 기간. 병행 행은 개발 구간(band)을 옅게 깔아 "이 안에서 같이 진행" 이 보이게 */
.gt { margin-top: 12px; border-top: 1px solid var(--line); }
.gt-row { display: grid; grid-template-columns: minmax(150px, 38%) minmax(0, 1fr) 52px; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.gt-row.parallel { background: linear-gradient(90deg, transparent, transparent); }
.gt-label { color: var(--text); line-height: 1.35; overflow-wrap: anywhere; }
.gt-tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: var(--radius-full); background: var(--mint); color: var(--brand-700); font-size: 10.5px; font-weight: 600; line-height: 16px; vertical-align: 1px; white-space: nowrap; }
.gt-track { position: relative; display: block; height: 16px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.gt-band { position: absolute; top: 0; bottom: 0; background: var(--brand-50); border-left: 1.5px dashed var(--brand-300); border-right: 1.5px dashed var(--brand-300); }
/* 주 눈금 — 막대 열과 같은 격자 위치에 놓여 막대 길이를 주 단위로 읽게 한다 */
.gt-ticks { display: grid; grid-template-columns: minmax(150px, 38%) minmax(0, 1fr) 52px; gap: 10px; padding: 4px 0 0; }
.gt-ticks-track { position: relative; display: block; height: 18px; }
.gt-ticks-track i { position: absolute; top: 0; transform: translateX(-50%); font-style: normal; font-size: 10.5px; color: var(--text-muted); line-height: 1; padding-top: 6px; }
.gt-ticks-track i::before { content: ''; position: absolute; top: 0; left: 50%; width: 1px; height: 4px; background: var(--line-strong); }
.gt-ticks-track i:first-child { transform: none; }
.gt-ticks-track i:first-child::before { left: 0; }
.gt-ticks-track i b { font-weight: 600; font-variant-numeric: tabular-nums; }
.gt-bar { position: absolute; top: 3px; bottom: 3px; border-radius: 3px; background: var(--brand-500); transform-origin: 0 50%; animation: tick-in .45s var(--ease-out) both; }
.gt-bar.parallel { background: var(--mint-deep); }
.gt-bar.over { background: repeating-linear-gradient(135deg, var(--brand-700) 0 3px, transparent 3px 6px); }
.gt-weeks { color: var(--text-sub); white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
@keyframes tick-in { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
.lt-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand-500); flex: none; }
.lt-dot.parallel { background: var(--mint-deep); }
.lt-dot.over { background: repeating-linear-gradient(135deg, var(--brand-700) 0 2px, transparent 2px 4px); border-radius: 2px; }
.lt-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-top: 8px; font-size: 12px; color: var(--text-muted); }
.lt-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.lt-legend .lt-dot { width: 8px; height: 8px; }

/* 협의처 · 준비물 목록 — 같은 행 골격, 구분선으로 정렬 */
.jlist { display: flex; flex-direction: column; }
.jlist-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
.jlist-item:first-child { border-top: 0; padding-top: 0; }
.jlist-name { font-weight: 600; color: var(--text); }
.jlist-meta { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.jlist-sub { grid-column: 1 / -1; color: var(--text-sub); font-size: 12.5px; line-height: 1.5; }
.jlist-check { grid-template-columns: 12px minmax(0, 1fr); align-items: start; }
/* 체크박스처럼 보이면 "눌러야 하나?" 하는 기대를 주므로 안내 목록은 대시 불릿으로 (2026-09-03) */
.jdash { color: var(--text-muted); line-height: 1.5; }
.gov-list { margin-top: 6px; display: flex; flex-direction: column; gap: 5px; }
.gov-list li { position: relative; padding-left: 13px; line-height: 1.5; }
.gov-list li::before { content: '–'; position: absolute; left: 0; }
</style>
