<script setup lang="ts">
/**
 * 완료 건 종결 분류 — 완료(done)된 건이 "어떻게 끝났나".
 *  · 목업 제공 여부: 두 조각 띠 (제공 = 브랜드, 미제공 = 회색) + 건수·비율
 *  · 배포 위치 · 완성 형태: 헤어라인 트랙 위 비례 막대 (눈금 모드는 건수가 적을 때 낱개 띠로 보여 어색해 끔) — 분류는 고정 순서, 0건도 자리 유지
 *  · 교차표: 배포 위치 × 완성 형태 — 칸 배경은 브랜드 1색의 진하기 3단계, 숫자는 텍스트 토큰
 * 옛 데이터(분류 없이 완료된 건)는 "미분류"로 따로 세어 보여준다.
 */
import { computed } from 'vue';
import type { ClosureStats } from '@/types';
import TickRows from '@/components/TickRows.vue';

const props = defineProps<{ stats: ClosureStats }>();
const s = computed(() => props.stats);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const unclassified = computed(() => s.value.done - s.value.classified);
// 두 분포가 같은 눈금 기준을 쓰도록 최댓값 공유
const max = computed(() => Math.max(1, ...s.value.byDeploy.map((b) => b.n), ...s.value.byForm.map((b) => b.n)));
const cellMax = computed(() => Math.max(1, ...s.value.matrix.flat()));
const level = (n: number) => (n <= 0 ? 0 : n >= cellMax.value * 0.67 ? 3 : n >= cellMax.value * 0.34 ? 2 : 1);
const rowSum = (r: number[]) => r.reduce((a, b) => a + b, 0);
const colSum = (c: number) => s.value.matrix.reduce((a, r) => a + (r[c] ?? 0), 0);
// 가장 많은 조합 — 한 줄 요약용
const topCell = computed<{ d: number; f: number; n: number } | null>(() => {
  let best: { d: number; f: number; n: number } | null = null;
  s.value.matrix.forEach((r, d) => r.forEach((n, f) => { if (n > (best ? best.n : 0)) best = { d, f, n }; }));
  return best;
});
</script>

<template>
  <div v-if="!s.done" class="text-muted text-sm">이 기간에 완료된 건이 아직 없어요</div>
  <div v-else class="cb">
    <div class="cb-left">
      <section class="cb-block" aria-labelledby="cb-mock">
        <h3 id="cb-mock" class="cb-title">컨셉 목업 제공 여부 <span class="text-xs text-muted">완료 {{ s.done }}건 기준</span></h3>
        <div class="cb-split" role="img" :aria-label="`목업 제공 ${s.withMockup}건, 미제공 ${s.withoutMockup}건`">
          <i class="cb-split-a" :style="{ flex: `${s.withMockup} 0 0` }"></i>
          <i class="cb-split-b" :style="{ flex: `${s.withoutMockup} 0 0` }"></i>
        </div>
        <div class="cb-split-legend">
          <span><i class="cb-dot" style="background:var(--brand-500)"></i>제공 <b class="num">{{ s.withMockup }}</b><small class="text-muted num">건 · {{ pct(s.withMockup, s.done) }}%</small></span>
          <span><i class="cb-dot" style="background:var(--ink-300)"></i>미제공 <b class="num">{{ s.withoutMockup }}</b><small class="text-muted num">건 · {{ pct(s.withoutMockup, s.done) }}%</small></span>
        </div>
      </section>
      <section class="cb-block" aria-labelledby="cb-deploy">
        <h3 id="cb-deploy" class="cb-title">배포 위치</h3>
        <TickRows :items="s.byDeploy" :max="max" :unit-max="0" />
      </section>
      <section class="cb-block" aria-labelledby="cb-form">
        <h3 id="cb-form" class="cb-title">완성 형태</h3>
        <TickRows :items="s.byForm" :max="max" :unit-max="0" />
      </section>
    </div>

    <section class="cb-block cb-matrix-block" aria-labelledby="cb-matrix">
      <h3 id="cb-matrix" class="cb-title">배포 위치 × 완성 형태 <span class="text-xs text-muted">분류된 {{ s.classified }}건</span></h3>
      <div class="cb-matrix-wrap">
        <table class="cb-matrix">
          <thead>
            <tr><th class="cb-corner"><span class="text-muted">배포 ↓ · 형태 →</span></th><th v-for="f in s.byForm" :key="f.key" scope="col">{{ f.label }}</th><th scope="col" class="cb-total">합계</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, d) in s.matrix" :key="s.byDeploy[d].key">
              <th scope="row">{{ s.byDeploy[d].label }}</th>
              <td v-for="(n, f) in row" :key="f" class="num" :data-level="level(n)" :title="`${s.byDeploy[d].label} · ${s.byForm[f].label}: ${n}건`">{{ n || '' }}</td>
              <td class="num cb-total">{{ rowSum(row) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><th scope="row" class="cb-total">합계</th><td v-for="(f, c) in s.byForm" :key="f.key" class="num cb-total">{{ colSum(c) }}</td><td class="num cb-total">{{ s.classified }}</td></tr>
          </tfoot>
        </table>
      </div>
      <p class="cb-note text-xs text-muted">
        <template v-if="topCell && topCell.n">가장 많은 조합은 <b>{{ s.byDeploy[topCell.d].label }} · {{ s.byForm[topCell.f].label }}</b> ({{ topCell.n }}건)이에요.</template>
        <template v-else>아직 분류된 완료 건이 없어요.</template>
        <template v-if="unclassified"> 분류 없이 완료된 건 {{ unclassified }}건은 검토 화면 "종결 분류"에서 채울 수 있어요.</template>
      </p>
    </section>
  </div>
</template>

<style scoped>
.cb { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 14px; align-items: start; }
@media (max-width: 1100px) { .cb { grid-template-columns: 1fr; } }
.cb-left { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cb-block { padding: 14px 16px 12px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); min-width: 0; }
.cb-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }

/* 목업 제공 여부 — 두 조각 띠 */
.cb-split { display: flex; height: 14px; border-radius: 4px; overflow: hidden; gap: 2px; margin-top: 6px; transform-origin: 0 50%; animation: cb-grow .6s var(--ease-out) both; }
.cb-split i { display: block; height: 100%; min-width: 0; }
.cb-split-a { background: var(--brand-500); }
.cb-split-b { background: var(--ink-300); }
.cb-split-legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 10px; font-size: 13.5px; color: var(--text); }
.cb-split-legend span { display: inline-flex; align-items: baseline; gap: 5px; }
.cb-split-legend b { font-weight: 700; }
.cb-split-legend small { font-size: 11.5px; }
.cb-dot { width: 10px; height: 10px; border-radius: 3px; align-self: center; }
@keyframes cb-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* 교차표 — 칸 배경 3단계, 숫자는 텍스트 토큰 */
.cb-matrix-block { display: flex; flex-direction: column; }
.cb-matrix-wrap { overflow-x: auto; }
.cb-matrix { width: 100%; border-collapse: separate; border-spacing: 3px; font-size: 13.5px; }
.cb-matrix th { font-weight: 600; color: var(--text-sub); font-size: 12.5px; text-align: left; padding: 6px 8px; white-space: nowrap; }
.cb-matrix thead th { text-align: center; }
.cb-matrix thead th.cb-corner { text-align: left; font-size: 11px; font-weight: 500; }
.cb-matrix tbody th { min-width: 110px; }
.cb-matrix td { text-align: center; padding: 10px 8px; border-radius: 6px; background: var(--surface); color: var(--text); font-weight: 600; min-width: 56px; animation: cb-in .4s var(--ease-out) both; }
.cb-matrix td[data-level="0"] { color: var(--text-muted); font-weight: 400; }
.cb-matrix td[data-level="1"] { background: var(--brand-50); }
.cb-matrix td[data-level="2"] { background: var(--brand-100); }
.cb-matrix td[data-level="3"] { background: var(--brand-300); font-weight: 700; }
.cb-matrix .cb-total { background: transparent; color: var(--text-sub); font-weight: 600; font-size: 12.5px; }
.cb-matrix tfoot th { border-top: 1px solid var(--line); }
.cb-note { margin-top: 10px; line-height: 1.5; }
.cb-note b { color: var(--text); }
@keyframes cb-in { from { opacity: 0; } to { opacity: 1; } }
</style>
