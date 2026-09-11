<script setup lang="ts">
/**
 * 요청 진행 단계 표시 — 신청 → 검토 → 확정 → 목업 → 개발 → 완료 (6단계 주 경로)
 * 보류는 "검토" 단계에서 멈춤(노란 점, 아이콘 없음), 행내 도구 안내 종결·반려는 주 경로를 벗어난 종결로 표시.
 */
import { computed } from 'vue';
import { STATUS } from '@shared/statuses.js';

const props = defineProps<{ status: string; compact?: boolean }>();
const STEPS = [
  { key: 'submitted', label: '신청' }, { key: 'reviewing', label: '검토' }, { key: 'accepted', label: '확정' },
  { key: 'developing', label: '개발' }, { key: 'done', label: '완료' },
];
const INDEX: Record<string, number> = { submitted: 0, reviewing: 1, hold: 1, accepted: 2, developing: 3, done: 4 };
const terminal = computed(() => props.status === 'guided' || props.status === 'rejected');
const paused = computed(() => props.status === 'hold');
const idx = computed(() => INDEX[props.status] ?? -1);
const S = STATUS as Record<string, { label: string }>;
const percent = computed(() => (idx.value < 0 ? 0 : Math.round(((idx.value + 1) / STEPS.length) * 100)));
</script>

<template>
  <div v-if="terminal" class="ps-terminal" :data-tone="status === 'guided' ? 'success' : 'danger'">
    <span aria-hidden="true">{{ status === 'guided' ? '✅' : '⛔' }}</span>
    <span>{{ S[status].label }}</span>
  </div>
  <ol v-else class="ps" :class="{ compact }" :aria-label="`진행 단계: ${STEPS[Math.max(0, idx)].label} (${percent}%)`">
    <li v-for="(s, i) in STEPS" :key="s.key" class="ps-step" :data-state="i < idx ? 'done' : i === idx ? (paused ? 'paused' : 'active') : 'todo'">
      <span class="ps-dot" aria-hidden="true">{{ i < idx ? '✓' : '' }}</span>
      <span class="ps-label">{{ s.label }}</span>
      <span v-if="i < STEPS.length - 1" class="ps-bar" :data-done="i < idx" aria-hidden="true"></span>
    </li>
  </ol>
</template>

<style scoped>
.ps { display: flex; align-items: flex-start; gap: 0; width: 100%; max-width: 420px; }
.ps-step { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; position: relative; font-size: 11.5px; color: var(--text-muted); font-weight: 600; min-width: 0; }
.ps-dot { width: 18px; height: 18px; border-radius: 50%; background: var(--surface); border: 2px solid var(--line-strong); display: grid; place-items: center; font-size: 10px; line-height: 1; color: #fff; z-index: 1; transition: background-color var(--transition-fast), border-color var(--transition-fast); }
.ps-step[data-state="done"] .ps-dot { background: var(--mint-deep); border-color: var(--mint-deep); }
.ps-step[data-state="active"] .ps-dot { border-color: var(--accent); background: var(--accent); box-shadow: 0 0 0 3px var(--brand-100); }
.ps-step[data-state="paused"] .ps-dot { border-color: var(--warning-fill); background: var(--warning-fill); box-shadow: 0 0 0 3px var(--warning-bg); }
.ps-step[data-state="active"] { color: var(--accent); }
.ps-step[data-state="paused"] { color: var(--text-sub); }
.ps-step[data-state="done"] { color: var(--text-sub); }
.ps-label { margin-top: 5px; white-space: nowrap; }
.ps-bar { position: absolute; top: 8px; left: calc(50% + 10px); right: calc(-50% + 10px); height: 2px; background: var(--line); }
.ps-bar[data-done="true"] { background: var(--mint-deep); }
.ps.compact .ps-label { font-size: 10.5px; }
.ps.compact .ps-dot { width: 14px; height: 14px; font-size: 8px; }
.ps.compact .ps-bar { top: 6px; left: calc(50% + 8px); right: calc(-50% + 8px); }
.ps-terminal { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-full); }
.ps-terminal[data-tone="success"] { background: var(--success-bg); color: var(--success); }
.ps-terminal[data-tone="danger"] { background: var(--danger-bg); color: var(--danger); }
</style>
