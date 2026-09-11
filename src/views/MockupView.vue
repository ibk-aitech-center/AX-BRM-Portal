<script setup lang="ts">
/**
 * 목업 미리보기 창 — 부트스트랩 페이지 (2026-09-09: sandbox iframe → 목업 HTML 을 이 창의 최상위 문서로 온전히 띄운다).
 *  1. window.open 으로 열린 이 창은 sessionStorage(SSO 토큰)가 복사돼 로그인 상태다 → Bearer 로 10분짜리 열람 티켓을 받는다
 *  2. 목업 문서로 넘어가기 전에 **이 창의 토큰을 지우고 opener 를 끊는다** — 목업 스크립트가 세션·부모 창에 닿지 못하게
 *  3. location.replace 로 목업 문서(/api/attachments/:id/view?t=…)를 연다 — 뒤로 가기로 이 부트스트랩에 되돌아오지 않는다
 * 주소를 직접 열어도 권한 검사는 서버가 티켓의 사번으로 다시 한다.
 */
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, humanMessage } from '@/services/api';
import { discardToken } from '@/services/ssoToken';

const route = useRoute();
const id = String(route.params.attachmentId);
const error = ref('');

onMounted(async () => {
  try {
    const { url, fileName } = await api.post<{ url: string; fileName: string }>(`/api/attachments/${id}/view-ticket`, {});
    document.title = `${fileName} · 목업 미리보기`;
    discardToken();                       // 이 창(탭)의 sessionStorage 사본에서만 지워진다 — 원래 창의 로그인은 그대로
    try { window.opener = null; } catch { /* 일부 브라우저 */ }
    window.location.replace(url);
  } catch (e) { error.value = humanMessage(e); }
});
const canClose = !!window.opener;
function close() { window.close(); }
</script>

<template>
  <div class="mk">
    <div v-if="error" class="empty" style="padding:48px">
      <div class="empty-emoji" aria-hidden="true">☁️</div>
      <div class="empty-title">{{ error }}</div>
      <button v-if="canClose" class="btn btn-primary mt-md" @click="close">닫기</button>
    </div>
    <div v-else class="mk-state" role="status"><div class="spinner" aria-hidden="true"></div><span>목업을 여는 중이에요…</span></div>
  </div>
</template>

<style scoped>
.mk { flex: 1; display: flex; flex-direction: column; min-height: 100vh; background: var(--surface); }
.mk-state { flex: 1; display: flex; gap: 10px; align-items: center; justify-content: center; color: var(--text-sub); }
</style>
