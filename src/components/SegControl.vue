<script setup lang="ts" generic="T extends string">
/**
 * 세그먼트 컨트롤 — "여러 값 중 하나"를 고르는 자리의 공용 모션.
 * 잉크색 필(thumb)이 고른 항목으로 미끄러지는데, 같은 줄이면 먼저 목적지까지 늘어났다가(stretch) 뒤끝이 따라와 줄어든다(settle).
 * 레퍼런스: raul_dronca "macOS traffic lights" 연도 선택. 값이 줄바꿈으로 다른 줄에 있으면 늘림 없이 glide 만.
 *  - role: 'radiogroup'(기본, 값 선택) | 'tablist'(패널 전환)
 *  - 모션 축소 환경에서는 애니메이션 없이 즉시 이동
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

export interface SegOption<V extends string = string> { value: V; label: string; count?: number | string; icon?: string }

const props = withDefaults(defineProps<{
  modelValue: T | null;
  options: SegOption<T>[];
  role?: 'radiogroup' | 'tablist';
  size?: 'md' | 'sm';
  ariaLabel?: string;
}>(), { role: 'radiogroup', size: 'md' });
const emit = defineEmits<{ (e: 'update:modelValue', v: T): void }>();

const root = ref<HTMLElement | null>(null);
const thumb = ref<HTMLElement | null>(null);
const items = new Map<string, HTMLElement>();
const setItem = (v: string, el: unknown) => { if (el) items.set(v, el as HTMLElement); else items.delete(v); };
let anim: Animation | null = null;
let ro: ResizeObserver | null = null;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Box = { left: number; top: number; width: number; height: number };
function box(v: T | null): Box | null {
  const el = v == null ? null : items.get(v);
  return el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null;
}
function place(b: Box | null) {
  const t = thumb.value; if (!t) return;
  if (!b) { t.style.opacity = '0'; return; }
  Object.assign(t.style, { opacity: '1', left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
}
function move(from: Box | null, to: Box | null) {
  const t = thumb.value; if (!t) return;
  anim?.cancel(); anim = null;
  if (!from || !to || reduced()) { place(to); return; }
  const px = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
  const sameRow = Math.abs(from.top - to.top) < 2;
  const frames: Keyframe[] = sameRow
    ? [
        { ...px(from), easing: 'cubic-bezier(.3,0,.1,1)' },
        // 늘어남: 두 위치를 모두 덮는 길이까지 — 앞끝이 먼저 도착
        { ...px({ left: Math.min(from.left, to.left), top: from.top, width: Math.max(from.left + from.width, to.left + to.width) - Math.min(from.left, to.left), height: from.height }), offset: .45, easing: 'cubic-bezier(.16,1,.3,1)' },
        px(to),
      ]
    : [{ ...px(from), easing: 'cubic-bezier(.16,1,.3,1)' }, px(to)];
  t.style.opacity = '1';
  anim = t.animate(frames, { duration: sameRow ? 480 : 360, fill: 'forwards' });
  anim.onfinish = () => { place(to); anim?.cancel(); anim = null; };
}

let prev: Box | null = null;
watch(() => props.modelValue, async (nv) => { await nextTick(); const to = box(nv); move(prev, to); prev = to; });
onMounted(async () => {
  await nextTick(); prev = box(props.modelValue); place(prev);
  if (typeof ResizeObserver !== 'undefined' && root.value) { ro = new ResizeObserver(() => { prev = box(props.modelValue); place(prev); }); ro.observe(root.value); }
});
onBeforeUnmount(() => { ro?.disconnect(); anim?.cancel(); });

function onKey(e: KeyboardEvent, i: number) {
  const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  const n = props.options[(i + d + props.options.length) % props.options.length];
  emit('update:modelValue', n.value);
  items.get(n.value)?.focus();
}
</script>

<template>
  <div ref="root" class="seg" :class="{ 'seg-sm': size === 'sm' }" :role="role" :aria-label="ariaLabel">
    <span ref="thumb" class="seg-thumb" aria-hidden="true"></span>
    <button
      v-for="(o, i) in options" :key="o.value" :ref="(el) => setItem(o.value, el)"
      type="button" class="seg-item" :role="role === 'tablist' ? 'tab' : 'radio'"
      :aria-checked="role === 'radiogroup' ? modelValue === o.value : undefined"
      :aria-selected="role === 'tablist' ? modelValue === o.value : undefined"
      :data-on="modelValue === o.value ? 'true' : 'false'"
      :tabindex="modelValue === o.value || (modelValue == null && i === 0) ? 0 : -1"
      @click="emit('update:modelValue', o.value)" @keydown="onKey($event, i)"
    >
      <slot name="item" :option="o">{{ o.label }}</slot>
      <b v-if="o.count !== undefined" class="seg-count num">{{ o.count }}</b>
    </button>
  </div>
</template>
