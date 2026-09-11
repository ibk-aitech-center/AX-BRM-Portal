<script setup lang="ts">
/**
 * 가로 분포 — "눈금 줄". 눈금(tick) 하나가 1건이라 길이를 세어 읽을 수 있다 (lieflat "Tick Rows").
 * 최대값이 unitMax 를 넘으면 헤어라인 트랙 위의 비례 막대로 폴백. 단일 시리즈라 범례 없음("눈금 1개 = 1건" 문구도 두지 않는다), 값은 텍스트 토큰 색.
 * 라벨은 자르지 않고 줄바꿈한다 — "실제 값 필요 (비식별 반출)" 처럼 긴 분류명이 2열 패널에서 잘려 보였다 (2026-09-08).
 */
import { computed } from 'vue';
import type { StatBucket } from '@/types';
const props = withDefaults(defineProps<{ items: StatBucket[]; max?: number; unitMax?: number; empty?: string }>(), { unitMax: 24 });
const top = computed(() => props.max ?? Math.max(1, ...props.items.map((i) => i.n)));
const unit = computed(() => top.value <= props.unitMax);
</script>

<template>
  <div v-if="!items.length" class="text-muted text-sm">{{ empty || '아직 데이터가 없어요' }}</div>
  <ul v-else class="tr" :class="{ 'tr-unit': unit }" role="list">
    <li v-for="(it, i) in items" :key="it.key" class="tr-row" :style="{ '--i': i }" :title="`${it.label || it.key}: ${it.n}건`">
      <span class="tr-label">{{ it.label || it.key }}</span>
      <span class="tr-track">
        <template v-if="unit"><i v-for="k in it.n" :key="k" class="tr-tick" :style="{ '--k': k }"></i></template>
        <span v-else class="tr-fill" :style="{ width: (it.n / top * 100) + '%' }"></span>
      </span>
      <span class="tr-value num">{{ it.n }}<span class="tr-suffix">건</span></span>
    </li>
  </ul>
</template>

<style scoped>
.tr { display: flex; flex-direction: column; }
/* 라벨 열은 내용만큼(최대 절반) 차지하고 넘치면 줄바꿈 — 막대·눈금은 남은 폭을 쓴다 */
.tr-row { display: grid; grid-template-columns: minmax(110px, 50%) 1fr 44px; gap: 10px; align-items: center; font-size: 13.5px; min-height: 30px; padding: 3px 0; }
.tr-row + .tr-row { border-top: 1px dashed var(--line); }
/* 눈금 모드: 값이 오른쪽 끝에 떠 있지 않고 마지막 눈금 바로 뒤에 붙는다 → 눈금·숫자·항목이 한 덩어리로 읽힌다 */
.tr-unit .tr-row { grid-template-columns: minmax(110px, 50%) minmax(0, max-content) minmax(44px, 1fr); }
.tr-unit .tr-value { text-align: left; }
.tr-label { color: var(--text); line-height: 1.35; overflow-wrap: anywhere; }
.tr-track { position: relative; display: flex; gap: 2px; height: 12px; min-width: 0; overflow: hidden; }
.tr:not(.tr-unit) .tr-track { border-bottom: 1px solid var(--line); }
.tr-tick { flex: 0 0 4px; height: 100%; border-radius: 1.5px; background: var(--brand-500); transform-origin: 0 50%; animation: tick-in .28s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms + var(--k) * 12ms); }
.tr-fill { position: absolute; left: 0; bottom: 1px; height: 8px; background: var(--brand-500); border-radius: 0 4px 4px 0; min-width: 2px; transform-origin: 0 50%; animation: tick-in .5s var(--ease-out) both; animation-delay: calc(var(--i) * 40ms); transition: width var(--transition); }
.tr-row:hover .tr-tick, .tr-row:hover .tr-fill { background: var(--brand-600); }
@keyframes tick-in { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
.tr-value { text-align: right; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tr-suffix { font-size: 11.5px; font-weight: 500; color: var(--text-muted); margin-left: 1px; }
</style>
