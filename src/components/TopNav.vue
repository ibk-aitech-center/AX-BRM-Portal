<script setup lang="ts">
import { session, isBrm, isAdmin, isDataBrm, isGroupPlanner, logout } from '@/services/session';
import mark from '@/assets/brand/ai-brm-portal-mark.png';
import { unread } from '@/services/unread';
import { router } from '@/router';
// 미읽음 배지 — 신규(한 번도 안 연) 건수만. 화면을 옮길 때마다 새로 센다 (services/unread.ts)
router.afterEach(() => { unread.refresh(); });
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
          <router-link to="/brm" class="nav-link nav-link-brm">접수함<span v-if="unread.counts.all" class="badge nav-unread" data-tone="danger" :title="`새로 접수 ${unread.counts.all}건`">{{ unread.counts.all }}</span></router-link>
          <router-link to="/brm/stats" class="nav-link nav-link-brm">통계</router-link>
          <router-link v-if="isAdmin" to="/brm/admin" class="nav-link nav-link-brm">담당자 관리</router-link>
        </template>
        <!-- DATA-BRM 메뉴 — 데이터가 필요한 요청만 조회. 관리자도 확인용으로 본다 -->
        <template v-if="isDataBrm || isAdmin">
          <span class="nav-sep" aria-hidden="true"></span>
          <router-link to="/data" class="nav-link nav-link-brm">데이터 요청<span v-if="unread.counts.data" class="badge nav-unread" data-tone="danger" :title="`새로 접수 ${unread.counts.data}건`">{{ unread.counts.data }}</span></router-link>
        </template>
        <!-- 그룹기획 메뉴 — 신청된 모든 건의 접수현황을 조회만. 관리자도 확인용으로 본다 -->
        <template v-if="isGroupPlanner || isAdmin">
          <span class="nav-sep" aria-hidden="true"></span>
          <router-link to="/status" class="nav-link nav-link-brm">접수현황 조회<span v-if="unread.counts.status" class="badge nav-unread" data-tone="danger" :title="`새로 접수 ${unread.counts.status}건`">{{ unread.counts.status }}</span></router-link>
        </template>
      </nav>

      <div class="nav-user">
        <span class="nav-name"><b>{{ session.user?.name }}</b><span class="text-muted text-sm"> · {{ session.user?.orgNm || '소속 미확인' }}</span></span>
        <span v-if="isBrm" class="badge nav-role" data-tone="brand">{{ isAdmin ? 'AX-BRM · 관리자' : 'AX-BRM' }}</span>
        <span v-else-if="isDataBrm" class="badge nav-role" data-tone="brand">DATA-BRM · 조회</span>
        <span v-else-if="isGroupPlanner" class="badge nav-role" data-tone="brand">그룹기획 · 조회</span>
        <button v-if="showLogout" class="btn btn-ghost btn-sm" @click="logout" aria-label="로그아웃">로그아웃</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav { position: sticky; top: 0; z-index: var(--z-nav); background: rgba(244,248,247,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
/* 한 줄 고정 — 메뉴·배지·사용자 영역 어느 것도 줄바꿈하지 않는다. 폭이 모자라면 메뉴 영역만 가로 스크롤(스크롤바 숨김) */
.nav-inner { display: flex; align-items: center; gap: 16px; min-height: 60px; flex-wrap: nowrap; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 700; font-size: 16px; white-space: nowrap; flex: none; }
.brand:hover { text-decoration: none; }
.brand-mark { width: 28px; height: 28px; display: block; flex: none; }
.brand-sub { font-weight: 500; color: var(--text-sub); }
.nav-links { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.nav-links::-webkit-scrollbar { display: none; }
.nav-link { display: inline-flex; align-items: center; padding: 8px 12px; border-radius: var(--radius-full); color: var(--text-sub); font-weight: 600; font-size: 14px; white-space: nowrap; flex: none; }
.nav-link:hover { background: var(--surface-2); text-decoration: none; color: var(--text); }
.nav-link.router-link-active { color: var(--accent); background: var(--accent-soft); }
/* 미읽음(신규) 건수 — 링크 높이를 바꾸지 않는 18px 알약. 글자·패딩을 고정해 세 자리까지 한 줄 */
.nav-unread { margin-left: 6px; height: 18px; min-width: 18px; padding: 0 6px; font-size: 11px; line-height: 1; justify-content: center; }
.nav-sep { width: 1px; height: 18px; background: var(--line-strong); margin: 0 6px; flex: none; }
.nav-user { display: flex; align-items: center; gap: 10px; font-size: 14px; flex: none; white-space: nowrap; }
/* 폭이 좁아지면 사용자 소속 → 역할 알약 → 이름 → 로고 부제 순으로 접는다. 메뉴(관리자는 7개 + 배지 3개)는 끝까지 한 줄 */
@media (max-width: 1100px) { .nav-name .text-muted { display: none; } .nav-role { display: none; } .nav-link { padding: 8px 10px; } }
@media (max-width: 900px) {
  .nav-name { display: none; }
  .brand-sub { display: none; }
}
</style>
