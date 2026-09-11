<script setup lang="ts">
import { computed } from 'vue';
import { STATUS } from '@shared/statuses.js';

const props = defineProps<{ status: string; size?: 'sm' | 'md' }>();
const meta = computed(() => (STATUS as Record<string, { label: string; tone: string }>)[props.status] || { label: props.status, tone: 'neutral' });
const emoji: Record<string, string> = { neutral: '📝', info: '📨', success: '✅', danger: '⛔', brand: '🛠️' }; // warning(보류)은 이모지 없이 색만
</script>

<template>
  <span class="badge" :data-tone="meta.tone" :style="size === 'sm' ? 'font-size:11.5px;padding:2px 8px' : ''">
    <span v-if="emoji[meta.tone]" aria-hidden="true">{{ emoji[meta.tone] }}</span>{{ meta.label }}
  </span>
</template>
