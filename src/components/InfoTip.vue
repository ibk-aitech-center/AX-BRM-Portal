<script setup lang="ts">
/**
 * 산출 근거 툴팁 — 카드 우측 상단의 ⓘ 버튼. 마우스를 올리거나 포커스하면 열리고, 터치·클릭으로도 토글된다.
 * 숫자가 "어떻게 나온 값인지"를 누구나 그 자리에서 읽을 수 있게 하는 용도.
 * 본문은 구획(section) 단위: 라벨 + 한 문장, 또는 라벨 + 번호 규칙 목록(키워드 굵게 → 설명). 평문 나열보다 훑어 읽기가 쉽다.
 * 접근성: 버튼에 aria-describedby 로 본문을 연결하고, Esc·바깥 클릭으로 닫는다.
 */
import { ref, onBeforeUnmount } from 'vue';

export interface TipStep { k: string; v: string }
export interface TipSection { label: string; text?: string; steps?: readonly TipStep[]; note?: boolean }

const props = withDefaults(defineProps<{ title: string; sections: readonly TipSection[]; label?: string }>(), { label: '산출 기준' });
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
    <!-- 트리거: 물음표 + 라벨 알약. 아이콘만 있을 때보다 "무엇이 나오는지" 읽혀 눌러 볼 이유가 생긴다 (2026-09-11) -->
    <button type="button" class="tip-btn" :aria-label="`${title} ${label}`" :aria-expanded="open" :aria-describedby="id" @click.stop="toggle">
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="currentColor" opacity=".18" /><path d="M7.4 7.9a2.6 2.6 0 1 1 3.7 2.35c-.7.35-1.1.8-1.1 1.55v.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /><circle cx="10" cy="14.6" r="1.05" fill="currentColor" /></svg>
      <span class="tip-btn-label">{{ label }}</span>
    </button>
    <span :id="id" role="tooltip" class="tip-pop">
      <span class="tip-head">
        <span class="tip-eyebrow">{{ label }}</span>
        <span class="tip-title">{{ title }}</span>
      </span>
      <span class="tip-body">
        <span v-for="s in sections" :key="s.label" class="tip-sec" :class="{ 'tip-note': s.note }">
          <span class="tip-label">{{ s.label }}</span>
          <span v-if="s.text" class="tip-text">{{ s.text }}</span>
          <ol v-if="s.steps" class="tip-steps">
            <li v-for="(st, i) in s.steps" :key="st.k"><span class="tip-num">{{ i + 1 }}</span><span><b>{{ st.k }}</b> {{ st.v }}</span></li>
          </ol>
        </span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.tip { position: relative; display: inline-flex; }
.tip-btn { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px 0 6px; border-radius: 999px; border: 1px solid var(--brand-100); background: var(--surface); color: var(--accent); font-size: 11px; font-weight: 600; letter-spacing: .01em; cursor: help; transition: color var(--transition), background var(--transition), border-color var(--transition); }
.tip-btn:hover, .tip-btn:focus-visible, .tip.open .tip-btn { background: var(--accent-soft); border-color: var(--brand-300); outline: none; }
.tip-btn-label { line-height: 1; }

/* 팝오버 — 버튼 아래로 펼치고 오른쪽 끝을 맞춘다(카드 폭이 좁아 화면 밖 넘침 방지). 카드 위에 확실히 떠 보이도록 모달급 그림자 */
.tip-pop { position: absolute; top: calc(100% + 10px); right: -4px; z-index: var(--z-panel); width: min(380px, 86vw); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: 0 16px 40px rgba(27,43,44,.18), 0 2px 6px rgba(27,43,44,.08); text-align: left; font-weight: 400; overflow: hidden; opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .16s var(--ease-out), transform .16s var(--ease-out), visibility 0s .16s; }
.tip:hover .tip-pop, .tip:focus-within .tip-pop, .tip.open .tip-pop { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
.tip-pop::before { content: ''; position: absolute; top: -6px; right: 12px; width: 11px; height: 11px; background: var(--accent-soft); border-left: 1px solid var(--line); border-top: 1px solid var(--line); transform: rotate(45deg); }

/* 머리: 옅은 브랜드 띠 — 무엇의 근거인지 한눈에 */
.tip-head { display: flex; flex-direction: column; gap: 2px; padding: 12px 16px 11px; background: var(--accent-soft); border-bottom: 1px solid var(--line); }
.tip-eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: .03em; color: var(--accent); }
.tip-title { font-size: 14px; font-weight: 700; color: var(--text); }

/* 몸통: 구획마다 라벨 + 내용. 구획 사이는 점선으로 가볍게 */
.tip-body { display: block; padding: 6px 16px 10px; }
.tip-sec { display: block; padding: 9px 0; }
.tip-sec + .tip-sec { border-top: 1px dashed var(--line); }
.tip-label { display: block; font-size: 11.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; }
.tip-text { display: block; font-size: 13px; line-height: 1.6; color: var(--text); word-break: keep-all; }
.tip-note .tip-text { color: var(--text-sub); }
.tip-steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.tip-steps li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.55; color: var(--text-sub); word-break: keep-all; }
.tip-steps b { color: var(--text); font-weight: 700; }
.tip-num { flex: none; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; background: var(--brand-100); color: var(--brand-600, var(--accent)); font-family: var(--font-mono); font-size: 11px; font-weight: 700; display: grid; place-items: center; }
@media (prefers-reduced-motion: reduce) { .tip-pop { transition: none; } }
</style>
