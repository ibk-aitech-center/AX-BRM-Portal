/**
 * 목업 미리보기를 별도 브라우저 창으로 띄운다.
 * - 같은 출처의 /mockup/:id 라우트를 window.open 으로 여는 보조 창이라 sessionStorage(SSO 토큰)가 새 창에 복사돼 그대로 로그인 상태다
 *   (토큰을 URL 에 싣지 않는다). 창 안의 MockupView 가 열람 티켓을 받은 뒤 그 창의 토큰을 지우고 opener 를 끊고서
 *   목업 HTML 을 그 창의 최상위 문서로 연다 — sandbox iframe 이 아니라서 localStorage·모달·폼 등 목업이 온전히 동작한다 (2026-09-09).
 * - 첨부 id 로 창 이름을 고정해 같은 목업을 다시 누르면 새 창 대신 기존 창에 포커스만 준다.
 * - 팝업이 차단되면(브라우저 정책) null 이 돌아오므로 안내만 띄운다.
 */
import type { Attachment } from '@/types';
import { toast } from './toast';

export function openMockupWindow(a: Pick<Attachment, 'id'>) {
  const w = Math.min(1280, Math.max(720, window.screen.availWidth - 120));
  const h = Math.min(900, Math.max(600, window.screen.availHeight - 120));
  const win = window.open(`/mockup/${a.id}`, `aibrm-mockup-${a.id}`, `popup=yes,width=${w},height=${h},resizable=yes,scrollbars=yes`);
  if (!win) { toast('새 창이 차단됐어요. 주소창의 팝업 차단 안내에서 허용한 뒤 다시 눌러 주세요.', 'warning'); return; }
  win.focus();
}
