<script setup lang="ts">
/**
 * AX-BRM 담당자별 처리 현황 — "누가 몇 건을 맡아 어디까지 왔나"를 한 표로.
 *  · 상단 요약: 담당자 수 · 담당자당 평균 건수 · 미지정 건수(지정이 밀린 일) · 완료까지 평균 소요
 *  · 행: 이름·직위 · 진행 상황 누적 막대(부서별과 같은 4분류·같은 색) · 건수 · 완료 · 목업 제공 · 완료까지 평균
 *  · 미지정 묶음(key 'none')은 맨 아래 옅은 행 — 사람 순위에 섞이지 않게
 *  색은 브랜드 1색의 진하기 + 회색, 글자는 텍스트 토큰 (OrgBoard 와 동일 규칙).
 */
import { computed } from 'vue';
import type { AssigneeBucket } from '@/types';

const props = withDefaults(defineProps<{ items: AssigneeBucket[]; total?: number }>(), { total: 0 });

const people = computed(() => props.items.filter((a) => a.key !== 'none').sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko')));
const none = computed(() => props.items.find((a) => a.key === 'none') ?? null);
const max = computed(() => Math.max(1, ...props.items.map((a) => a.n)));
const sum = computed(() => props.total || props.items.reduce((s, a) => s + a.n, 0));
const pct = (n: number, d = sum.value) => (d ? Math.round((n / d) * 100) : 0);
const assignedSum = computed(() => people.value.reduce((s, a) => s + a.n, 0));
const perPerson = computed(() => (people.value.length ? Math.round((assignedSum.value / people.value.length) * 10) / 10 : 0));
// 완료까지 평균 — 담당자별 평균을 완료 건수로 가중
const avgDone = computed(() => {
  const xs = people.value.filter((a) => a.avgDoneDays != null && a.done);
  const w = xs.reduce((s, a) => s + a.done, 0);
  return w ? Math.round((xs.reduce((s, a) => s + (a.avgDoneDays as number) * a.done, 0) / w) * 10) / 10 : null;
});

const SEGS: { k: 'closed' | 'active' | 'awaiting' | 'stalled'; label: string; c: string }[] = [
  { k: 'closed', label: '완료·종결', c: 'var(--brand-500)' },
  { k: 'active', label: '진행 중', c: 'var(--brand-300)' },
  { k: 'awaiting', label: '검토 대기', c: 'var(--brand-100)' },
  { k: 'stalled', label: '반려', c: 'var(--ink-300)' },
];
const segTitle = (a: AssigneeBucket) => SEGS.map((s) => `${s.label} ${a[s.k]}`).join(' · ');
const label = (a: AssigneeBucket) => (a.position ? `${a.name} ${a.position}` : a.name);
</script>

<template>
  <div class="ab">
    <div class="ab-sum">
      <div class="ab-stat"><b class="num">{{ people.length }}</b><span>담당자</span><small class="text-muted">지정된 적 있는 사람</small></div>
      <div class="ab-stat"><b class="num">{{ perPerson }}</b><span>담당자당 평균</span><small class="text-muted">건 · 지정된 {{ assignedSum }}건 기준</small></div>
      <div class="ab-stat" :class="{ 'ab-warn': none && none.n }"><b class="num">{{ none?.n ?? 0 }}</b><span>담당자 미지정</span><small class="text-muted">{{ none && none.n ? `접수의 ${pct(none.n)}%` : '모두 지정됨' }}</small></div>
      <div class="ab-stat"><b class="num">{{ avgDone ?? '–' }}<small v-if="avgDone != null">일</small></b><span>완료까지 평균</span><small class="text-muted">신청 → 완료 · 완료 건 가중</small></div>
    </div>

    <ul class="ab-legend" aria-hidden="true"><li v-for="s in SEGS" :key="s.k"><i :style="{ background: s.c }"></i>{{ s.label }}</li></ul>

    <div v-if="!items.length" class="text-muted text-sm">아직 데이터가 없어요</div>
    <div v-else class="ab-table" role="table" aria-label="담당자별 처리 현황">
      <div class="ab-row ab-head" role="row">
        <span role="columnheader">담당자</span>
        <span role="columnheader">진행 상황</span>
        <span role="columnheader" class="ab-r">건수</span>
        <span role="columnheader" class="ab-r">완료</span>
        <span role="columnheader" class="ab-r" title="컨셉 목업을 첨부한 건">목업</span>
        <span role="columnheader" class="ab-r" title="신청부터 완료까지 평균 일수">완료까지</span>
      </div>
      <div v-for="(a, i) in people" :key="a.key" class="ab-row" role="row" :style="{ '--i': i }">
        <span class="ab-name" role="cell"><b class="truncate" :title="label(a)">{{ a.name }}</b><small v-if="a.position" class="text-muted">{{ a.position }}</small></span>
        <span class="ab-barcell" role="cell">
          <span class="ab-bar" :title="segTitle(a)" :style="{ width: (a.n / max * 100) + '%' }">
            <i v-for="s in SEGS" :key="s.k" :style="{ flex: `${a[s.k]} 0 0`, background: s.c }"></i>
          </span>
        </span>
        <span class="ab-r num" role="cell"><b>{{ a.n }}</b><small class="text-muted"> · {{ pct(a.n) }}%</small></span>
        <span class="ab-r num" role="cell">{{ a.done }}</span>
        <span class="ab-r num" role="cell">{{ a.mockups }}</span>
        <span class="ab-r num" role="cell">{{ a.avgDoneDays != null ? `${a.avgDoneDays}일` : '–' }}</span>
      </div>
      <div v-if="none" class="ab-row ab-none" role="row" :style="{ '--i': people.length }">
        <span class="ab-name" role="cell"><b>미지정</b><small class="text-muted">담당자 없음</small></span>
        <span class="ab-barcell" role="cell">
          <span class="ab-bar" :title="segTitle(none)" :style="{ width: (none.n / max * 100) + '%' }">
            <i v-for="s in SEGS" :key="s.k" :style="{ flex: `${none[s.k]} 0 0`, background: s.c }"></i>
          </span>
        </span>
        <span class="ab-r num" role="cell"><b>{{ none.n }}</b><small class="text-muted"> · {{ pct(none.n) }}%</small></span>
        <span class="ab-r num" role="cell">–</span>
        <span class="ab-r num" role="cell">{{ none.mockups }}</span>
        <span class="ab-r num" role="cell">–</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ab { display: flex; flex-direction: column; gap: 16px; }
.ab-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.ab-stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); min-width: 0; }
.ab-stat b { font-size: 24px; font-weight: 700; line-height: 1.1; }
.ab-stat b small { font-size: 14px; font-weight: 600; margin-left: 1px; }
.ab-stat span { font-size: 12.5px; color: var(--text-sub); font-weight: 600; }
.ab-stat small { font-size: 11.5px; }
.ab-warn span { color: var(--warning); }

.ab-legend { display: flex; gap: 12px; margin-left: auto; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; }
.ab-legend li { display: inline-flex; align-items: center; gap: 5px; }
.ab-legend i { width: 10px; height: 10px; border-radius: 3px; }

.ab-table { display: flex; flex-direction: column; }
.ab-row { display: grid; grid-template-columns: minmax(120px, 200px) 1fr 84px 48px 48px 68px; gap: 12px; align-items: center; padding: 8px 4px; font-size: 13.5px; animation: ab-in .4s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms + 100ms); }
.ab-row + .ab-row { border-top: 1px dashed var(--line); }
.ab-head { font-size: 11.5px; font-weight: 600; color: var(--text-muted); letter-spacing: .02em; padding-bottom: 6px; border-bottom: 1px solid var(--line); animation: none; }
.ab-head + .ab-row { border-top: 0; }
.ab-name { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.ab-name b { font-weight: 600; color: var(--text); }
.ab-name small { font-size: 11.5px; white-space: nowrap; }
.ab-barcell { min-width: 0; }
.ab-bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; gap: 1px; transform-origin: 0 50%; animation: ab-grow .6s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms + 200ms); min-width: 3px; }
.ab-bar i { display: block; height: 100%; }
.ab-r { text-align: right; white-space: nowrap; }
.ab-r b { font-weight: 700; }
.ab-r small { font-size: 11.5px; }
.ab-none { background: var(--surface-2); border-radius: var(--radius-sm); margin-top: 6px; border-top: 0 !important; }
.ab-none .ab-name b { color: var(--text-sub); }
@keyframes ab-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes ab-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (max-width: 700px) {
  .ab-row { grid-template-columns: minmax(100px, 1fr) 1fr 72px; }
  .ab-row > :nth-child(n + 4) { display: none; }
}
</style>
