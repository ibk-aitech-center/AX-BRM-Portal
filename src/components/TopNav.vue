<script setup lang="ts">
import { session, isBrm, isAdmin, isDataBrm, isGroupPlanner, logout } from '@/services/session';
import mark from '@/assets/brand/ai-brm-portal-mark.png';
/** 로그아웃 버튼은 로컬(목업 로그인 popup.html)에서만 — 목업 직원을 바꿔 가며 볼 때 쓴다. 개발계·운영계는 AI 포탈 SSO 로만 들어오므로 없다.
 *  빌드 모드(import.meta.env.DEV)로 가르면 .env 의 NODE_ENV 에 따라 운영 빌드에도 true 가 들어갈 수 있어(2026-09-08 운영에서 노출됨),
 *  SSO 리디렉트와 같은 기준인 접속 호스트로 판단한다 (ssoToken.ts · index.html 과 동일 규칙) */
const showLogout = typeof window !== 'undefined' && /^(localhost|127[.]0[.]0[.]1)$/.test(window.location.hostname);
</script>

<template>
  <header class="nav no-print">
    <div class="container nav-inner">
      <router-link to="/" class="brand" aria-label="AX-BRM 포탈 홈">
        <!-- 서비스 로고 마크 — src/assets/brand 의 가로형 로고에서 원형 마크만 잘라낸 것(191px 원본, 28px 표시) -->
        <img :src="mark" class="brand-mark" alt="" width="28" height="28" decoding="async" />
        <span class="brand-name">AX-BRM <span class="brand-sub">포탈</span></span>
      </router-link>

      <nav class="nav-links" aria-label="주요 메뉴">
        <router-link to="/requests" class="nav-link">내 요청</router-link>
        <template v-if="isBrm">
          <span class="nav-sep" aria-hidden="true"></span>
          <router-link to="/brm" class="nav-link nav-link-brm">접수함</router-link>
          <router-link to="/brm/stats" class="nav-link nav-link-brm">통계</router-link>
          <router-link v-if="isAdmin" to="/brm/admin" class="nav-link nav-link-brm">담당자 관리</router-link>
        </template>
        <!-- DATA-BRM 메뉴 — 데이터가 필요한 요청만 조회. 관리자도 확인용으로 본다 -->
        <template v-if="isDataBrm || isAdmin">
          <span class="nav-sep" aria-hidden="true"></span>
          <router-link to="/data" class="nav-link nav-link-brm">데이터 요청</router-link>
        </template>
        <!-- 그룹기획 메뉴 — 신청된 모든 건의 접수현황을 조회만. 관리자도 확인용으로 본다 -->
        <template v-if="isGroupPlanner || isAdmin">
          <span class="nav-sep" aria-hidden="true"></span>
          <router-link to="/status" class="nav-link nav-link-brm">접수현황 조회</router-link>
        </template>
      </nav>

      <div class="nav-user">
        <span class="nav-name"><b>{{ session.user?.name }}</b><span class="text-muted text-sm"> · {{ session.user?.orgNm || '소속 미확인' }}</span></span>
        <span v-if="isBrm" class="badge" data-tone="brand">{{ isAdmin ? 'AX-BRM · 관리자' : 'AX-BRM' }}</span>
        <span v-else-if="isDataBrm" class="badge" data-tone="brand">DATA-BRM · 조회</span>
        <span v-else-if="isGroupPlanner" class="badge" data-tone="brand">그룹기획 · 조회</span>
        <button v-if="showLogout" class="btn btn-ghost btn-sm" @click="logout" aria-label="로그아웃">로그아웃</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav { position: sticky; top: 0; z-index: var(--z-nav); background: rgba(244,248,247,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
.nav-inner { display: flex; align-items: center; gap: 24px; min-height: 60px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 700; font-size: 16px; }
.brand:hover { text-decoration: none; }
.brand-mark { width: 28px; height: 28px; display: block; flex: none; }
.brand-sub { font-weight: 500; color: var(--text-sub); }
.nav-links { display: flex; align-items: center; gap: 4px; flex: 1; }
.nav-link { padding: 8px 12px; border-radius: var(--radius-full); color: var(--text-sub); font-weight: 600; font-size: 14px; }
.nav-link:hover { background: var(--surface-2); text-decoration: none; color: var(--text); }
.nav-link.router-link-active { color: var(--accent); background: var(--accent-soft); }
.nav-sep { width: 1px; height: 18px; background: var(--line-strong); margin: 0 6px; }
.nav-user { display: flex; align-items: center; gap: 10px; font-size: 14px; }
@media (max-width: 768px) {
  .nav-name { display: none; }
  .brand-sub { display: none; }
}
</style>
