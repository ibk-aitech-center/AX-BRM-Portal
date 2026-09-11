<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
const props = defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close'); }
onMounted(() => { document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'; });
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; });
void props;
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-head">
        <h2 style="font-size:17px">{{ title }}</h2>
        <button class="btn btn-icon btn-sm" @click="emit('close')" aria-label="닫기">✕</button>
      </div>
      <div class="modal-body"><slot /></div>
      <div v-if="$slots.foot" class="modal-foot"><slot name="foot" /></div>
    </div>
  </div>
</template>

<style scoped>
.modal.wide { width: min(1100px, 100%); height: 90vh; }
.modal.wide .modal-body { padding: 0; display: flex; flex-direction: column; }
</style>
