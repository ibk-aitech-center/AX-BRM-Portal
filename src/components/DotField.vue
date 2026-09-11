<script setup lang="ts">
/**
 * 상태별 — "점 하나 = 요청 1건" 도트 와플 (lieflat "Dot Waffle").
 * 파이프라인 순서(접수→검토→접수 확정→개발→완료)는 브랜드색 명도 단계로, 옆길(보류·안내·반려)은 회색 단계로 구분해
 * 색만이 아니라 순서·범례 라벨로도 읽히게 한다. 점이 maxDots 를 넘으면 TickRows 로 폴백.
 */
import { computed } from 'vue';
import type { StatBucket } from '@/types';
import TickRows from './TickRows.vue';
const props = withDefaults(defineProps<{ items: StatBucket[]; maxDots?: number }>(), { maxDots: 300 });
const ORDER = ['submitted', 'reviewing', 'accepted', 'developing', 'done', 'hold', 'guided', 'rejected'];
const COLOR: Record<string, string> = { submitted: '#D2E7E5', reviewing: '#A9CFCC', accepted: '#7FB7B4', developing: '#4A8E90', done: '#17545A', hold: '#C9D6D6', guided: '#9AAAAD', rejected: '#6B7F84' };
const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i; };
const sorted = computed(() => props.items.filter((i) => i.n > 0).slice().sort((a, b) => rank(a.key) - rank(b.key)));
const total = computed(() => sorted.value.reduce((s, i) => s + i.n, 0));
const dots = computed(() => sorted.value.flatMap((it) => Array.from({ length: it.n }, () => ({ key: it.key, label: it.label || it.key, color: COLOR[it.key] || 'var(--ink-500)' }))));
</script>

<template>
  <div v-if="!items.length || !total" class="text-muted text-sm">아직 데이터가 없어요</div>
  <TickRows v-else-if="total > maxDots" :items="items" />
  <div v-else class="df">
    <div class="df-grid" role="img" :aria-label="'상태별: ' + sorted.map((i) => `${i.label || i.key} ${i.n}건`).join(', ')">
      <i v-for="(d, i) in dots" :key="i" class="df-dot" :style="{ background: d.color, '--i': Math.min(i, 160) }" :title="d.label"></i>
    </div>
    <ul class="df-legend" role="list">
      <li v-for="it in sorted" :key="it.key" class="df-item"><i class="df-swatch" :style="{ background: COLOR[it.key] || 'var(--ink-500)' }"></i><span class="text-sub">{{ it.label || it.key }}</span><b class="num">{{ it.n }}</b></li>
      <li class="df-item text-xs text-muted">● = 1건 · 모두 {{ total }}건</li>
    </ul>
  </div>
</template>

<style scoped>
.df { display: flex; flex-direction: column; gap: 14px; }
.df-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.df-dot { display: block; width: 11px; height: 11px; border-radius: 50%; animation: dot-in .32s var(--ease-spring) both; animation-delay: calc(var(--i) * 7ms); }
@keyframes dot-in { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.df-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; }
.df-item { display: inline-flex; align-items: center; gap: 6px; }
.df-item b { font-weight: 700; color: var(--text); }
.df-swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; }
</style>
