<script setup lang="ts">
import { ref } from 'vue';
import { api, humanMessage } from '@/services/api';
import { fileToBase64, fmtBytes } from '@/services/format';
import { toast } from '@/services/toast';

const props = defineProps<{ requestId: string; kind: 'mockup' | 'reference'; accept?: string; label?: string; hint?: string }>();
const emit = defineEmits<{ uploaded: [] }>();
const input = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);
const note = ref('');
const busy = ref(false);
const drag = ref(false);
const MAX = 20 * 1024 * 1024;

function pick(f: File | undefined) {
  if (!f) return;
  if (f.size > MAX) { toast('파일이 너무 커요. 20MB 이하로 줄여서 올려주세요.', 'danger'); return; }
  if (props.kind === 'mockup' && !/\.html$/i.test(f.name)) { toast('목업은 확장자가 .html 인 파일만 올릴 수 있어요.', 'warning'); return; }
  file.value = f;
}
async function upload() {
  if (!file.value) return;
  busy.value = true;
  try {
    const f = file.value;
    const mime = f.type || (/\.html?$/i.test(f.name) ? 'text/html' : 'application/octet-stream');
    await api.post(`/api/requests/${props.requestId}/attachments`, { kind: props.kind, fileName: f.name, mime, contentBase64: await fileToBase64(f), note: note.value });
    toast(props.kind === 'mockup' ? '목업을 올렸어요. 요청자도 바로 볼 수 있어요.' : '파일을 올렸어요.', 'success');
    file.value = null; note.value = ''; if (input.value) input.value.value = '';
    emit('uploaded');
  } catch (e) { toast(humanMessage(e), 'danger'); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="upload">
    <label class="dropzone" :class="{ drag }" @dragover.prevent="drag = true" @dragleave="drag = false" @drop.prevent="drag = false; pick($event.dataTransfer?.files?.[0])">
      <input ref="input" type="file" :accept="accept" class="sr-only" @change="pick(($event.target as HTMLInputElement).files?.[0])" />
      <span aria-hidden="true" style="font-size:24px">{{ kind === 'mockup' ? '🖥️' : '📎' }}</span>
      <span class="fw-600">{{ label || '파일을 끌어다 놓거나 클릭해서 선택' }}</span>
      <span class="hint">{{ hint || '20MB 이하' }}</span>
    </label>
    <div v-if="file" class="row mt-sm wrap">
      <span class="text-sm grow truncate">📄 {{ file.name }} <span class="text-muted">({{ fmtBytes(file.size) }})</span></span>
      <input v-model="note" class="input" style="min-height:40px;padding:8px 12px;max-width:260px" placeholder="메모 (선택) 예) 1차 컨셉" aria-label="첨부 메모" />
      <button class="btn btn-primary btn-sm" :disabled="busy" @click="upload">
        <span v-if="busy" class="spinner" style="width:14px;height:14px;border-width:2px" aria-hidden="true"></span>{{ busy ? '올리는 중…' : '올리기' }}
      </button>
      <button class="btn btn-ghost btn-sm" :disabled="busy" @click="file = null">취소</button>
    </div>
  </div>
</template>

<style scoped>
.dropzone { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px; border: 1.5px dashed var(--line-strong); border-radius: var(--radius-md); background: var(--surface-2); cursor: pointer; text-align: center; transition: border-color var(--transition-fast), background-color var(--transition-fast); }
.dropzone:hover, .dropzone.drag { border-color: var(--accent); background: var(--accent-soft); }
.dropzone:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
