<script setup lang="ts">
/**
 * 숫자 카운트업 — 값이 바뀌면 이전 값에서 새 값으로 ease-out 으로 굴러간다 (lieflat "Draw-in + Counter").
 * 소수 자리는 목표값의 자릿수를 따르고, 숫자가 아니면('–') 그대로 표시. 모션 축소 환경은 즉시 반영.
 */
import { ref, watch, onBeforeUnmount } from 'vue';
const props = withDefaults(defineProps<{ value: number | string | null | undefined; duration?: number }>(), { duration: 900 });
const shown = ref<string>('');
let raf = 0;
let current = 0;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const decimals = (v: number) => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(2, s.length - i - 1); };
function run(target: number) {
  cancelAnimationFrame(raf);
  const from = current, d = decimals(target), t0 = performance.now();
  if (reduced() || from === target) { current = target; shown.value = target.toFixed(d); return; }
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / props.duration), e = 1 - Math.pow(1 - p, 3);
    current = from + (target - from) * e; shown.value = current.toFixed(d);
    if (p < 1) raf = requestAnimationFrame(step); else { current = target; shown.value = target.toFixed(d); }
  };
  raf = requestAnimationFrame(step);
}
watch(() => props.value, (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) run(v);
  else { cancelAnimationFrame(raf); current = 0; shown.value = v == null ? '–' : String(v); }
}, { immediate: true });
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template><span class="num">{{ shown }}</span></template>
