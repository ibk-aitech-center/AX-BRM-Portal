<script setup lang="ts">
/**
 * 검색 가능한 단일 선택 (combobox) — 접수함 조회 조건처럼 항목이 늘어나는 자리에서 `<select>` 대신 쓴다.
 *  · 닫힌 상태: 고른 항목 라벨(없으면 placeholder = "모든 부서")을 입력창에 보여 준다
 *  · 타이핑하면 열리고 라벨·값·검색어(keywords)를 부분 일치로 거른다 — 공백 무시, 대소문자 무시
 *  · ↑↓ 이동 · Enter 선택 · Esc 닫기 · 바깥 클릭 닫기 · × 로 비우기(placeholder 항목 = 빈 값)
 *  · 외부 라이브러리 없음. ARIA 1.2 combobox 패턴(aria-activedescendant)
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

export interface ComboOption { value: string; label: string; count?: number; keywords?: string }

const props = withDefaults(defineProps<{
  modelValue: string;
  options: ComboOption[];
  placeholder: string;   // 빈 값의 라벨 — "모든 부서"
  label: string;         // 접근성 이름 — "요청부서"
  width?: string;        // 고정 너비 — inline-block 안의 input 은 내용 너비로 커져서 명시한다
}>(), { width: '180px' });
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const uid = `cb-${Math.random().toString(36).slice(2, 8)}`;
const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
const open = ref(false);
const query = ref('');
const active = ref(0);

const selected = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null);
const fold = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const filtered = computed(() => {
  const q = fold(query.value);
  const all: ComboOption[] = [{ value: '', label: props.placeholder }, ...props.options];
  if (!q) return all;
  return all.filter((o) => o.value !== '' && fold(`${o.label} ${o.value} ${o.keywords ?? ''}`).includes(q));
});
const text = computed(() => (open.value ? query.value : selected.value?.label ?? ''));

function show() {
  if (open.value) return;
  open.value = true; query.value = '';
  active.value = Math.max(0, filtered.value.findIndex((o) => o.value === props.modelValue));
  nextTick(scrollActive);
}
function hide() { open.value = false; query.value = ''; }
function pick(o: ComboOption) { emit('update:modelValue', o.value); hide(); input.value?.blur(); }
function clear() { emit('update:modelValue', ''); hide(); input.value?.focus(); }
function onInput(e: Event) { query.value = (e.target as HTMLInputElement).value; if (!open.value) open.value = true; active.value = 0; nextTick(scrollActive); }
function move(d: number) {
  if (!open.value) { show(); return; }
  const n = filtered.value.length; if (!n) return;
  active.value = (active.value + d + n) % n; scrollActive();
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter') { if (open.value && filtered.value[active.value]) { e.preventDefault(); pick(filtered.value[active.value]); } }
  else if (e.key === 'Escape') { if (open.value) { e.stopPropagation(); hide(); } }
  else if (e.key === 'Backspace' && !open.value && props.modelValue) { e.preventDefault(); clear(); }
}
function scrollActive() {
  const el = list.value?.children[active.value] as HTMLElement | undefined;
  el?.scrollIntoView({ block: 'nearest' });
}
function onDocDown(e: MouseEvent) { if (open.value && root.value && !root.value.contains(e.target as Node)) hide(); }
onMounted(() => document.addEventListener('mousedown', onDocDown));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown));
// 옵션 목록이 새로 오면(재조회) 활성 인덱스가 범위를 벗어나지 않게
watch(filtered, (l) => { if (active.value >= l.length) active.value = 0; });
</script>

<template>
  <div ref="root" class="cb" :class="{ 'is-open': open, 'has-value': !!modelValue }" :style="{ width }">
    <input
      ref="input" class="input cb-input" type="text" autocomplete="off" spellcheck="false"
      role="combobox" :aria-label="label" :aria-expanded="open" :aria-controls="`${uid}-list`" aria-autocomplete="list" aria-haspopup="listbox"
      :aria-activedescendant="open && filtered[active] ? `${uid}-${active}` : undefined"
      :value="text" :placeholder="placeholder"
      @focus="show" @click="show" @input="onInput" @keydown="onKey"
    />
    <button v-if="modelValue && !open" type="button" class="cb-clear" :aria-label="`${label} 선택 해제`" @mousedown.prevent @click="clear">×</button>
    <span v-else class="cb-chev" aria-hidden="true"></span>
    <ul v-show="open" :id="`${uid}-list`" ref="list" class="cb-list" role="listbox" :aria-label="label">
      <li
        v-for="(o, i) in filtered" :key="o.value || '__all'" :id="`${uid}-${i}`" role="option"
        class="cb-opt" :class="{ 'is-active': i === active, 'is-selected': o.value === modelValue, 'cb-all': o.value === '' }" :aria-selected="o.value === modelValue"
        @mousedown.prevent @mouseenter="active = i" @click="pick(o)"
      >
        <span class="truncate">{{ o.label }}</span>
        <span v-if="o.count !== undefined" class="cb-count num">{{ o.count }}</span>
      </li>
      <li v-if="!filtered.length" class="cb-empty text-muted">일치하는 항목이 없어요</li>
    </ul>
  </div>
</template>

<style scoped>
.cb { position: relative; display: inline-block; }
.cb-input { min-height: 40px; padding: 8px 32px 8px 12px; font-size: 14px; width: 100%; cursor: pointer; }
.cb.is-open .cb-input { cursor: text; }
/* 값이 골라진 상태에선 입력창이 "필터가 걸려 있음"을 테두리로 알린다 */
.cb.has-value:not(.is-open) .cb-input { border-color: var(--brand-300); background: var(--brand-50); font-weight: 600; }
.cb-input::placeholder { color: var(--text); font-weight: 500; }
.cb.is-open .cb-input::placeholder { color: var(--ink-500); font-weight: 400; }
.cb-chev { position: absolute; right: 12px; top: 50%; width: 7px; height: 7px; margin-top: -5px; border-right: 1.5px solid var(--text-sub); border-bottom: 1.5px solid var(--text-sub); transform: rotate(45deg); pointer-events: none; transition: transform var(--transition-fast); }
.cb.is-open .cb-chev { transform: rotate(225deg); margin-top: -2px; }
.cb-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; border-radius: 50%; border: 0; background: transparent; color: var(--text-sub); font-size: 16px; line-height: 1; cursor: pointer; display: grid; place-items: center; }
.cb-clear:hover { background: var(--brand-100); color: var(--text); }
.cb-list { position: absolute; left: 0; top: calc(100% + 4px); z-index: var(--z-panel); min-width: 100%; max-height: 280px; overflow-y: auto; padding: 4px; margin: 0; list-style: none; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-elevated); animation: cb-pop .14s var(--ease-out) both; }
.cb-opt { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 7px 10px; border-radius: 6px; font-size: 13.5px; color: var(--text); cursor: pointer; white-space: nowrap; }
.cb-opt.is-active { background: var(--brand-50); }
.cb-opt.is-selected { font-weight: 700; }
.cb-opt.is-selected::after { content: '✓'; font-size: 12px; color: var(--brand-500); }
.cb-all { color: var(--text-sub); border-bottom: 1px dashed var(--line); border-radius: 6px 6px 0 0; margin-bottom: 2px; }
.cb-count { font-size: 12px; color: var(--text-muted); }
.cb-empty { padding: 10px; font-size: 13px; }
@keyframes cb-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .cb-list { animation: none; } }
</style>
