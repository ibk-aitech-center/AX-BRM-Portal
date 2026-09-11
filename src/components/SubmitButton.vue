<script setup lang="ts">
/**
 * 제출 상태 버튼 — 라벨 → 점 3개 바운스(loading) → 체크 드로우(done). 스피너 대신 "진행 중 → 끝났다"가 읽히게.
 * class 는 그대로 통과된다 (btn-lg 등). loading/done 동안은 눌리지 않는다.
 */
defineProps<{ state?: 'idle' | 'loading' | 'done'; disabled?: boolean }>();
</script>

<template>
  <button class="btn btn-primary btn-state" :data-state="state || 'idle'" :disabled="disabled || state === 'loading' || state === 'done'" :aria-busy="state === 'loading' || undefined">
    <span class="bs-label"><slot /></span>
    <span class="bs-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    <svg class="bs-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" /></svg>
  </button>
</template>
