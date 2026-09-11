<script setup lang="ts">
import RevealButton from '@/components/RevealButton.vue';
import Icon3d from '@/components/Icon3d.vue';
/**
 * 활성 질문 카드 — 진행 트리거 계약 (DESIGN_GUIDELINES §5):
 *  single → 클릭 즉시 진행 / text → Enter 또는 "다음" / textarea → Ctrl+Enter 또는 "다음". blur 로는 진행하지 않는다.
 */
import { ref, watch, onMounted, nextTick, computed } from 'vue';
import type { QUESTIONS } from '@shared/questions.js';

type Question = (typeof QUESTIONS)[number];
const props = defineProps<{ question: Question; value?: string; number: number; editing?: boolean }>();
const emit = defineEmits<{ answer: [value: string]; cancel: [] ; input: [value: string] }>();

const text = ref(props.value ?? '');
const showWhy = ref(false);
const invalid = ref(false);
const inputEl = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const root = ref<HTMLElement | null>(null);

watch(() => props.question.id, () => { text.value = props.value ?? ''; invalid.value = false; showWhy.value = false; focusInput(); });
// 아직 제출하지 않은 입력을 부모에게 흘려보낸다 — 다른 답을 고치러 갔다 와도 쓰던 글이 남도록
watch(text, (v) => emit('input', v));
onMounted(() => { focusInput(); root.value?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });

// 주관식은 입력칸, 객관식은 카드 자체에 포커스 — 그래야 마우스 없이 숫자 키만으로 바로 고를 수 있다
async function focusInput() { await nextTick(); (inputEl.value ?? root.value)?.focus({ preventScroll: true }); }

const canSubmit = computed(() => props.question.optional || text.value.trim().length > 0);

function submitText() {
  if (!canSubmit.value) { invalid.value = true; setTimeout(() => (invalid.value = false), 500); return; }
  emit('answer', text.value.trim());
}
function skip() { emit('answer', ''); }

function onKeydown(e: KeyboardEvent) {
  if (props.question.type === 'single') {
    const n = Number(e.key);
    if (n >= 1 && n <= (props.question.options?.length || 0)) { e.preventDefault(); emit('answer', props.question.options![n - 1].value); }
    return;
  }
  if (e.key === 'Enter' && (props.question.type === 'text' || e.ctrlKey || e.metaKey)) { e.preventDefault(); submitText(); }
}
</script>

<template>
  <section ref="root" class="qcard rise" tabindex="-1" :aria-labelledby="'q-' + question.id" @keydown="onKeydown">
    <div class="qcard-head">
      <span class="qcard-num num" aria-hidden="true">{{ String(number).padStart(2, '0') }}</span>
      <div class="grow">
        <h2 :id="'q-' + question.id" class="qcard-ask">{{ question.ask }}</h2>
        <p v-if="question.sub" class="qcard-sub">{{ question.sub }}</p>
      </div>
      <RevealButton v-if="question.why" icon="ⓘ" :label="showWhy ? '설명 닫기' : '왜 묻나요?'" tone="brand" :aria-expanded="showWhy" @click="showWhy = !showWhy" />
    </div>
    <p v-if="showWhy && question.why" class="notice mt-sm" data-level="check"><span class="notice-emoji" aria-hidden="true"><Icon3d name="lightbulb-idea" :size="18" /></span>{{ question.why }}</p>

    <!-- 선택형 -->
    <div v-if="question.type === 'single'" class="choices" role="radiogroup" :aria-labelledby="'q-' + question.id">
      <button
        v-for="(o, i) in question.options" :key="o.value" type="button" role="radio"
        class="choice" :class="{ 'choice-unknown': o.unknown }" :aria-checked="value === o.value"
        @click="emit('answer', o.value)"
      >
        <span class="choice-mark" aria-hidden="true"></span>
        <span class="grow">
          <span class="choice-label">{{ o.label }}</span>
          <span v-if="o.hint" class="choice-hint">{{ o.hint }}</span>
        </span>
        <kbd class="choice-key" aria-hidden="true">{{ i + 1 }}</kbd>
      </button>
      <p class="choice-keyhint text-muted" aria-hidden="true">키보드 <kbd>1</kbd>–<kbd>{{ question.options?.length }}</kbd> 을 누르면 바로 골라져요</p>
    </div>

    <!-- 주관식 -->
    <div v-else class="field mt-md">
      <label :for="'in-' + question.id" class="sr-only">{{ question.ask }}</label>
      <input v-if="question.type === 'text'" ref="inputEl" :id="'in-' + question.id" v-model="text" class="input" :placeholder="question.placeholder" :aria-invalid="invalid" autocomplete="off" />
      <textarea v-else ref="inputEl" :id="'in-' + question.id" v-model="text" class="textarea" :placeholder="question.placeholder" :aria-invalid="invalid" rows="4"></textarea>
      <div class="row-between wrap">
        <span class="hint">{{ question.type === 'text' ? 'Enter' : 'Ctrl + Enter' }}로도 넘어갈 수 있어요{{ question.optional ? ' · 선택 항목' : '' }}</span>
        <span class="row">
          <button v-if="question.optional" type="button" class="btn btn-ghost" @click="skip">건너뛰기</button>
          <button v-if="editing" type="button" class="btn btn-ghost" @click="emit('cancel')">취소</button>
          <button type="button" class="btn btn-primary" @click="submitText">{{ editing ? '수정 완료' : '다음 →' }}</button>
        </span>
      </div>
    </div>
    <div v-if="question.type === 'single' && editing" class="row mt-sm" style="justify-content:flex-end">
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">취소</button>
    </div>
  </section>
</template>

<style scoped>
.qcard { background: var(--surface); border: 1.5px solid var(--brand-300); border-radius: var(--radius-lg); padding: 28px; }
.qcard-head { display: flex; gap: 14px; align-items: flex-start; }
.qcard-num { font-family: var(--font-mono); font-size: 13px; color: var(--accent); padding-top: 5px; }
.qcard-ask { font-size: 20px; font-weight: 700; line-height: 1.4; }
.qcard-sub { color: var(--text-sub); margin-top: 6px; font-size: 14.5px; }
.choices { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
.qcard:focus { outline: none; }
.qcard:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* 숫자 키 힌트 — 키캡처럼 보이게(아래 그림자·고정폭), 고른 보기는 브랜드색으로 */
.choice-key, .choice-keyhint kbd {
  display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px;
  font-family: var(--font-mono); font-size: 11.5px; font-weight: 600; line-height: 1; color: var(--text-muted);
  background: var(--surface); border: 1px solid var(--line-strong); border-bottom-width: 2.5px; border-radius: 6px;
}
.choice-key { flex: 0 0 auto; align-self: center; }
.choice[aria-checked="true"] .choice-key { color: var(--brand-700); border-color: var(--brand-300); background: var(--brand-50); }
.choice-keyhint { display: flex; align-items: center; gap: 4px; margin: 2px 0 0; font-size: 12.5px; }
.choice-keyhint kbd { min-width: 18px; height: 18px; font-size: 10.5px; border-bottom-width: 2px; }
@media (max-width: 640px), (hover: none) { .choice-key, .choice-keyhint { display: none; } }
@media (max-width: 640px) { .qcard { padding: 20px; } .qcard-ask { font-size: 18px; } }
</style>
