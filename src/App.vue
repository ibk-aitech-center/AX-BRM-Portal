<script setup lang="ts">
import { session } from './services/session';
import TopNav from './components/TopNav.vue';
import ToastStack from './components/ToastStack.vue';
import { redirectToPortal } from './services/ssoToken';

function retry() { window.location.reload(); }
function toPortal() { sessionStorage.removeItem('aiBrmSsoRedirectAt'); redirectToPortal({ force: true }); }
</script>

<template>
  <div class="app">
    <template v-if="session.phase === 'ready'">
      <TopNav v-if="!$route.meta.bare" />
      <main id="main" class="app-main">
        <router-view v-slot="{ Component }">
          <!-- 상담 화면은 첫 답변 뒤 /interview → /interview/:id 로 주소가 바뀐다. fullPath 를 키로 쓰면 그때 화면 전체가 다시 마운트돼
               스피너·등장 애니메이션·포커스 이동이 한 번 더 일어나 "깜빡임"으로 보였다 (2026-09-08). 상담은 이름으로 키를 고정하고, id 전환은 화면 안에서 처리한다 -->
          <component :is="Component" :key="$route.name === 'interview' ? 'interview' : $route.fullPath" />
        </router-view>
      </main>
    </template>

    <div v-else-if="session.phase === 'booting'" class="boot" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p class="text-sub mt-md">로그인 정보를 확인하고 있어요…</p>
    </div>

    <div v-else class="boot">
      <div class="card boot-card">
        <div class="empty-emoji" aria-hidden="true">{{ session.phase === 'loop' ? '🔁' : session.phase === 'expired' ? '🔒' : '☁️' }}</div>
        <h1 class="empty-title">{{ session.phase === 'loop' ? '포탈 로그인이 확인되지 않았어요' : session.phase === 'expired' ? '다시 로그인이 필요해요' : '잠시 연결이 어려워요' }}</h1>
        <p class="text-sub">
          <template v-if="session.phase === 'loop'">포탈에서 로그인 후 다시 돌아오지 못했어요. 포탈 로그인 상태를 확인하고 다시 시도해 주세요.</template>
          <template v-else>{{ session.errorMessage }}</template>
        </p>
        <!-- 만료·거절은 포탈로 자동 이동하지 않는다 — 사용자가 버튼을 눌러야 이동 -->
        <div class="row mt-lg" style="justify-content:center">
          <button v-if="session.phase !== 'expired'" class="btn btn-primary" @click="retry">다시 시도</button>
          <button class="btn" :class="session.phase === 'expired' ? 'btn-primary' : 'btn-secondary'" @click="toPortal">포탈로 이동</button>
        </div>
      </div>
    </div>

    <ToastStack />
  </div>
</template>

<style>
.app { min-height: 100vh; display: flex; flex-direction: column; }
.app-main { flex: 1; display: flex; flex-direction: column; }
.boot { min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
.boot-card { max-width: 440px; padding: 40px 32px; }
</style>
