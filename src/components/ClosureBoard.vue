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
// 합계 행·열의 비례 막대 기준 — 행끼리, 열끼리 각각 최댓값
const rowMax = computed(() => Math.max(1, ...s.value.matrix.map(rowSum)));
const colMax = computed(() => Math.max(1, ...s.value.byForm.map((_, c) => colSum(c))));
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
      <!-- 교차표: 헤어라인 격자 + 칸 색은 건수 비례(브랜드 1색 진하기), 0건은 옅은 점. 칸마다 건수와 전체 대비 비율, 합계 행·열은 비례 막대로 서로 비교되게. 최다 조합은 테두리로 짚는다 -->
      <div class="cb-matrix-wrap">
        <table class="cb-matrix">
          <thead>
            <tr>
              <th class="cb-corner"><span>배포 위치 ↓</span><span>완성 형태 →</span></th>
              <th v-for="f in s.byForm" :key="f.key" scope="col">{{ f.label }}</th>
              <th scope="col" class="cb-total-h">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, d) in s.matrix" :key="s.byDeploy[d].key">
              <th scope="row">{{ s.byDeploy[d].label }}</th>
              <td v-for="(n, f) in row" :key="f" class="cb-cell" :data-level="level(n)" :class="{ 'cb-top': topCell && topCell.n && topCell.d === d && topCell.f === f }" :title="`${s.byDeploy[d].label} · ${s.byForm[f].label}: ${n}건`">
                <template v-if="n"><b class="num">{{ n }}</b><small class="num">{{ pct(n, s.classified) }}%</small></template>
                <i v-else aria-hidden="true">·</i>
              </td>
              <td class="cb-sum">
                <span class="cb-sum-bar" aria-hidden="true"><i :style="{ width: `${pct(rowSum(row), rowMax)}%` }"></i></span>
                <b class="num">{{ rowSum(row) }}</b>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">합계</th>
              <td v-for="(f, c) in s.byForm" :key="f.key" class="cb-sum cb-sum-col">
                <b class="num">{{ colSum(c) }}</b>
                <span class="cb-sum-bar" aria-hidden="true"><i :style="{ width: `${pct(colSum(c), colMax)}%` }"></i></span>
              </td>
              <td class="cb-sum cb-grand"><b class="num">{{ s.classified }}</b><small class="num">100%</small></td>
            </tr>
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
/* 두 열을 같은 높이로 — 오른쪽 매트릭스 카드가 왼쪽 세 카드 합만큼 늘어나고, 남는 높이는 표의 행들이 나눠 가져 아래 빈 여백이 생기지 않는다 (2026-09-11) */
.cb { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 14px; align-items: stretch; }
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

/* 교차표 — 헤어라인 격자(1px --line) 위에 칸 색은 브랜드 1색 진하기 3단계. 흰 상자 대신 격자라 빈 칸이 "비어 있음"으로 읽힌다.
 * 합계 행·열은 숫자 + 비례 막대(행끼리·열끼리 최댓값 기준). 최다 조합은 브랜드 테두리로 짚고 아래 한 줄 요약과 짝을 이룬다. */
.cb-matrix-block { display: flex; flex-direction: column; }
.cb-matrix-wrap { overflow-x: auto; flex: 1 1 auto; display: flex; flex-direction: column; margin-top: 2px; }
.cb-matrix { width: 100%; flex: 1 1 auto; border-collapse: collapse; font-size: 13.5px; table-layout: fixed; }
.cb-matrix th, .cb-matrix td { border: 1px solid var(--line); vertical-align: middle; }
.cb-matrix thead th { padding: 8px 10px 10px; font-size: 12.5px; font-weight: 600; color: var(--text-sub); text-align: center; white-space: nowrap; border-top: 0; background: transparent; }
.cb-matrix thead th.cb-corner { text-align: left; font-family: var(--font-mono); font-size: 10.5px; font-weight: 500; color: var(--text-muted); letter-spacing: .02em; line-height: 1.5; padding-bottom: 6px; }
.cb-matrix thead th.cb-corner span { display: block; }
.cb-matrix thead th:first-child, .cb-matrix tbody th, .cb-matrix tfoot th { border-left: 0; }
.cb-matrix thead th:last-child, .cb-matrix td:last-child { border-right: 0; }
.cb-matrix tbody th { width: 30%; padding: 8px 10px; text-align: left; font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cb-matrix tbody tr { transition: background var(--transition); }
.cb-matrix tbody tr:hover { background: rgba(23,84,90,.035); }

/* 값 칸: 건수(굵게) + 전체 대비 비율(작게). 0건은 옅은 점 하나 */
.cb-cell { padding: 8px 6px; text-align: center; color: var(--text); animation: cb-in .4s var(--ease-out) both; position: relative; }
.cb-cell b { display: block; font-size: 16px; font-weight: 700; line-height: 1.15; }
.cb-cell small { display: block; margin-top: 2px; font-size: 11px; color: var(--text-sub); }
.cb-cell i { font-style: normal; color: var(--ink-300); font-size: 16px; line-height: 1; }
.cb-cell[data-level="1"] { background: var(--brand-50); }
.cb-cell[data-level="2"] { background: var(--brand-100); }
.cb-cell[data-level="3"] { background: var(--brand-300); }
.cb-cell[data-level="3"] small { color: var(--text); opacity: .75; }
.cb-cell.cb-top { box-shadow: inset 0 0 0 2px var(--brand-500); }

/* 합계 — 숫자와 비례 막대. 행 합계는 막대가 왼쪽에서 자라고, 열 합계는 숫자 아래에서 자란다 */
.cb-total-h { color: var(--text-muted) !important; }
.cb-sum { padding: 8px 10px; color: var(--text-sub); background: var(--surface-2); }
.cb-sum b { font-size: 13.5px; font-weight: 700; color: var(--text); }
.cb-sum-bar { display: block; height: 5px; border-radius: 3px; background: var(--line); overflow: hidden; }
.cb-sum-bar i { display: block; height: 100%; background: var(--ink-300); border-radius: 3px; transform-origin: 0 50%; animation: cb-grow .6s var(--ease-out) both; }
tbody .cb-sum { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; text-align: right; }
.cb-matrix tfoot th { padding: 8px 10px; text-align: left; font-size: 12.5px; font-weight: 600; color: var(--text-muted); border-bottom: 0; }
.cb-matrix tfoot .cb-sum { border-bottom: 0; text-align: center; }
.cb-sum-col b { display: block; margin-bottom: 4px; }
.cb-grand { background: var(--brand-50); }
.cb-grand b { font-size: 15px; display: block; }
.cb-grand small { font-size: 10.5px; color: var(--text-sub); }
.cb-note { margin-top: auto; padding-top: 10px; line-height: 1.5; }
.cb-note b { color: var(--text); }
@keyframes cb-in { from { opacity: 0; } to { opacity: 1; } }
</style>
