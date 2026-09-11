// @ts-check
/**
 * 인터뷰 질문 트리 — 클라이언트·서버 공용.
 *
 * 설계 원칙 (PLAN.md §3)
 *  - 요청자는 로드맵 용어를 보지 않는다. 모든 대사는 그대로 소리 내어 읽어도 되는 말이다.
 *  - 선택형은 클릭 즉시 진행, 주관식은 Enter/버튼으로 진행 (blur 진행 금지).
 *  - "잘 모르겠어요"는 항상 허용되고 BRM 확인 항목으로 플래그된다.
 *  - 질문이 바뀌면 VERSION 을 올린다. 요청 레코드는 답변 당시 버전을 함께 저장한다.
 */

export const QUESTIONNAIRE_VERSION = '2026.09.15'; // 2026-09-11: q20 바이브 코딩 질문 교체(can/learn)

/** @typedef {'text'|'textarea'|'single'} QuestionType */

/**
 * @typedef {Object} Option
 * @property {string} value
 * @property {string} label       화면에 보이는 답
 * @property {string} [hint]      한 줄 비유·설명
 * @property {boolean} [unknown]  "잘 모르겠어요" 계열 — BRM 확인 플래그
 */

/**
 * @typedef {Object} Question
 * @property {string} id
 * @property {'A'|'B'|'C'|'D'|'E'} section
 * @property {QuestionType} type
 * @property {string} ask          묻는 말
 * @property {string} [sub]        보조 설명 (한 줄)
 * @property {string} [placeholder]
 * @property {Option[]} [options]
 * @property {boolean} [optional]
 * @property {string} [tip]        코칭 팁 (말풍선) - 완료 행 아래에 누적
 * @property {string} [why]        왜 묻나요 (i 버튼)
 * @property {(a: Record<string,string>) => boolean} [showIf]
 * @property {(v: string) => string} [summarize]  완료 행 요약 포맷
 */

export const SECTIONS = /** @type {const} */ ([
  { key: 'A', title: '어떤 일인가요', short: '업무' },
  { key: 'B', title: '어떤 도움이 맞을까요', short: '도움' },
  { key: 'C', title: '데이터가 필요한가요', short: '데이터' },
  { key: 'D', title: '어디에서 돌아가나요', short: '환경' },
  { key: 'E', title: '마무리', short: '마무리' },
]);

const UNKNOWN = { value: 'unknown', label: '잘 모르겠어요', hint: 'AX-BRM이 검토할 때 함께 확인해 드려요', unknown: true };

const isDevTrack = (/** @type {Record<string,string>} */ a) => a.q7_kind === 'dev' || a.q7_kind === 'rpa' || a.q7_kind === 'consult';
const needsData = (/** @type {Record<string,string>} */ a) => isDevTrack(a) && (a.q9_data === 'yes' || a.q9_data === 'unknown');

/** @type {Question[]} */
export const QUESTIONS = [
  // ── A. 어떤 일인가요 ──────────────────────────────────────────
  {
    id: 'q1_title', section: 'A', type: 'text',
    ask: '하고 싶은 일을 한 문장으로 적어주세요.',
    sub: '옆 팀 동료에게 설명하듯 편하게요. 나중에 고칠 수 있어요.',
    placeholder: '예) 매일 아침 지점별 실적을 엑셀로 합치는 일을 자동으로 하고 싶어요',
    why: '이 문장이 요청서의 제목이 돼요. 완벽하지 않아도 괜찮아요.',
  },
  {
    id: 'q3_current', section: 'A', type: 'textarea',
    ask: '지금은 이 일을 어떻게 하고 계세요?',
    sub: '쓰는 시스템 이름, 엑셀, 수작업 순서 등 떠오르는 대로 적어주세요.',
    placeholder: '예) 매일 9시에 A시스템에서 조회 → 엑셀에 붙여넣기 → 지점별로 정리해서 팀장님께 메일',
    tip: '"지금 하는 방식"이 자세할수록 AX-BRM이 어떤 도움을 드릴 수 있을지 빨리 파악할 수 있어요.',
  },
  {
    id: 'q4_time', section: 'A', type: 'text',
    ask: '지금 이 일을 한 건 처리하는데 시간이 얼마나 걸리나요?',
    sub: '대략이면 충분해요. 나중에 "얼마나 좋아졌는지" 비교하는 기준이 돼요.',
    placeholder: '예) 1건에 30분, 주 3시간, 월말마다 하루',
    why: '지금 걸리는 시간을 적어두면 완성 뒤 "30분 → 30초"처럼 효과를 증명할 수 있어요.',
  },
  {
    id: 'q5_users', section: 'A', type: 'single',
    ask: '완성되면 누가 쓰나요?',
    options: [
      { value: 'me', label: '나 혼자', hint: '개인 도구도 환영이에요. 같은 고민을 하는 분이 더 있을 수도 있어요' },
      { value: 'dept', label: '우리 부서', hint: '부서 단위 업무 도구' },
      { value: 'hq', label: '본부부서', hint: '여러 본부 부서가 함께 쓰는 도구' },
      { value: 'branch', label: '영업점', hint: '영업점 직원들이 쓰는 도구' },
      { value: 'all', label: '전직원', hint: '전행 서비스 — 운영 체계를 함께 고민해요' },
    ],
  },
  {
    id: 'q6_freq', section: 'A', type: 'single',
    ask: '이 일은 일 년에 몇 건이나 발생하나요?',
    options: [
      { value: 'daily', label: '매일 수시로', hint: '하루에도 몇 번씩 빈번하게 발생' },
      { value: 'weekly', label: '주에 몇 번', hint: '주간 보고·주간 점검 등' },
      { value: 'monthly', label: '월에 몇 번', hint: '월말·마감 업무 등' },
      { value: 'quarterly', label: '분기·반기 작업', hint: '분기 결산·반기 보고 등 연 2~4회' },
      { value: 'yearly', label: '연간 작업', hint: '연말 결산·연 1회 점검 등' },
    ],
  },

  // ── B. 어떤 도움이 맞을까요 ───────────────────────────────────
  {
    id: 'q7_kind', section: 'B', type: 'single',
    ask: '원하는 결과가 다음 중 어디에 가까운가요?',
    sub: '가장 비슷한 것 하나만 고르세요. 애매하면 마지막 항목을 고르셔도 돼요.',
    options: [
      { value: 'geni', label: '글을 요약하거나 초안을 쓰거나, 문서에서 답을 찾고 싶어요', hint: '기성복 — 행내 생성형 AI(GENI)로 바로 도울 수 있어요. 규정을 다 읽은 비서에게 물어보는 느낌' },
      { value: 'rpa', label: '반복되는 클릭·입력·서류 읽기를 자동으로 하고 싶어요', hint: '맞춤복 — 반복 업무를 자동화하는 프로그램을 함께 만들어요' },
      { value: 'dev', label: '화면이 있는 새 프로그램(조회·계산·관리 도구)이 필요해요', hint: '맞춤복 — 치수를 재고 만드니 시간이 좀 걸리지만 딱 맞아요' },
      { value: 'consult', label: '잘 모르겠어요, 상담받고 싶어요', hint: '고민만 있어도 충분해요. 나머지는 함께 정리해요', unknown: true },
    ],
    why: '이미 있는 도구로 되는 일(기성복)은 이번 주 안에 안내드릴 수 있고, 새로 만들어야 하는 일(맞춤복)은 몇 가지를 더 여쭤봐요.',
  },
  {
    id: 'q8_tried', section: 'B', type: 'single',
    ask: '지금 쓸 수 있는 행내 AI 도구(Geni 특화서비스 등)를 써본 적 있나요?',
    showIf: (a) => a.q7_kind === 'geni',
    options: [
      { value: 'yes_ok', label: '써봤는데 원하는 만큼 안 됐어요', hint: '어디서 막혔는지 함께 볼게요' },
      { value: 'yes_no', label: '써봤고 잘 되는데, 더 잘 쓰고 싶어요', hint: '활용 코칭이 맞을 수 있어요' },
      { value: 'no', label: '아직 안 써봤어요', hint: '사용법 안내부터 시작할게요' },
    ],
  },

  // ── C. 데이터가 필요한가요 (맞춤복 갈래) ───────────────────────
  //   순서: 필요 여부 → 갱신 주기(시나리오 3·4 분기) → 양(연결 방식) → 외부 개발 시 실제 값 필요 여부 → 개인정보(심의) → 출처(참고)
  {
    id: 'q9_data', section: 'C', type: 'single',
    ask: '이 프로그램이 동작하려면 행내 데이터(고객·거래·계좌 등)가 필요한가요?',
    showIf: isDevTrack,
    options: [
      { value: 'no', label: '아니요, 사용자가 입력한 값만으로 결과가 나와요', hint: '계산기처럼 — 데이터 협의가 없어 가장 빨라요' },
      { value: 'yes', label: '네, 행내 데이터를 읽어야 해요', hint: '어떤 데이터가 얼마나 필요한지 조금 더 여쭤볼게요' },
      UNKNOWN,
    ],
    why: '데이터가 필요한지에 따라 준비 기간이 몇 주씩 달라져요.',
  },
  {
    // "실시간이냐" 와 "한 번만이냐 계속이냐" 를 한 질문으로 — 둘 다 갱신 주기라는 같은 축이라 따로 물으면 되묻는 느낌이 났다.
    // once 는 판정에서 batch 와 같은 갈래(시나리오 4)이고, 대용량일 때만 일괄 적재(bulk) 로 갈린다 (rules.js).
    id: 'q13_online', section: 'C', type: 'single',
    ask: '데이터가 얼마나 자주 새로워져야 하나요?',
    showIf: needsData,
    options: [
      { value: 'online', label: '화면을 열 때마다 최신이어야 해요 (실시간)', hint: '예) 고객 응대 중 바로 조회 — 실시간 연결이 필요해요' },
      { value: 'batch', label: '하루 한 번(또는 정기적으로) 갱신되면 충분해요', hint: '조간 신문처럼 — 준비 기간이 절반으로 줄어요' },
      { value: 'once', label: '한 번만 받으면 돼요', hint: '초기 분석·정리처럼 일괄로 한 번 받는 경우' },
      UNKNOWN,
    ],
    why: '"실시간이냐, 정기 갱신이냐, 한 번이냐"가 데이터 연결 방식과 기간을 가장 크게 좌우해요.',
  },
  {
    id: 'q14_volume', section: 'C', type: 'single',
    ask: '다루는 데이터 양은 어느 정도인가요?',
    showIf: needsData,
    options: [
      { value: 'small', label: '1만 건 이하', hint: '파일로 받는 방식(택배)이 맞아요' },
      { value: 'large', label: '10만 건 이하', hint: '전용 통로(배관)를 놓는 방식이 맞아요' },
      { value: 'huge', label: '그 이상', hint: '' },
      UNKNOWN,
    ],
  },
  {
    id: 'q10_realvalue', section: 'C', type: 'single',
    ask: '외부에서 만들 때 실제 값이 필요한가요?',
    sub: '은행 밖에서 먼저 만들기 때문에, 만드는 동안 실제 값이 밖으로 나가야 하는지가 중요해요.',
    showIf: needsData,
    options: [
      { value: 'shape', label: '데이터의 모양(항목·형식)만 같으면 돼요', hint: '모델하우스처럼 — 가구 배치는 진짜, 안의 물건은 가짜여도 됨. 표준 경로예요' },
      { value: 'real', label: '실제 값의 분포나 특이한 사례가 있어야만 해요', hint: '얼굴을 가린 실제 사진 — 반출 심사(+3~5주)를 거쳐야 하고 승인이 안 될 수도 있어요' },
      UNKNOWN,
    ],
    tip: '대부분의 과제는 "모양만 같으면" 충분해요. 실제 값이 꼭 필요하다고 느껴져도 AX-BRM과 먼저 이야기해 보세요.',
  },
  {
    id: 'q11_pii', section: 'C', type: 'single',
    ask: '완성된 뒤 다루게 될 데이터에 개인정보가 들어가나요?',
    sub: '고객 이름·주민번호·계좌번호처럼 누군지 알 수 있는 정보요. 만드는 동안은 가짜 값을 쓰더라도, 완성 후 실제 데이터에 있으면 해당돼요.',
    showIf: needsData,
    options: [
      { value: 'no', label: '아니요', hint: '집계·코드값·통계처럼 사람을 특정할 수 없는 데이터' },
      { value: 'yes', label: '네', hint: '어떤 경로든 가명처리와 이용 근거 심의(+2~4주)가 필요해요' },
      UNKNOWN,
    ],
  },
  {
    id: 'q12_source', section: 'C', type: 'text', optional: true,
    ask: '데이터가 어떤 시스템에 있는지 아시나요?',
    sub: '시스템 이름이나 담당 부서. 모르면 비워두고 넘어가세요.',
    showIf: needsData,
    placeholder: '예) 여신시스템, 실적 조회 시스템, ○○부에서 매월 받는 엑셀',
  },

  // ── D. 어디에서 돌아가나요 ───────────────────────────────────
  {
    id: 'q16_embed', section: 'D', type: 'single',
    ask: '기존 행내 시스템(통합단말·기존 시스템 등) 안에 끼워 넣어야 하나요?',
    showIf: isDevTrack,
    options: [
      { value: 'standalone', label: '아니요, 따로 열어 쓰는 웹 화면이면 돼요', hint: '이 서비스를 어디에 올리면 좋을지 AX-BRM과 상담을 진행하며 정해봐요' },
      { value: 'embed', label: '네, 기존 시스템 안에서 동작해야 해요', hint: '해당 시스템 담당자(또는 IT BRM)와 개발 기간 및 가능여부 협의가 반드시 필요해요' },
      UNKNOWN,
    ],
  },
  {
    id: 'q24_ownsys', section: 'D', type: 'single',
    ask: '부서에서 운영중인 자체 시스템이 있나요?',
    options: [
      { value: 'yes', label: '네', hint: '' },
      { value: 'no', label: '아니오', hint: '' },
    ],
    why: '자체 시스템이 있으면 연계·확장 방안을 협의 때 함께 검토해요.',
  },
  {
    id: 'q25_itstaff', section: 'D', type: 'single',
    ask: '부서에 소속된 IT 담당직원(SM인력 포함)이 있나요?',
    options: [
      { value: 'yes', label: '네', hint: '' },
      { value: 'no', label: '아니오', hint: '' },
    ],
    why: '함께 협의할 IT 담당이 있는지에 따라 진행 방식을 맞춰드려요.',
  },

  // ── E. 마무리 ───────────────────────────────────────────────
  {
    id: 'q18_owner', section: 'E', type: 'single',
    ask: '이 요청의 실무 담당은 본인이신가요?',
    options: [
      { value: 'me', label: '네, 제가 담당이에요', hint: '' },
      { value: 'other', label: '아니요, 다른 담당자가 있어요', hint: '누구인지 이어서 여쭤볼게요' },
    ],
  },
  {
    id: 'q18_owner_name', section: 'E', type: 'text',
    ask: '실무를 맡을 담당자는 누구인가요?',
    sub: '협의 연락을 드릴 수 있게 소속과 이름을 적어주세요.',
    placeholder: '예) 개인고객부 김담당 (내선 1234)',
    showIf: (a) => a.q18_owner === 'other',
  },
  {
    id: 'q19_manager', section: 'E', type: 'single',
    ask: '부서장님도 이 요청을 알고 계신가요?',
    sub: '신청시 별도 결재는 필요 없지만, 진행이 확정되기 전까지는 부서장 보고를 진행해주셔야 해요.',
    options: [
      { value: 'yes', label: '네, 알고 계시고 동의하셨어요', hint: '' },
      { value: 'no', label: '아직 말씀 전이에요', hint: '진행하시기 전에 부서 내부에서 의사결정을 받아주시면 더 좋습니다' },
    ],
  },
  {
    id: 'q2_channel', section: 'E', type: 'single',
    ask: '이 요청은 어떻게 시작됐나요?',
    sub: '통계와 협의 준비에만 쓰는 항목이에요.',
    options: [
      { value: 'ch1', label: '직원들이 늘 겪는 불편이예요(현장의견, 제안 등)', hint: '가장 흔한 시작이에요. 실사용자가 이미 있으니 좋은 출발이에요' },
      { value: 'plan', label: '부서 업무계획이예요', hint: '부서 업무계획에 담긴 과제' },
      { value: 'exec', label: '경영진 지시사항이예요', hint: '경영진(그룹장 이상) 지시로 시작된 과제' },
      { value: 'cop', label: 'CoP/붐업페스타 등에서 발굴된 아이디어예요', hint: 'CoP 활동·붐업페스타 같은 행사에서 나온 아이디어' },
    ],
    why: '시작 계기에 따라 이미 확인된 것과 앞으로 확인할 것이 달라요.',
  },
  {
    id: 'q20_participate', section: 'E', type: 'single',
    // 참여는 전제(요청 부서가 직접 만든다) — 할지 말지가 아니라 안내가 필요한지만 묻는다 (2026-09-11).
    // 이전 보기 yes(해보고 싶어요)·no(시간 내기 어려워요)는 LEGACY_OPTION_LABELS 로 표시하고, 판정(rules.js)은 yes→can · no→learn 으로 읽는다.
    ask: '바이브 코딩을 해보신 적 있나요?',
    sub: '이 개발은 요청 부서가 직접 바이브 코딩으로 만들어요. 코딩이 아니에요 — 원하는 화면과 기능을 말로 설명하면 AI가 만들고, AX-BRM이 방법을 알려주고 막힐 때 함께 풀어요.',
    showIf: isDevTrack,
    options: [
      { value: 'can', label: '네, 할 줄 알아요', hint: '바로 시작할 수 있어요' },
      { value: 'learn', label: '아니오, 안내가 필요해요', hint: '짧은 안내 세션 후 시작해요. 일정에 그만큼만 더해요' },
    ],
  },
  {
    id: 'q21_goal', section: 'E', type: 'textarea',
    ask: '완성되면 무엇이 얼마나 좋아질까요?',
    sub: '앞서 답한 "지금 걸리는 시간"과 비교해 주세요.',
    placeholder: '예) 엑셀 수작업 40분 → 1분 / 요청 누락 0건',
    tip: '숫자가 들어가면 효과를 증명하기 좋아요.',
  },
  {
    id: 'q22_when', section: 'E', type: 'single',
    ask: '언제까지 개발이 완료되어야 하나요?',
    options: [
      { value: 'urgent', label: '급해요(1~2개월 내)', hint: '' },
      { value: 'half', label: '이번 반기 안에', hint: '' },
      { value: 'year', label: '올해 안에', hint: '' },
      { value: 'nextyear', label: '내년 업무계획으로 추진 예정이예요', hint: '' },
    ],
  },
  {
    id: 'q23_refs', section: 'E', type: 'textarea', optional: true,
    ask: '참고할 화면이나 자료, 비슷한 서비스가 있으면 알려주세요.',
    sub: '없어도 괜찮아요. 화면 캡처·엑셀 양식 같은 파일은 아래에서 바로 올릴 수 있어요.',
    placeholder: '예) ○○ 시스템의 조회 화면과 비슷하게 / 타행 △△ 앱의 기능',
  },
];

/** @param {string} id */
export function getQuestion(id) {
  return QUESTIONS.find((q) => q.id === id);
}

/**
 * 현재 답변 기준으로 노출되는 질문 목록 (순서 유지)
 * @param {Record<string,string>} answers
 */
export function visibleQuestions(answers) {
  return QUESTIONS.filter((q) => !q.showIf || q.showIf(answers));
}

/**
 * 답변이 유효한지 (optional 은 빈 값 허용)
 * @param {Question} q
 * @param {string|undefined} v
 */
export function isAnswered(q, v) {
  if (q.optional) return v !== undefined; // 빈 문자열도 "건너뜀"으로 답한 것
  if (typeof v !== 'string' || !v.trim()) return false;
  // 보기가 바뀐 뒤 남은 옛 값(예: q20 의 yes/no)은 "아직 안 답한 것" — 초안을 이어 쓰거나 신청할 때 새 보기로 다시 고르게 한다.
  // 이미 신청된 요청의 표시는 formatAnswer(LEGACY_OPTION_LABELS)가 맡으므로 여기서 걸러도 깨지지 않는다.
  if (q.type === 'single' && q.options && !q.options.some((o) => o.value === v)) return false;
  return true;
}

/**
 * 다음에 답해야 할 질문 (없으면 null = 전부 완료)
 * @param {Record<string,string>} answers
 */
export function nextQuestion(answers) {
  for (const q of visibleQuestions(answers)) {
    if (!isAnswered(q, answers[q.id])) return q;
  }
  return null;
}

/** 보기에서 빠졌지만 예전 요청에 저장돼 있을 수 있는 값 — 값 그대로가 아니라 당시 라벨로 보여준다 */
const LEGACY_OPTION_LABELS = /** @type {Record<string, Record<string, string>>} */ ({
  q19_manager: { aware: '알고는 계세요' }, // 2026-09-04 보기 제거
  q20_participate: { yes: '네, 해보고 싶어요 (이전 질문: 참여할 수 있나요)', no: '시간을 내기 어려워요 (이전 질문: 참여할 수 있나요)' }, // 2026-09-11 질문 교체
});
/**
 * 답변을 사람이 읽는 형태로 (완료 행 요약·요약 화면·BRM 검토용)
 * @param {Question} q
 * @param {string|undefined} v
 */
export function formatAnswer(q, v) {
  if (v === undefined || v === '') return q.optional ? '건너뜀' : '–';
  if (q.type === 'single') {
    const o = q.options?.find((x) => x.value === v);
    return o ? o.label : LEGACY_OPTION_LABELS[q.id]?.[v] ?? v;
  }
  return v;
}

/**
 * 노출되지 않는 질문의 답은 제거 (분기가 바뀐 뒤 잔존 답변 정리)
 * @param {Record<string,string>} answers
 */
export function pruneAnswers(answers) {
  const visible = new Set(visibleQuestions(answers).map((q) => q.id));
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(answers)) if (visible.has(k)) out[k] = v;
  return out;
}

/** 랜딩 공감 카드 → 인터뷰 프리셋 — icon 은 src/assets/icons3d 의 3D 아이콘 이름(랜딩 카드용), emoji 는 아이콘이 없을 때의 대체 */
export const PRESETS = [
  {
    key: 'idea', emoji: '💡', icon: 'lightbulb-idea', title: '이런 AI 서비스가 필요해요',
    desc: '아이디어가 있는데 어떻게 시작할지 모를 때',
    answers: {},
  },
  {
    key: 'rules', emoji: '📚', icon: 'employee-handbook', title: '규정·매뉴얼 찾는 데 한참 걸려요',
    desc: '업무 기준을 찾아 읽고 요약해 답하는 일',
    answers: { q7_kind: 'geni' },
  },
  {
    key: 'excel', emoji: '📊', icon: 'spreadsheet', title: '엑셀에 같은 걸 매일 옮겨 적어요',
    desc: '여러 시스템에서 조회한 값을 엑셀로 정리',
    answers: { q7_kind: 'rpa' },
  },
  {
    key: 'docs', emoji: '📄', icon: 'ocr-document', title: '서류 수십 장을 눈으로 읽어요',
    desc: '서류를 보고 화면에 입력·확인하는 일',
    answers: { q7_kind: 'rpa' },
  },
];
