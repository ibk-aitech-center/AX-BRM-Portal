<script setup lang="ts">
import { toasts, dismiss } from '@/services/toast';
const emoji: Record<string, string> = { info: '💡', success: '✨', warning: '⚠️', danger: '🚨' };
</script>

<template>
  <div class="toast-stack" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :data-tone="t.tone" :role="t.tone === 'danger' ? 'alert' : undefined">
      <span aria-hidden="true">{{ emoji[t.tone] }}</span>
      <span class="grow">{{ t.text }}</span>
      <button v-if="t.action" class="toast-action" @click="t.action.run(); dismiss(t.id)">{{ t.action.label }}</button>
      <button class="toast-close" @click="dismiss(t.id)" aria-label="알림 닫기">✕</button>
    </div>
  </div>
</template>

<style scoped>
.toast-close { color: rgba(255,255,255,.7); padding: 4px 6px; }
.toast-close:hover { color: #fff; }
</style>
