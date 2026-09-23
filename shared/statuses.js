// @ts-check
/** 요청 상태 — 클라이언트·서버 공용 */
// 컨셉 목업은 처리 절차(상태)가 아니다 — 필요할 때만 첨부로 등록한다 (2026-09-03 단계 폐지)

/** @typedef {'draft'|'submitted'|'reviewing'|'hold'|'accepted'|'guided'|'rejected'|'developing'|'done'} Status */

/** @type {Record<Status,{label:string,tone:'neutral'|'info'|'warning'|'success'|'danger'|'brand',desc:string,requesterDesc:string}>} */
export const STATUS = {
  draft: { label: '작성 중', tone: 'neutral', desc: '요청자가 인터뷰 작성 중', requesterDesc: '아직 신청 전이에요. 이어서 작성할 수 있어요.' },
  submitted: { label: '신청 완료', tone: 'info', desc: '접수됨 · 검토 대기', requesterDesc: '잘 신청됐어요. AX-BRM이 곧 검토를 시작해요.' },
  reviewing: { label: '검토 중', tone: 'info', desc: 'BRM 검토 진행', requesterDesc: 'AX-BRM이 내용을 살펴보고 있어요. 궁금한 점이 있으면 연락드릴 수 있어요.' },
  hold: { label: '보완 요청', tone: 'warning', desc: '보완 요청 통보 · 요청자가 보완하면 재검토 (공은 요청자에게)', requesterDesc: '몇 가지 확인이 더 필요해요. 아래 의견을 확인해 주세요.' },
  accepted: { label: '진행 확정', tone: 'success', desc: '과제 확정 · 착수 승인', requesterDesc: '진행이 확정됐어요! 다음 단계를 함께 준비해요.' },
  guided: { label: '행내 도구 안내로 종결', tone: 'success', desc: 'GENI·알대리 이용 안내 후 종료 (과거 건 표시용 — 새로 만들어지지 않음)', requesterDesc: '이미 있는 행내 도구로 해결할 수 있어요. 아래 안내를 확인해 주세요.' },
  rejected: { label: '협의 종결', tone: 'neutral', desc: '개발 없이 협의·안내로 마무리 (방향성 안내 등)', requesterDesc: '별도 개발 없이 협의로 마무리됐어요. 아래 안내 내용을 확인해 주세요.' },
  developing: { label: '개발 중', tone: 'brand', desc: '행외 개발 · 연계 협의 진행', requesterDesc: '함께 만들고 있어요.' },
  done: { label: '완료', tone: 'success', desc: '오픈 완료', requesterDesc: '완성됐어요! 수고 많으셨어요.' },
};

/** @type {Status[]} */
export const STATUS_ORDER = ['draft', 'submitted', 'reviewing', 'hold', 'accepted', 'guided', 'rejected', 'developing', 'done'];

/** BRM 검토 결정 → 상태
 *  "행내 도구 안내로 종결"(guide → guided) 결정은 2026-09-07 제거 — 기존 도구로 해결되는 건도 완료(done)로 처리하고
 *  종결 분류(배포 위치·완성 형태)로 남긴다. 상태 `guided` 정의는 이미 쌓인 건이 깨지지 않게 남겨 둔다(새로 만들어지지는 않음). */
export const DECISION = {
  accept: { label: '진행 확정 (착수 승인)', to: 'accepted' },
  hold: { label: '보완 요청', to: 'hold' },
  reject: { label: '협의 종결', to: 'rejected' },
  note: { label: '의견만 등록 (상태 유지)', to: null },
};

export const FEASIBLE = {
  yes: { label: '가능' },
  cond: { label: '조건부 가능' },
  no: { label: '불가' },
  tbd: { label: '검토 중' },
};

/** BRM이 직접 바꿀 수 있는 상태 전이 (검토 결정 외) */
export const MANUAL_TRANSITIONS = /** @type {Record<Status,Status[]>} */ ({
  draft: [],
  submitted: ['reviewing'],
  reviewing: [],
  hold: ['reviewing'],
  accepted: ['developing'],
  guided: ['reviewing'],
  rejected: ['reviewing'],
  developing: ['done', 'accepted'],
  done: ['developing'],
});

export const CHANNEL_LABEL = { ch1: '현장 의견·제안', plan: '부서 업무계획', exec: '경영진 지시', cop: 'CoP·붐업페스타 발굴' };
