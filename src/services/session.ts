import { reactive, computed } from 'vue';
import { api, ApiError } from './api';
import { getToken, discardToken, redirectToPortal, loopDetected, AUTH_REJECTED_EVENT } from './ssoToken';

export interface User {
  employeeNo: string; name: string; orgCd: string | null; orgNm: string | null; position: string | null;
  role: 'requester' | 'brm' | 'data_brm' | 'admin';
  /** 본부부서 직원만 상담을 요청할 수 있다 — 서버가 HR 미러의 조직속성코드로 판정. false 면 화면은 안내만 보여 준다 */
  canRequest: boolean;
}

/** 요청 자격이 없는 직원에게 보여 주는 안내 — 랜딩 모달·내 요청 화면이 같은 문구를 쓴다 */
export const HQ_ONLY_NOTICE = {
  title: '본부부서 대상 시스템이에요',
  lines: ['본부부서 업무 개선 상담을 위한 곳이라 영업점은 신청할 수 없어요.', '영업점 업무 개선 아이디어는 지식제안을 통해 진행해 주세요.'],
} as const;

type Phase = 'booting' | 'ready' | 'error' | 'loop' | 'expired';

export const session = reactive({
  phase: 'booting' as Phase,
  user: null as User | null,
  errorMessage: '',
});

export const isBrm = computed(() => session.user?.role === 'brm' || session.user?.role === 'admin');
export const isAdmin = computed(() => session.user?.role === 'admin');
/** DATA-BRM — 데이터 관련 요청 조회 전용. AX-BRM(isBrm) 과는 별개 역할 */
export const isDataBrm = computed(() => session.user?.role === 'data_brm');
/** 상담 요청 자격 — 본부부서 직원(서버 판정). 역할과 무관하게 admin·brm 도 같은 규칙 */
export const canRequest = computed(() => session.user?.canRequest === true);

/** 세션 판정이 끝났을 때(ready·error·loop·expired 어느 쪽이든) resolve — 라우터 가드가 부팅 중 직접 진입한 주소를 판정 뒤에 심사하려고 기다린다 */
let settle: () => void = () => {};
export const sessionSettled: Promise<void> = new Promise((r) => { settle = r; });

/** SSO 로그인 — 토큰 검증은 서버가 한다. 클라이언트는 결과만 받는다. */
export async function bootstrapSession(): Promise<void> {
  try {
    if (loopDetected()) { session.phase = 'loop'; return; }
    const token = getToken();
    if (!token) { redirectToPortal(); return; }
    const { user } = await api.post<{ user: User }>('/api/auth/sso', { token });
    session.user = user;
    session.phase = 'ready';
  } catch (e) {
    if (e instanceof ApiError && !e.isNetworkError && (e.status === 401 || e.status === 400)) {
      // 서버가 토큰을 거절 → 폐기(api.ts 가 이미 했다)만 하고 **포탈로 자동 이동하지 않는다**.
      // 토큰을 들고 왔는데 되돌려 보내면 포탈 ↔ 앱 루프가 되므로, 안내 화면에서 사용자가 "포탈로 이동"을 눌러 다시 로그인한다.
      discardToken();
      session.phase = 'expired'; session.errorMessage = '로그인 확인에 실패했어요. 포탈에서 다시 로그인해 주세요.';
      return;
    }
    // 네트워크·5xx: 토큰은 살려둔다 — 서버가 잠깐 느린 것으로 멀쩡한 토큰을 버리지 않는다
    session.phase = 'error';
    session.errorMessage = e instanceof ApiError && e.isNetworkError
      ? '서버에 연결하지 못했어요. 잠시 후 새로 고쳐 주세요.'
      : '서버가 잠시 아파요. 잠시 후 새로 고쳐 주세요.';
  } finally {
    settle();
  }
}

export function logout(): void {
  discardToken();
  session.user = null;
  redirectToPortal({ force: true });
}

// 앱 사용 중 서버가 토큰을 거절(만료 등)하면 api.ts 가 폐기하고 이 이벤트를 올린다 → 자동 이동 대신 안내 화면
if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_REJECTED_EVENT, () => {
    if (session.phase === 'expired') return;
    session.user = null;
    session.phase = 'expired';
    session.errorMessage = '로그인이 만료됐어요. 포탈에서 다시 로그인해 주세요.';
  });
}
