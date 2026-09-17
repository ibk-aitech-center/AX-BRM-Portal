<script setup lang="ts">
/**
 * 미읽음 범례 + 전체 읽음 처리 — 접수함·데이터 요청·접수현황 조회 표 바로 위 한 줄.
 * 점 색이 무엇을 뜻하는지 항상 보여 준다(미읽음이 0 이어도 남겨 "표시 없음 = 다 읽음"을 알 수 있게).
 * 버튼은 미읽음이 하나도 없으면 비활성.
 */
import { ref } from 'vue';
import { UNREAD_LABEL, markAllRead, type UnreadScope } from '@/services/unread';
import { toast } from '@/services/toast';
import { humanMessage } from '@/services/api';

const props = defineProps<{ scope: UnreadScope; newCount: number; updatedCount: number }>();
const emit = defineEmits<{ (e: 'done'): void }>();
const busy = ref(false);
async function readAll() {
  busy.value = true;
  try { const n = await markAllRead(props.scope); toast(`${n}건을 읽음 처리했어요`, 'success'); emit('done'); }
  catch (e) { toast(humanMessage(e), 'danger'); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="legend" role="note" aria-label="미읽음 표시 안내">
    <button type="button" class="btn btn-secondary btn-sm legend-btn" :disabled="busy || !(newCount + updatedCount)" data-testid="read-all" @click="readAll">{{ busy ? '처리 중…' : '✓ 전체 읽음 처리' }}</button>
    <span class="legend-sep" aria-hidden="true"></span>
    <span class="legend-item"><span class="unread-dot" data-unread="new" aria-hidden="true"></span>{{ UNREAD_LABEL.new }}<b v-if="newCount" class="num"> {{ newCount }}</b></span>
    <span class="legend-item"><span class="unread-dot" data-unread="updated" aria-hidden="true"></span>{{ UNREAD_LABEL.updated }}<b v-if="updatedCount" class="num"> {{ updatedCount }}</b></span>
  </div>
</template>

<style scoped>
/* 버튼(왼쪽) → 구분선 → 범례 순. 버튼은 테두리 있는 secondary 로 "누르는 것"임이 보이게 */
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 8px 4px; font-size: 12.5px; color: var(--text-sub); }
.legend-sep { width: 1px; height: 16px; background: var(--line-strong); }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-item b { color: var(--text); }
.legend-btn { flex: none; }
</style>
