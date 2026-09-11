<script setup lang="ts">
/** 완료된 질문 행 — 우측 볼드 요약 + 연필 수정 + 누적 코칭 팁(💬) */
import RevealButton from '@/components/RevealButton.vue';
import { formatAnswer } from '@shared/questions.js';
import type { QUESTIONS } from '@shared/questions.js';
type Question = (typeof QUESTIONS)[number];
defineProps<{ question: Question; value: string | undefined; number: number; readonly?: boolean }>();
defineEmits<{ edit: [] }>();
</script>

<template>
  <div class="qrow">
    <span class="qrow-ask"><span class="num text-muted" style="font-family:var(--font-mono);font-size:11.5px;margin-right:8px">{{ String(number).padStart(2, '0') }}</span>{{ question.ask }}</span>
    <span class="qrow-answer" :class="{ 'text-muted': value === '' }">{{ formatAnswer(question, value) }}</span>
    <RevealButton v-if="!readonly" icon="✎" label="수정" tone="brand" @click="$emit('edit')" />
    <span v-else></span>
    <p v-if="question.tip && value" class="qrow-tip"><span aria-hidden="true">💬</span><span>{{ question.tip }}</span></p>
  </div>
</template>
