<script setup lang="ts">
/**
 * 본부부서 대상 안내 — 상담을 요청할 수 없는 직원(영업점 등)에게 보여 주는 한 장의 안내.
 * 두 모드: dialog(랜딩에서 상담 시작을 눌렀을 때 오버레이) · banner(내 요청 화면 상단).
 * 문구는 session.HQ_ONLY_NOTICE 하나를 쓴다 — 서버 403 메시지와 같은 말.
 * 랜딩과 같은 재료로 만든다: 민트 카드, 세리프 제목, 아이브로우. 장식 아이콘은 두지 않는다(2026-09-11 — 과해 보여 제거). 에러가 아니라 "길 안내"이므로 붉은색을 쓰지 않는다.
 */
import { onMounted, onBeforeUnmount } from 'vue';
import Icon3d from '@/components/Icon3d.vue';
import { HQ_ONLY_NOTICE } from '@/services/session';

const props = withDefaults(defineProps<{ mode?: 'dialog' | 'banner' }>(), { mode: 'banner' });
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) { if (props.mode === 'dialog' && e.key === 'Escape') emit('close'); }
onMounted(() => { if (props.mode === 'dialog') { document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'; } });
onBeforeUnmount(() => { if (props.mode === 'dialog') { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; } });

</script>

<template>
  <!-- dialog: 배경을 누르거나 Esc·확인으로 닫힌다. 헤더·✕ 없이 카드 하나 — 읽고 닫는 안내라 조작 요소를 줄인다 -->
  <div v-if="mode === 'dialog'" class="modal-backdrop" @click.self="emit('close')">
    <div class="hq hq-dialog" role="dialog" aria-modal="true" :aria-label="HQ_ONLY_NOTICE.title">
      <div class="hq-body">
        <p class="eyebrow">AX-BRM 포탈 안내</p>
        <h2 class="hq-title serif">{{ HQ_ONLY_NOTICE.title }}</h2>
        <div class="hq-next">
          <Icon3d name="suggestion-box" :size="30" />
          <div>
            <div class="hq-next-label">이렇게 진행해 주세요</div>
            <div class="hq-next-text">{{ HQ_ONLY_NOTICE.action }}</div>
          </div>
        </div>
      </div>
      <div class="hq-foot">
        <button class="btn btn-primary" autofocus @click="emit('close')">확인했어요</button>
      </div>
    </div>
  </div>

  <!-- banner: 목록 위에 앉는 가로 카드. 같은 재료를 한 줄로 -->
  <div v-else class="hq hq-banner card card-mint" role="status">
    <div class="grow">
      <div class="hq-banner-title">{{ HQ_ONLY_NOTICE.title }}</div>
      <p class="hq-text hq-text-sm">{{ HQ_ONLY_NOTICE.action }}</p>
    </div>
    <span class="hq-chip" aria-hidden="true"><Icon3d name="suggestion-box" :size="18" /> 지식제안</span>
  </div>
</template>

<style scoped>
/* ── 공통 재료 ── */
.hq-text { margin: 0; color: var(--text-sub); font-size: 15px; line-height: 1.75; word-break: keep-all; }
.hq-text-sm { font-size: 14px; line-height: 1.65; margin-top: 2px; }

/* ── dialog ── */
.hq-dialog { width: min(520px, 100%); background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-modal); overflow: hidden; animation: hq-in .28s cubic-bezier(.2,.8,.2,1) both; }
.hq-body { padding: 36px 32px 8px; text-align: center; }
.hq-body .eyebrow { justify-content: center; }
.hq-title { font-size: 24px; margin: 8px 0 4px; color: var(--text); }
.hq-next { display: flex; align-items: center; gap: 12px; text-align: left; margin-top: 18px; padding: 14px 16px; background: var(--blush); border-radius: var(--radius-md); }
.hq-next-label { font-size: 12px; color: var(--text-muted); font-weight: 600; letter-spacing: .01em; }
.hq-next-text { font-size: 14.5px; font-weight: 600; color: var(--text); margin-top: 2px; line-height: 1.5; word-break: keep-all; }
.hq-foot { display: flex; justify-content: center; padding: 20px 32px 28px; }
.hq-foot .btn { min-width: 160px; }
@keyframes hq-in { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .hq-dialog { animation: none; } }

/* ── banner ── */
.hq-banner { display: flex; align-items: center; gap: 16px; padding: 18px 22px; }
.hq-banner-title { font-weight: 700; font-size: 16px; color: var(--text); }
.hq-chip { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 6px 12px; border-radius: 999px; background: var(--surface); border: 1px solid var(--brand-100); font-size: 13px; font-weight: 600; color: var(--accent); }
@media (max-width: 640px) { .hq-banner { flex-wrap: wrap; } .hq-chip { display: none; } }
</style>
