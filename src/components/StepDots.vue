<script setup lang="ts">
import { SECTIONS } from '@shared/questions.js';
defineProps<{ current: string; doneKeys: string[]; hiddenKeys?: string[] }>();
</script>

<template>
  <ol class="steps" aria-label="진행 단계">
    <template v-for="(s, i) in SECTIONS.filter((x) => !(hiddenKeys || []).includes(x.key))" :key="s.key">
      <li class="step" :data-state="s.key === current ? 'active' : doneKeys.includes(s.key) ? 'done' : 'todo'" :aria-current="s.key === current ? 'step' : undefined">
        <span class="step-dot" aria-hidden="true"></span>
        <span class="step-label">{{ s.title }}</span>
      </li>
      <span v-if="i < SECTIONS.filter((x) => !(hiddenKeys || []).includes(x.key)).length - 1" class="step-bar" :data-state="doneKeys.includes(s.key) ? 'done' : ''" aria-hidden="true"></span>
    </template>
  </ol>
</template>

<style scoped>
@media (max-width: 640px) { .step-label { display: none; } .step[data-state="active"] .step-label { display: inline; } }
</style>
