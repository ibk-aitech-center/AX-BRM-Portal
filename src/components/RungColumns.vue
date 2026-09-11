<script setup lang="ts">
/**
 * 월별 접수 — "셀 수 있는 기둥". 눈금(rung) 하나가 요청 1건이라 막대 높이를 눈으로 세어 확인할 수 있다.
 * (lieflat "Rung Bars"). 최대값이 unitMax 를 넘으면 눈금 대신 단색 막대로 폴백. "눈금 1칸 = 1건" 같은 범례 문구는 두지 않는다 (2026-09-08).
 *  - 최근 달(마지막 기둥)만 brand-500, 나머지는 brand-300 → 강조 1곳
 *  - 기둥 순서대로 아래에서 위로 그려지는 스태거 드로우인
 */
import { computed } from 'vue';
import type { StatBucket } from '@/types';
const props = withDefaults(defineProps<{ items: StatBucket[]; unitMax?: number; title?: string }>(), { unitMax: 24, title: '월별 접수 건수' });
const top = computed(() => Math.max(1, ...props.items.map((i) => i.n)));
const unit = computed(() => top.value <= props.unitMax);
const label = (k: string) => { const [y, m] = k.split('-'); return `${y.slice(2)}.${m}`; };
</script>

<template>
  <div v-if="!items.length" class="text-muted text-sm">아직 데이터가 없어요</div>
  <div v-else class="rc" :style="{ '--n': top }" role="img" :aria-label="title + ': ' + items.map((i) => `${i.key} ${i.n}건`).join(', ')">
    <div v-for="(it, i) in items" :key="it.key" class="rc-col" :class="{ 'rc-last': i === items.length - 1 }" :style="{ '--i': i }" :title="`${it.key}: ${it.n}건`">
      <span class="rc-value num">{{ it.n || '' }}</span>
      <span class="rc-track">
        <template v-if="unit"><i v-for="k in it.n" :key="k" class="rc-rung" :style="{ '--k': k }"></i></template>
        <span v-else class="rc-fill" :style="{ height: (it.n / top * 100) + '%' }"></span>
      </span>
      <span class="rc-label">{{ label(it.key) }}</span>
    </div>
  </div>
</template>

<style scoped>
.rc { position: relative; display: flex; gap: 8px; align-items: stretch; height: 196px; padding: 18px 0 20px; }
.rc-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.rc-track { flex: 1; width: 100%; max-width: 36px; display: flex; flex-direction: column-reverse; gap: 2px; border-bottom: 1px solid var(--line-strong); }
.rc-rung { display: block; width: 100%; height: calc((100% - (var(--n) - 1) * 2px) / var(--n)); border-radius: 1.5px; background: var(--brand-300); transform-origin: 50% 100%; animation: rung-in .32s var(--ease-out) both; animation-delay: calc(var(--i) * 45ms + var(--k) * 14ms); }
.rc-last .rc-rung, .rc-last .rc-fill { background: var(--brand-500); }
.rc-col:hover .rc-rung, .rc-col:hover .rc-fill { background: var(--brand-600); }
.rc-fill { display: block; width: 100%; background: var(--brand-300); border-radius: 3px 3px 0 0; transform-origin: 50% 100%; animation: rung-in .5s var(--ease-out) both; animation-delay: calc(var(--i) * 45ms); }
@keyframes rung-in { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
.rc-value { font-size: 12px; font-weight: 600; color: var(--text); height: 16px; animation: fade-in .3s ease both; animation-delay: calc(var(--i) * 45ms + var(--n) * 14ms + 120ms); }
@keyframes fade-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.rc-label { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; }
</style>
