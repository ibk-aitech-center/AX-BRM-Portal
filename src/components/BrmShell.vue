<script setup lang="ts">
import Icon3d from '@/components/Icon3d.vue';
import { isAdmin } from '@/services/session';
</script>

<template>
  <div class="shell">
    <aside class="side no-print" aria-label="AX-BRM 메뉴">
      <!-- 역할별로 묶어 보여 준다: AX-BRM 업무(brm 이상) / 시스템 관리(admin 전용) -->
      <div class="eyebrow mb-md">AX-BRM 업무</div>
      <nav class="side-nav" aria-label="AX-BRM 업무">
        <router-link to="/brm" class="side-link" :class="{ active: $route.name === 'inbox' || $route.name === 'review' }"><Icon3d name="inbox-mail" :size="20" /> 접수함</router-link>
        <router-link to="/brm/stats" class="side-link"><Icon3d name="analytics-dashboard" :size="20" /> 통계</router-link>
      </nav>
      <template v-if="isAdmin">
        <div class="eyebrow side-group mb-md">시스템 관리 <span class="badge side-role" data-tone="neutral">관리자</span></div>
        <nav class="side-nav" aria-label="시스템 관리">
          <router-link to="/brm/admin" class="side-link"><Icon3d name="employee-id" :size="20" /> 담당자 관리</router-link>
        </nav>
      </template>
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
.side-nav { display: flex; flex-direction: column; gap: 4px; }
.side-link { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-sm); color: var(--text-sub); font-weight: 600; font-size: 14px; }
.side-link:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
.side-link.router-link-exact-active, .side-link.active { background: var(--accent-soft); color: var(--accent); }
.side-group { display: flex; align-items: center; gap: 8px; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
.side-role { font-size: 10.5px; padding: 1px 7px; }
.side-foot { margin-top: auto; }
.content { padding: 28px 32px 64px; min-width: 0; }
@media (max-width: 1024px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); flex-direction: row; align-items: center; gap: 8px; padding: 10px 16px; }
  .side .eyebrow, .side-foot { display: none; }
  .side-nav { flex-direction: row; }
  /* 가로 배치에서는 구분선 대신 얇은 세로 선으로 그룹을 나눈다 */
  .side-group + .side-nav { margin-left: 8px; padding-left: 8px; border-left: 1px solid var(--line); }
  .content { padding: 20px 16px 48px; }
}
</style>
