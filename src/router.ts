import { createRouter, createWebHistory } from 'vue-router';
import { session, sessionSettled, isBrm, isAdmin, isDataBrm, canRequest } from './services/session';
import { flushDeletes } from './services/pendingDelete';

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, _from, saved) => saved || (to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 }),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { title: 'AX-BRM 포탈' } },
    { path: '/interview/:id?', name: 'interview', component: () => import('./views/InterviewView.vue'), meta: { title: '상담 인터뷰', request: true } },
    { path: '/summary/:id', name: 'summary', component: () => import('./views/SummaryView.vue'), meta: { title: '정리된 요청 확인', request: true } },
    { path: '/done/:id', name: 'done', component: () => import('./views/DoneView.vue'), meta: { title: '신청 완료', request: true } },
    { path: '/requests', name: 'requests', component: () => import('./views/MyRequestsView.vue'), meta: { title: '내 요청' } },
    { path: '/requests/:id', name: 'request', component: () => import('./views/RequestDetailView.vue'), meta: { title: '요청 상세' } },
    // 목업 미리보기 — 별도 창(window.open)으로 열리는 페이지. bare: TopNav 없이 목업만 채운다
    { path: '/mockup/:attachmentId', name: 'mockup', component: () => import('./views/MockupView.vue'), meta: { title: '목업 미리보기', bare: true } },
    { path: '/brm', name: 'inbox', component: () => import('./views/brm/InboxView.vue'), meta: { title: '접수함', brm: true } },
    { path: '/brm/requests/:id', name: 'review', component: () => import('./views/brm/ReviewView.vue'), meta: { title: '요청 검토', brm: true } },
    { path: '/brm/stats', name: 'stats', component: () => import('./views/brm/StatsView.vue'), meta: { title: '통계', brm: true } },
    // DATA-BRM 조회 전용 — 행내 데이터가 필요한(모르겠다는) 요청만. 관리자도 확인용으로 들어갈 수 있다
    { path: '/data', name: 'data-inbox', component: () => import('./views/data/DataInboxView.vue'), meta: { title: '데이터 요청', data: true } },
    { path: '/data/requests/:id', name: 'data-review', component: () => import('./views/data/DataReviewView.vue'), meta: { title: '데이터 요청 상세', data: true } },
    { path: '/brm/admin', name: 'admin', component: () => import('./views/brm/AdminView.vue'), meta: { title: '담당자 관리', brm: true, admin: true } },
    { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFoundView.vue'), meta: { title: '페이지를 찾을 수 없어요' } },
  ],
});

router.beforeEach(async (to) => {
  flushDeletes(); // "실행 취소" 대기 중인 삭제는 화면을 떠나는 순간 바로 보낸다 — 다음 화면이 지운 초안을 다시 보여 주지 않도록
  // 부팅 중 직접 진입(새로 고침·주소 입력)은 세션 판정이 끝난 뒤 심사한다 — 아래 역할·자격 가드가 phase 'ready' 에서만 도는 이유
  if (session.phase === 'booting') await sessionSettled;
  // 상담 작성 화면(request)은 본부부서 직원만 — 주소를 직접 쳐도 홈으로. 홈이 안내 모달을 띄운다 (서버도 쓰기 API 를 HQ_ONLY 로 막는다)
  if (to.meta.request && session.phase === 'ready' && !canRequest.value) return { name: 'home', query: { notice: 'hq' } };
  if (to.meta.brm && session.phase === 'ready' && !isBrm.value) return { name: 'home' };
  if (to.meta.admin && session.phase === 'ready' && !isAdmin.value) return { name: 'inbox' }; // 시스템 관리자만
  if (to.meta.data && session.phase === 'ready' && !isDataBrm.value && !isAdmin.value) return { name: 'home' }; // DATA-BRM(+관리자 확인용)
  return true;
});
router.afterEach((to) => {
  const SERVICE = 'AX-BRM 포탈';
  document.title = to.meta.title && to.meta.title !== SERVICE ? `${to.meta.title} · ${SERVICE}` : SERVICE;
});
