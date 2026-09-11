// @ts-check
/**
 * 용어 사전 — ⓘ 툴팁·결과 화면 설명·BRM 검토 화면(내부 용어 병기)에 사용.
 * key 는 화면 어디서든 <Term k="aihub"/> 로 참조.
 */
export const GLOSSARY = /** @type {Record<string,{term:string,plain:string,analogy:string,internal?:string}>} */ ({
  brm: { term: 'AX-BRM', plain: 'AI로 업무를 바꾸고 싶을 때 먼저 찾는 상담 창구', analogy: '옆자리 베테랑 사수 — 지시가 아니라 도움을 주는 사람' },
  geni: { term: 'GENI', plain: '행내 생성형 AI(업스테이지 Solar Pro 2 기반). 글 요약·초안·문서 질문답변', analogy: '행내 규정을 다 읽은 비서에게 물어보기', internal: 'LLM(업스테이지 Solar Pro 2) · RAG' },
  aldaeri: { term: '알대리', plain: '반복 클릭·입력·서류 읽기를 대신하는 행내 자동화 도구', analogy: '정해진 순서로 일하는 로봇 직원', internal: 'RPA · AI-OCR' },
  vibe: { term: '바이브코딩', plain: 'AI에게 말로 설명해 프로그램을 만드는 방식', analogy: '설계도 없이 말로 설명하면 집을 지어주는 건축 AI', internal: '행외 생성형 AI 코딩 도구 · 바이브랩스' },
  outside: { term: '은행 밖에서 만들기', plain: '인터넷이 되는 밖에서 먼저 만들고, 검사를 거쳐 안으로 들여오는 것', analogy: '해외에서 물건을 사 와서 입국 심사를 통과하는 것', internal: '행외 개발 · 행내 반입' },
  aihub: { term: 'AI-HUB', plain: '행내 AI 프로그램들이 함께 사는 공용 건물', analogy: '오피스 빌딩 입주 — 전기·보안·청소가 갖춰져 있어 빠름. 단독주택은 다 따로 지어야 해서 기간 산정 불가', internal: 'AI HUB 플랫폼 · 컨테이너 · SSO' },
  caseA: { term: '계산기형', plain: '사용자가 입력한 값만으로 결과가 나오는 프로그램', analogy: '계산기 — 숫자를 넣으면 답이 나옴', internal: '데이터 필요 없음' },
  caseB: { term: '모델하우스형', plain: '데이터의 모양(항목·형식)만 같으면 되는 경우. 값은 밖으로 나가지 않음', analogy: '모델하우스 — 가구 배치는 진짜, 안의 물건은 가짜', internal: '모양만 같으면 됨 (표준)' },
  caseC: { term: '실데이터 심사형', plain: '실제 값의 분포·특성이 꼭 필요한 경우. 값을 가린 뒤 심사를 거쳐 일부만 밖으로 내보냄', analogy: '얼굴을 가린 실제 사진 — 심사(+3~5주)를 통과해야 밖으로 나갈 수 있음', internal: '실제 값 필요 (비식별 반출)' },
  online: { term: '실시간 연결', plain: '화면을 열 때마다 최신 데이터를 가져오는 방식', analogy: '창구 — 고객이 앞에 앉아 있을 때 즉시 조회', internal: '온라인 연계' },
  batch: { term: '정기 갱신', plain: '하루 한 번(또는 정기적으로) 데이터를 받아두는 방식', analogy: '조간 신문 — 아침에 한 번 받아 하루 종일 봄', internal: '배치 연계' },
  mart: { term: '편의점형 조회', plain: '이미 정리된 행내 데이터 창고에서 바로 조회', analogy: '편의점 — 진열돼 있으면 바로 살 수 있음 (1~2주)', internal: '마트 조회 권한 · SQL 질의' },
  api: { term: '전화 주문형 연결', plain: '원천 시스템에 실시간으로 직접 물어보기', analogy: '전화 주문 — 저쪽도 준비해야 해서 오래 걸림 (8주+)', internal: '연계 API · EAI' },
  file: { term: '택배형 전달', plain: '필요한 데이터를 파일로 정기 전달받기', analogy: '택배 (2~3주)', internal: '파일 수령 · .dat / CSV' },
  bdp: { term: '배관형 연결', plain: '매일 자동으로 데이터가 흘러들어오는 전용 통로', analogy: '수도 배관 공사 — 처음엔 오래(4~6주), 이후엔 자동', internal: 'BDP 직접 연결 · 일배치' },
  pii: { term: '개인정보', plain: '고객 이름·주민번호·계좌번호처럼 누군지 알 수 있는 정보', analogy: '포함되면 어떤 경로든 +2~4주 심사', internal: '가명처리 · 이용 근거 심의' },
  leadtime: { term: '요건 확정 후 개발 예상 기간', plain: '원하는 일이 정리되고 AX-BRM 상담이 끝난 뒤 개발 착수부터 오픈까지 예상하는 참고 기간. 요청서 작성·협의 기간은 뺐고, 요건·난이도에 따라 달라짐. 항상 범위로 표시', analogy: '참고용 초안 — 검토 후 다시 안내해요', internal: '리드타임(개발 구간)' },
  mockup: { term: '목업', plain: '실제로 동작하기 전에 화면의 모양과 흐름을 미리 보여주는 시안', analogy: '집을 짓기 전 3D 모형' },
});
