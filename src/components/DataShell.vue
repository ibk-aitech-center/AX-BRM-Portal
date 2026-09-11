<script setup lang="ts">
/**
 * DATA-BRM 조회 화면의 틀 — BrmShell 과 같은 좌측 메뉴 배치지만 메뉴는 "데이터 요청" 하나.
 * 조회 전용이라는 것을 머리에 배지로 못박는다 (의견·상태·목업·대화는 AX-BRM 이 등록).
 */
import Icon3d from '@/components/Icon3d.vue';
</script>

<template>
  <div class="shell">
    <aside class="side no-print" aria-label="DATA-BRM 메뉴">
      <div class="eyebrow mb-md">데이터 협의 <span class="badge side-role" data-tone="neutral">조회 전용</span></div>
      <nav class="side-nav" aria-label="데이터 협의">
        <router-link to="/data" class="side-link" :class="{ active: $route.name === 'data-inbox' || $route.name === 'data-review' }"><Icon3d name="document-analytics" :size="20" /> 데이터 요청</router-link>
      </nav>
      <div class="side-foot">
        <a href="/flow.html" target="_blank" rel="noopener" class="side-link"><Icon3d name="team-hierarchy" :size="20" /> 상담 흐름도</a>
      </div>
    </aside>
    <section class="content"><slot /></section>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); flex: 1; min-height: calc(100vh - 60px); }
.side { border-right: 1px solid var(--line); padding: 24px 16px; background: var(--surface); position: sticky; top: 60px; height: calc(100vh - 60px); display: flex; flex-direction: column; }
.side .eyebrow { display: flex; align-items: center; gap: 8px; }
.side-role { font-size: 10.5px; padding: 1px 7px; }
.side-nav { display: flex; flex-direction: column; gap: 4px; }
.side-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-sm); color: var(--text-sub); font-weight: 600; font-size: 14px; }
.side-link:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
.side-link.router-link-exact-active, .side-link.active { background: var(--accent-soft); color: var(--accent); }
.side-foot { margin-top: auto; }
.content { padding: 28px 32px 64px; min-width: 0; }
@media (max-width: 1024px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); flex-direction: row; align-items: center; gap: 8px; padding: 10px 16px; }
  .side .eyebrow, .side-foot { display: none; }
  .side-nav { flex-direction: row; }
  .content { padding: 20px 16px 48px; }
}
</style>
