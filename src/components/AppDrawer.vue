<script setup lang="ts">
/**
 * 오른쪽에서 미는 서랍(slide-over) — 참고용 긴 목록(이력 등)을 본문 흐름에서 떼어 필요할 때만 꺼내 본다.
 * AppModal 과 같은 규약: Esc·바깥 클릭·✕ 로 닫고(close 이벤트), 열려 있는 동안 페이지 스크롤을 잠근다.
 * 모달과 달리 본문이 옆에 그대로 보여 "지금 보던 요청의 이력"이라는 맥락이 끊기지 않는다.
 */
import { onMounted, onBeforeUnmount, ref } from 'vue';
const props = defineProps<{ title: string; width?: string }>();
const emit = defineEmits<{ close: [] }>();
const closeBtn = ref<HTMLButtonElement | null>(null);
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close'); }
onMounted(() => { document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'; closeBtn.value?.focus(); });
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; });
void props;
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <aside class="drawer" role="dialog" aria-modal="true" :aria-label="title" :style="{ width: width || '480px' }">
      <div class="drawer-head">
        <h2 style="font-size:17px">{{ title }}</h2>
        <div class="row"><slot name="tools" /><button ref="closeBtn" class="btn btn-icon btn-sm" @click="emit('close')" aria-label="닫기">✕</button></div>
      </div>
      <div class="drawer-body"><slot /></div>
    </aside>
  </div>
</template>

<style scoped>
.drawer-backdrop { position: fixed; inset: 0; background: rgba(27,43,44,.35); z-index: var(--z-modal); display: flex; justify-content: flex-end; animation: dr-fade .18s var(--ease-out) both; }
.drawer { max-width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--surface); box-shadow: var(--shadow-modal); animation: dr-in .24s var(--ease-out) both; }
.drawer-head { padding: 18px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.drawer-body { padding: 20px; overflow: auto; flex: 1; min-height: 0; }
@keyframes dr-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dr-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .drawer-backdrop, .drawer { animation: none; } }
</style>
