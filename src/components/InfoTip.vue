<script setup lang="ts">
/**
 * 산출 근거 툴팁 — 카드 우측 상단의 ⓘ 버튼. 마우스를 올리거나 포커스하면 열리고, 터치·클릭으로도 토글된다.
 * 숫자가 "어떻게 나온 값인지"를 누구나 그 자리에서 읽을 수 있게 하는 용도라, 본문은 짧은 규칙 목록으로 쓴다.
 * 접근성: 버튼에 aria-describedby 로 본문을 연결하고, Esc 로 닫는다.
 */
import { ref, onBeforeUnmount } from 'vue';

const props = withDefaults(defineProps<{ title: string; lines: readonly string[]; label?: string }>(), { label: '산출 기준' });
const open = ref(false);
const id = `tip-${Math.random().toString(36).slice(2, 8)}`;
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false; }
function onDoc(e: MouseEvent) { if (!(e.target as HTMLElement).closest(`[data-tip="${id}"]`)) open.value = false; }
function toggle() { open.value = !open.value; }
document.addEventListener('keydown', onKey); document.addEventListener('click', onDoc);
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onDoc); });
void props;
</script>

<template>
  <span class="tip" :class="{ open }" :data-tip="id">
    <button type="button" class="tip-btn" :aria-label="`${title} ${label}`" :aria-expanded="open" :aria-describedby="id" @click.stop="toggle">ⓘ</button>
    <span :id="id" role="tooltip" class="tip-pop">
      <span class="tip-title">{{ title }} · {{ label }}</span>
      <ul class="tip-list">
        <li v-for="l in lines" :key="l">{{ l }}</li>
      </ul>
    </span>
  </span>
</template>

<style scoped>
.tip { position: relative; display: inline-flex; }
.tip-btn { width: 22px; height: 22px; border-radius: 50%; border: 0; background: transparent; color: var(--text-muted); font-size: 15px; line-height: 1; cursor: help; display: grid; place-items: center; transition: color var(--transition), background var(--transition); }
.tip-btn:hover, .tip-btn:focus-visible, .tip.open .tip-btn { color: var(--accent); background: var(--accent-soft); outline: none; }
/* 팝오버 — 카드 우측 상단에서 아래로 펼친다. 카드 폭이 좁아 오른쪽 정렬로 화면 밖 넘침을 막는다 */
.tip-pop { position: absolute; top: calc(100% + 8px); right: -6px; z-index: var(--z-panel); width: min(320px, 80vw); padding: 12px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-elevated); text-align: left; font-weight: 400; opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .16s var(--ease-out), transform .16s var(--ease-out), visibility 0s .16s; }
.tip:hover .tip-pop, .tip:focus-within .tip-pop, .tip.open .tip-pop { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
.tip-pop::before { content: ''; position: absolute; top: -6px; right: 12px; width: 10px; height: 10px; background: var(--surface); border-left: 1px solid var(--line); border-top: 1px solid var(--line); transform: rotate(45deg); }
.tip-title { display: block; font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.tip-list { margin: 0; padding-left: 16px; font-size: 12.5px; line-height: 1.6; color: var(--text-sub); word-break: keep-all; }
.tip-list li + li { margin-top: 3px; }
@media (prefers-reduced-motion: reduce) { .tip-pop { transition: none; } }
</style>
