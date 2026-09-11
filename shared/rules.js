// @ts-check
/**
 * 판정 규칙 — 답변(Record) → 판정(Judgement).
 * 로드맵 v0.6 의 01(착수 판정)·02(데이터 케이스)·03/07(연계 트리)·05(배포지)·08(리드타임)·10(협의처)을
 * 순수 함수로 옮긴 것. 클라이언트(미리보기)와 서버(신청 시 스냅샷)가 같은 함수를 쓴다.
 */

/** @typedef {'geni'|'rpa'|'dev'|'consult'} Track */
/** @typedef {'A'|'B'|'C'|null} DataCase */
/** @typedef {'none'|'mart'|'api'|'file'|'bulk'|'bdp'|'tbd'|null} Integration */

/**
 * @typedef {Object} LeadCalc  합산 근거 — 순차 항목 합(serial) + 병행 묶음 합(parallel)이 만들기(dev)보다 길게 걸리는 만큼(extra)
 * @property {{min:number,max:number}} serial
 * @property {{min:number,max:number}} parallel
 * @property {{min:number,max:number}} dev
 * @property {{min:number,max:number}} extra
 *
 * @typedef {Object} LeadItem   dev = 개발(만들기) 항목 — 병행 항목의 기준 구간
 * @property {string} label
 * @property {number} min
 * @property {number} max
 * @property {boolean} [parallel]  개발과 병행되는 항목
 * @property {boolean} [dev]       개발(만들기) 항목 — 병행 항목의 기준 구간
 */

/**
 * @typedef {Object} Judgement
 * @property {string} version
 * @property {string} channel
 * @property {Track} track
 * @property {DataCase} dataCase   내부 키(A·B·C)는 유지하되 화면에는 "Case X" 표기를 쓰지 않는다 (2026-09-08)
 * @property {'yes'|'no'|'unknown'|null} pii
 * @property {Integration} integration
 * @property {{min:number,max:number,items:LeadItem[],prep?:LeadItem|null,calc?:LeadCalc|null,tbd?:boolean}|null} leadtime
 *   **요건 확정 후** 개발 착수부터 오픈까지의 참고 기간 (2026-09-08: 요청서 작성·AX-BRM 협의 구간은 합산에서 뺐다 — 요청자에게 전체 기간이 길어 보였음).
 *   prep = 빼 둔 "원하는 일 정리 · AX-BRM 상담" 구간(BRM 내부 참고용) · null = 산정 불가 · tbd = 답이 거의 없어 협의 후 정함(숫자는 BRM 참고용)
 * @property {{key:string,name:string,when:string,topics:string}[]} stakeholders
 * @property {string[]} prep
 * @property {{level:'warn'|'info'|'check',text:string}[]} flags
 * @property {string[]} unknowns   "잘 모르겠어요"로 답한 질문 id
 * @property {boolean} [embed]     기존 행내 시스템 안에서 동작해야 한다고 명확히 답함 → 담당자(IT BRM) 협의 필수 카드
 */

/**
 * 판정 라벨 3층 구조 — plain(실제로 무엇을 하는지, 쉬운 말) / analogy(비유, 보조) / label(BRM 내부 용어)
 * 요청자 화면은 plain 을 제목으로 쓰고 analogy 를 작게 곁들인다. 비유만 단독으로 쓰지 않는다.
 */
/** 모든 판정 하단에 고정 표시되는 필수 안내 목록 */
export const GOVERNANCE_NOTICES = [
  'AI 기능이 들어가는 서비스는 AI 거버넌스(AI 사용 규정 검토 · AX디지털전략부)와 보안성 심의(정보보호총괄부)를 거쳐요.',
  '국정원 보안성 심의 대상이면 심의에 1~3개월이 걸릴 수 있어요. 위 예상 기간에는 포함되지 않았으니 일정을 잡을 때 따로 감안해 주세요.',
];
/** "기존 시스템 안에서 동작해야 해요"를 고른 경우 판정 패널에 따로 뜨는 카드 (예상 소요 기간과 같은 골격) */
export const EMBED_NOTICE = {
  title: '기존 시스템 결합',
  badge: '협의 필수',
  plain: '해당 시스템 담당자(또는 IT BRM)와의 협의가 필요해요',
  desc: '기존 행내 시스템에 기능을 추가하는 경우예요. 개발 기간과 가능 여부를 담당자와 먼저 협의해야 하고, 배포 방식은 개발 협의를 거친 뒤 함께 정해요.',
};

export const TRACK_LABEL = /** @type {Record<Track,{label:string,plain:string,analogy:string,desc:string}>} */ ({
  geni: { label: 'AI 활용 · GENI', plain: '이미 있는 행내 생성형 AI(GENI)로 해결해요', analogy: '기성복 — 바로 입을 수 있어요', desc: '행내 생성형 AI(GENI)로 문서 요약·초안·질문답변을 바로 시작할 수 있어요. 새로 만들지 않아요.' },
  // rpa 와 dev 는 절차(개발 검증 → 반입)와 기간 계산이 같다. 그래도 나눠 두는 이유: BRM 이 "지금 하는 일을 대신 돌리는 자동화"인지
  // "없던 화면·기능을 새로 만드는 개발"인지 접수함·통계에서 한눈에 구분해야 하고, 요청자도 문항(q7)에서 이미 둘을 갈라 답한다.
  // 그래서 라벨·설명은 반드시 서로 다른 말로 — 무엇을 만드는지가 첫 단어에 드러나게 (2026-09-04)
  rpa: { label: '개발 검증 · 업무 자동화(RPA)', plain: '지금 사람이 반복하는 일을 대신하는 자동화 프로그램을 만들어요', analogy: '로봇 비서 — 클릭·입력·서류 읽기를 그대로 대신해요', desc: '새 화면을 만드는 게 아니라, 지금 하는 반복 클릭·입력·서류 읽기를 자동으로 돌리는 프로그램(RPA)을 AI와 함께 만들고 행내로 들여와서 완성시켜요.' },
  dev: { label: '개발 검증 · 신규 프로그램', plain: '지금 없는 화면·기능을 새 프로그램으로 만들어요', analogy: '맞춤복 — 치수를 재고 새로 만들어요', desc: '조회·계산·관리 도구처럼 아직 없는 화면과 기능을 AI와 함께 새로 만들고, 행내로 들여와서 완성시켜요.' },
  consult: { label: '상담 필요', plain: 'AX-BRM과 상담 후 정해요', analogy: '어떤 옷이 맞을지 함께 골라요', desc: 'AX-BRM이 연락드려 있는 도구로 되는지, 새로 만들어야 하는지 함께 정해요.' },
});

export const DATACASE_LABEL = {
  A: { label: '데이터 필요 없음', plain: '데이터가 필요 없어요 — 입력한 값만으로 동작해요', analogy: '시뮬레이터·계산기처럼 — 값을 넣으면 결과가 나와요', desc: '행내 데이터를 쓰지 않으니 데이터 협의가 없어 가장 빨라요.' },
  B: { label: '모양만 같으면 됨', plain: '실제 값 대신, 모양만 같은 가짜 데이터로 만들어요', analogy: '모델하우스처럼 — 가구 배치는 진짜, 안의 물건은 가짜', desc: '항목 이름·형식만 밖으로 나가고 실제 값은 한 건도 나가지 않아요. 완성 후 행내에서 실제 데이터로 연결해요. 표준 경로예요.' },
  C: { label: '실제 값 필요 (비식별 반출)', plain: '실제 데이터를 가려서 일부만 써요 — 밖에서 써도 되는지 심사가 필요해요', analogy: '얼굴을 가린 실제 사진처럼', desc: '실제 값을 가린 뒤 일부만 밖으로 내보내요. 밖에서 써도 되는지 심사(+3~5주)를 거치고, 승인이 안 될 수도 있어요.' },
};

export const INTEGRATION_LABEL = {
  none: { label: '데이터 연계 없음', plain: '행내 데이터 연결이 필요 없어요', analogy: '', desc: '데이터 협의 없이 반입 점검만 거쳐요.', weeks: [2, 3] },
  mart: { label: '온라인 · 마트 조회 권한', plain: '정리된 행내 데이터 창고(마트)에서 실시간으로 조회해요', analogy: '편의점처럼 — 진열돼 있으면 바로 살 수 있어요', desc: '필요한 항목이 마트에 이미 있으면 조회 권한만 받아 연결해요.', weeks: [1, 2] },
  api: { label: '온라인 · 연계 API', plain: '원천 시스템에 실시간으로 직접 연결해요', analogy: '전화 주문처럼 — 저쪽도 준비해야 해서 오래 걸려요', desc: '마트에 없을 때만 쓰는 방식이에요. 상대 시스템 개발이 필요해 가장 오래 걸려요.', weeks: [8, 12] },
  file: { label: '배치 · 파일 수령', plain: '필요한 데이터를 파일로 정기적으로 받아요', analogy: '택배처럼', desc: 'AX데이터혁신부가 정한 주기로 파일(CSV 등)을 전달해 줘요.', weeks: [2, 3] },
  bulk: { label: '배치 · 1회 일괄 적재', plain: '데이터를 한 번에 통째로 옮겨 담아요', analogy: '이사처럼 — 한 번 옮기면 끝', desc: '처음 한 번만 필요한 대량 데이터를 일괄로 넣어요.', weeks: [3, 4] },
  bdp: { label: '배치 · BDP 직접 연결', plain: '매일 자동으로 데이터가 들어오는 전용 통로를 놓아요', analogy: '수도 배관 공사처럼 — 처음엔 오래, 이후엔 자동', desc: '전용 테이블에 매일 밤 자동으로 적재돼요. 대량·정기 갱신의 표준 경로예요.', weeks: [4, 6] },
  tbd: { label: '연계 방식 미정', plain: '데이터를 어떻게 연결할지는 검토 후 정해요', analogy: '', desc: '답변 중 확인이 필요한 항목이 있어 AX-BRM이 검토 후 정해요.', weeks: [2, 6] },
};


const STAKEHOLDERS = {
  dept: { key: 'dept', name: '현업 수행 부서(우리 부서)', when: '착수 판정 전', topics: '담당자 지정 · 부서장 착수 동의' },
  hub: { key: 'hub', name: 'AX-BRM(AX디지털추진부)', when: '접수부터 전 과정', topics: '원하는 일 함께 정리 · 화면 시안 · 데이터·AI 연결 · 배포 지원' },
  // 모든 시나리오(Geni 활용 포함)에 들어간다 — AI·LLM 기능이 포함되면 위험등급 평가 등 거버넌스 협의가 필요하다 (2026-09-08)
  governance: { key: 'governance', name: 'AI 거버넌스(AX디지털전략부)', when: 'AI·LLM 등 기능이 포함된 기능 개발 시', topics: 'AI 위험등급 평가 등 협의 진행' },
  data: { key: 'data', name: '데이터 원천(AX데이터혁신부 등)', when: '데이터 필요 확정 즉시 · 개발과 동시', topics: '데이터를 받는 방식과 범위 · 데이터 담당자 동의' },
  privacy: { key: 'privacy', name: '개인정보 검토(정보보호총괄부)', when: '데이터 요건 확정 직후', topics: '이용 근거 · 가명처리 · 보관과 파기' },
  security: { key: 'security', name: '보안성심의(정보보호총괄부)', when: '반입 전', topics: 'AI(대화형 모델 등) 기능이 들어갈 때 보안성 심의' },
};

/**
 * @param {Record<string,string>} a
 * @param {string} version
 * @returns {Judgement}
 */
export function judge(a, version) {
  /** @type {Judgement['flags']} */
  const flags = [];
  const unknowns = Object.entries(a).filter(([, v]) => v === 'unknown' || v === 'tbd' || v === 'consult').map(([k]) => k);

  const channel = a.q2_channel || 'ch1';
  /** @type {Track} */
  const track = a.q7_kind === 'geni' || a.q7_kind === 'rpa' || a.q7_kind === 'dev' ? a.q7_kind : 'consult';
  const dev = track === 'dev' || track === 'rpa' || track === 'consult';

  /** @type {Judgement['stakeholders']} */
  const stakeholders = [];
  /** @type {string[]} */
  const prep = [];
  stakeholders.push(STAKEHOLDERS.dept, STAKEHOLDERS.hub, STAKEHOLDERS.governance); // AX-BRM 은 모든 갈래에서 현업 다음 순서 · AI 거버넌스는 모든 시나리오 공통

  // 공통 준비물
  prep.push('지금 일하는 순서를 보여줄 화면 캡처나 엑셀 양식 (있는 그대로)');
  if (a.q19_manager === 'no') prep.push('부서장 보고 (진행 확정 전까지 · 결재 아님)');

  // ── 기성복 갈래: 짧게 끝
  if (!dev) {
    return {
      version, channel, track, dataCase: null, pii: null, integration: null, embed: false,
      leadtime: { min: 1, max: 2, items: [{ label: 'Geni 특화서비스 활용 안내·코칭', min: 1, max: 2 }], prep: null, calc: null },
      stakeholders, prep,
      flags: [{ level: 'info', text: '이미 있는 Geni 특화서비스로 해결될 수 있는지 AX-BRM이 먼저 확인하고, 부족하면 다른 개발 방법을 협의드려요.' }],
      unknowns,
    };
  }

  // ── 데이터 케이스
  /** @type {DataCase} */
  let dataCase = null;
  /** @type {Judgement['pii']} */
  let pii = null;
  /** @type {Integration} */
  let integration = null;

  if (a.q9_data === 'no') {
    dataCase = 'A';
    integration = 'none';
  } else {
    if (a.q9_data === 'unknown') flags.push({ level: 'check', text: '행내 데이터가 필요한지 확실하지 않아요. 일단 "모양만 같으면 되는" 표준 경로로 가정했어요.' });
    if (a.q10_realvalue === 'real') {
      dataCase = 'C';
      flags.push({ level: 'warn', text: '실제 값이 필요하면 데이터 반출 심사(+3~5주)가 추가되고 승인 여부가 불확실해요. AX-BRM이 "모양만 같아도 되는지"를 먼저 함께 확인해드릴게요.' });
      prep.push('실제 값이 꼭 필요한 이유와 필요한 범위(항목·기간) 메모');
    } else {
      dataCase = 'B';
      if (a.q10_realvalue === 'unknown') flags.push({ level: 'check', text: '실제 값이 필요한지는 검토 때 함께 확인해요. 표준 경로(모양만)로 가정했어요.' });
    }
    pii = a.q11_pii === 'yes' ? 'yes' : a.q11_pii === 'no' ? 'no' : 'unknown';
    if (pii === 'yes') {
      flags.push({ level: 'warn', text: '개인정보가 포함되면 어떤 경로든 가명처리와 이용 근거 심의(+2~4주)가 필요해요.' });
    } else if (pii === 'unknown') {
      flags.push({ level: 'check', text: '개인정보 포함 여부는 검토 때 함께 확인해요.' });
    }
    prep.push('필요한 데이터 항목 목록과 항목별 쓰는 이유 — 엑셀 맨 윗줄 제목 수준이면 충분');
    stakeholders.push(STAKEHOLDERS.data);

    // 연계 방식
    if (a.q13_online === 'online') {
      integration = 'mart';
      flags.push({ level: 'info', text: '실시간 조회는 마트(정리된 데이터 창고)에 필요한 항목이 있는지 먼저 확인해요. 없으면 개발부터 연계까지 기간(8주+)이 추가로 필요해요.' });
      prep.push('필요한 항목이 정보계·마트에 이미 있는지 데이터 담당자에게 한 번 확인');
    } else if (a.q13_online === 'batch' || a.q13_online === 'once') {
      // once(한 번만) 는 정기 갱신과 같은 갈래(시나리오 4). 대용량이면 일괄 적재(bulk), 계속 갱신이면 BDP.
      // q15_recurring 은 q13_online 에 통합되기 전(2026-09-07 이전) 저장된 답변과의 호환용
      const once = a.q13_online === 'once' || a.q15_recurring === 'once';
      if (a.q14_volume === 'small') integration = 'file';
      else if (a.q14_volume === 'large' || a.q14_volume === 'huge') integration = once ? 'bulk' : 'bdp';
      else integration = 'tbd';
    } else {
      integration = 'tbd';
    }
  }

  // ── 배포 관련 답변은 판정하지 않는다 — 배포 방식은 개발 협의를 거친 뒤 정해진다.
  //    다만 "기존 시스템 안에서 동작" 을 명확히 고른 경우는 embed=true 로 남겨 판정 패널이 협의 필수 카드를 따로 띄운다.
  const embed = a.q16_embed === 'embed';
  if (a.q16_embed === 'unknown') {
    flags.push({ level: 'check', text: '기존 시스템 결합 여부는 협의 때 함께 확인해요.' });
  }
  stakeholders.push(STAKEHOLDERS.security);
  if (pii === 'yes') stakeholders.push(STAKEHOLDERS.privacy); // 개인정보 검토는 맨 뒤에 표시

  // ── 리드타임 초안 — **요건 확정 후** 개발 착수부터 오픈까지만 합산한다.
  //    요청서 작성·요건 구체화·AX-BRM 협의 구간(prepPhase)은 요청자에게 전체가 길어 보여서 합산에서 빼고, BRM 내부 참고로만 남긴다 (2026-09-08).
  // 바이브 코딩을 바로 시작할 수 있는지 — can(할 줄 알아요). 이전 보기 yes(해보고 싶어요)도 같은 기간으로 본다 (2026-09-11 질문 교체)
  const vibeReady = a.q20_participate === 'can' || a.q20_participate === 'yes';
  /** @type {LeadItem[]} */
  const items = [];
  /** @type {LeadItem} */
  let prepPhase;
  if (!integration || integration === 'none') {
    // 데이터가 필요 없으면 협의·연계가 없어 전 구간이 가볍다
    prepPhase = { label: '원하는 일 정리 · AX-BRM 상담', min: 1, max: 1 };
    const devA = vibeReady ? [1, 2] : [2, 3];
    items.push({ label: 'AI와 함께 초안 만들기', min: devA[0], max: devA[1], dev: true });
    items.push({ label: '반입 점검 · 오픈', min: 1, max: 2 });
  } else {
    prepPhase = { label: '원하는 일 정리 · AX-BRM 상담', min: 2, max: 3 };
    if (dataCase === 'C') items.push({ label: '실제 데이터를 밖에서 써도 되는지 심사', min: 3, max: 5 });
    const devW = vibeReady ? [4, 6] : [6, 8];
    items.push({ label: 'AI와 함께 초안 만들기', min: devW[0], max: devW[1], dev: true });
    // 병행 묶음(만들기와 동시에 진행): 개인정보 심의 → 데이터 연결 순서로 **이어서** 진행된다고 본다 (심의를 통과해야 데이터를 받을 수 있다 — 2026-09-08 확정).
    //   그래서 병행 묶음끼리는 더하고, 그 합이 만들기보다 길면 넘치는 만큼만 전체에 더한다. 화면도 이 순서대로 보여 준다.
    if (pii === 'yes') items.push({ label: '개인정보 가명처리 · 이용 근거 심의', min: 2, max: 4, parallel: true });
    const w = INTEGRATION_LABEL[integration].weeks;
    items.push({ label: `데이터 연결 — ${INTEGRATION_LABEL[integration].plain}`, min: w[0], max: w[1], parallel: true });
    items.push({ label: '반입 점검 · 통합 검증 · 오픈', min: 2, max: 3 });
  }
  const serial = items.filter((i) => !i.parallel);
  const par = items.filter((i) => i.parallel);
  let min = serial.reduce((sum, i) => sum + i.min, 0);
  let max = serial.reduce((sum, i) => sum + i.max, 0);
  /** @type {LeadCalc | null} 합산 근거 — 화면이 "어떻게 더했는지"를 그대로 보여 준다 */
  let calc = null;
  if (par.length) {
    const pMin = par.reduce((sum, i) => sum + i.min, 0);
    const pMax = par.reduce((sum, i) => sum + i.max, 0);
    const devItem = items.find((i) => i.dev);
    const dMin = devItem ? devItem.min : 0, dMax = devItem ? devItem.max : 0;
    const extra = { min: Math.max(0, pMin - dMin), max: Math.max(0, pMax - dMax) };
    calc = { serial: { min, max }, parallel: { min: pMin, max: pMax }, dev: { min: dMin, max: dMax }, extra };
    min += extra.min;
    max += extra.max;
  }
  // 어떤 도움이 맞는지도 모르거나(상담 필요), 데이터가 필요한지부터 모르는데 그 뒤 답도 전부 모르겠다면 숫자를 앞세우지 않는다.
  // 요청자 화면은 "협의 후 정해요"로 보여 주고, 세부 항목은 BRM 이 참고할 초안으로만 남긴다 (2026-09-08).
  const tbd = track === 'consult' || (a.q9_data === 'unknown' && integration === 'tbd');
  /** @type {{min:number,max:number,items:LeadItem[],prep:LeadItem,calc:LeadCalc|null,tbd?:boolean}|null} */
  const leadtime = tbd ? { min, max, items, prep: prepPhase, calc, tbd: true } : { min, max, items, prep: prepPhase, calc };

  if (a.q20_participate === 'learn') prep.push('바이브 코딩 안내 세션 일정을 협의 때 잡기');
  else if (a.q20_participate === 'no') prep.push('참여 시간이 어려울 때의 대안(참여 범위·지원 방식)을 협의 때 상의'); // 이전 보기(2026-09-11 이전 초안)
  if (track === 'consult') flags.unshift({ level: 'info', text: '어떤 도움이 맞는지 아직 정해지지 않았어요. 아래 판정은 "새로 만드는 경우"를 가정한 초안이고, 진행 방식과 기간은 AX-BRM이 상담 후 함께 정해요.' });

  return { version, channel, track, dataCase, pii, integration, embed, leadtime, stakeholders, prep, flags, unknowns };
}

/** 리드타임 범위를 사람이 읽는 문장으로 — "요건 확정 후 개발" 기간이라는 맥락은 부르는 쪽의 라벨(LEADTIME_LABEL)이 붙인다 */
export function leadtimeText(/** @type {Judgement['leadtime']} */ lt) {
  if (!lt) return '검토 후 안내';
  if (lt.tbd) return 'AX-BRM과 협의 후 정해요';
  if (lt.min === lt.max) return `약 ${lt.min}주`;
  return `약 ${lt.min}~${lt.max}주`;
}

/**
 * 예상 기간 표기 문구 — 어디서 보여 주든 "요건 확정 후 · 참고용 · 달라질 수 있음" 이 함께 읽히도록 한 곳에서만 관리한다.
 * short: 표·카드의 짧은 라벨 / title: 판정 카드 제목 / sub: 제목 아래 한 줄 / note: 세부 항목 아래 안내
 */
export const LEADTIME_LABEL = {
  dev: {
    short: '개발 예상 기간',
    title: '요건 확정 후 개발 예상 기간',
    sub: '원하는 일이 정리되고 AX-BRM 상담이 끝난 뒤, 개발 착수부터 오픈까지 걸릴 것으로 예상하는 참고 기간이에요. 만들 내용과 개발 난이도에 따라 달라질 수 있어요.',
    note: '요청서 작성과 원하는 일을 정리하는 기간은 포함하지 않았어요. 확정 기간이 아니라 참고용 초안이고, AX-BRM 검토 후 다시 안내해요.',
  },
  geni: {
    short: '안내 예상 기간',
    title: '안내·코칭 예상 기간',
    sub: 'AX-BRM이 이미 있는 Geni 특화서비스 활용을 안내·코칭하는 데 걸릴 것으로 예상하는 참고 기간이에요. 상황에 따라 달라질 수 있어요.',
    note: '확정 기간이 아니라 참고용 초안이고, AX-BRM 검토 후 다시 안내해요.',
  },
};
/** 주 범위 표기 — 같으면 "4주", 다르면 "4~6주" */
export const weeksText = (/** @type {{min:number,max:number}} */ r) => (r.min === r.max ? `${r.min}주` : `${r.min}~${r.max}주`);

/**
 * "어떻게 더했는지" 한 문장 — 항목을 그냥 더한 값과 합계가 달라 생기는 혼동을 막는다.
 *   병행 묶음(개인정보 심의 → 데이터 연결)은 만들기와 동시에 진행되므로, 묶음 합이 만들기보다 긴 만큼만 더한다.
 * @returns {{ formula: string, note: string } | null} formula = 숫자 식, note = 말로 푼 설명. 병행 항목이 없으면 null
 */
export function leadtimeCalcText(/** @type {Judgement['leadtime']} */ lt) {
  const c = lt?.calc; if (!c) return null;
  const over = c.extra.max > 0;
  const formula = over
    ? `차례로 진행 ${weeksText(c.serial)} + 동시 진행에서 넘치는 ${weeksText(c.extra)} = 약 ${weeksText({ min: lt.min, max: lt.max })}`
    : `차례로 진행 ${weeksText(c.serial)} = 약 ${weeksText({ min: lt.min, max: lt.max })}`;
  const note = over
    ? `연한 점 항목은 만들기(${weeksText(c.dev)})와 동시에 진행돼요. 이어서 하면 ${weeksText(c.parallel)}가 걸려 만들기보다 ${weeksText(c.extra)} 더 걸리므로, 그만큼만 더했어요. 항목을 모두 더한 값보다 짧은 이유예요.`
    : `연한 점 항목은 만들기(${weeksText(c.dev)})와 동시에 진행돼요. ${weeksText(c.parallel)}면 끝나 만들기 기간 안에 들어가므로 따로 더하지 않았어요.`;
  return { formula, note };
}

/** 숫자 바로 아래 붙는 경고 한 줄 — "확정 기간으로 읽지 말 것" (2026-09-09: 예상치임을 더 분명히) */
export const LEADTIME_CAVEAT = '확정된 기간이 아니에요. 검토와 협의를 거치며 달라질 수 있어요.';

/** 판정의 갈래에 맞는 예상 기간 문구 */
export function leadtimeLabel(/** @type {Partial<Judgement> | null | undefined} */ j) {
  return j?.track === 'geni' ? LEADTIME_LABEL.geni : LEADTIME_LABEL.dev;
}
