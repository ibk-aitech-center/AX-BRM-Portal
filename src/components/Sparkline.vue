<script setup lang="ts">
/** 헤어라인 스파크라인 — 1.5px 선 + 옅은 면 + 끝점 강조. 선은 pathLength 기반으로 그려지며(draw-in) 끝점이 마지막에 뜬다. */
import { computed } from 'vue';
import type { StatBucket } from '@/types';
const props = withDefaults(defineProps<{ items: StatBucket[]; width?: number; height?: number }>(), { width: 120, height: 32 });
const pts = computed(() => {
  const n = props.items.length; if (n < 2) return [];
  const top = Math.max(1, ...props.items.map((i) => i.n));
  const pad = 3, w = props.width - pad * 2, h = props.height - pad * 2;
  return props.items.map((it, i) => ({ x: pad + (i / (n - 1)) * w, y: pad + h - (it.n / top) * h }));
});
const line = computed(() => pts.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
const area = computed(() => pts.value.length ? `${line.value} L${pts.value[pts.value.length - 1].x.toFixed(1)} ${props.height} L${pts.value[0].x.toFixed(1)} ${props.height} Z` : '');
const last = computed(() => pts.value[pts.value.length - 1]);
</script>

<template>
  <svg v-if="pts.length" class="spark" :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" aria-hidden="true">
    <path class="spark-area" :d="area" />
    <path class="spark-line" :d="line" pathLength="100" />
    <circle class="spark-dot" :cx="last.x" :cy="last.y" r="2.6" />
  </svg>
</template>

<style scoped>
.spark { display: block; overflow: visible; }
.spark-area { fill: var(--brand-500); opacity: .08; animation: spark-fade .6s ease both .5s; }
.spark-line { fill: none; stroke: var(--brand-500); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 100; stroke-dashoffset: 100; animation: spark-draw .9s var(--ease-out) forwards .15s; }
.spark-dot { fill: var(--brand-500); stroke: var(--surface); stroke-width: 1.5; transform-box: fill-box; transform-origin: center; animation: spark-pop .35s var(--ease-spring) both 1s; }
@keyframes spark-draw { to { stroke-dashoffset: 0; } }
@keyframes spark-fade { from { opacity: 0; } to { opacity: .08; } }
@keyframes spark-pop { from { transform: scale(0); } to { transform: scale(1); } }
</style>
