# AX-BRM 포탈 DESIGN.md

> 전역 지침 `DESIGN_GUIDELINES.md` 를 이 프로젝트에 인스턴스화한 문서. 전역과 **다른 결정과 그 이유**만 적는다.
> 살아있는 스타일 카탈로그: `preview.html` (실제 `src/styles/*.css` 를 그대로 로드).

## 1. Visual Theme & Atmosphere

따뜻한 오프화이트 종이 위에 놓인 **인터뷰 노트**. 은행 사내 도구가 요구하는 차분함(딥 틸 단일 액션색, 학구적 세리프 헤드라인, 그림자 대신 헤어라인)과, "AI를 잘 모르는 직원이 겁먹지 않게" 하는 다정함(손그림 사람 일러스트, 민트·블러시 파스텔 카드, 말풍선 코칭 팁)을 같은 화면에 둔다. 화려함 대신 **속도와 안내**: 요청자는 가끔 오는 사람이므로 설명을 넉넉히, BRM 은 매일 쓰는 사람이므로 밀도와 필터를 우선한다.

레퍼런스: styles.refero.design — **User Interviews**("hand-drawn research field notes on warm paper") 를 1순위로 차용, Say Briefly 의 형광펜 하이라이트 기법만 부분 차용. 로드맵 HTML(v0.6)의 `--hub #0A6772` 틸과 같은 계열로 문서 ↔ 서비스 정체성을 잇는다.

## 2. Color Palette & Roles

| 토큰 | 값 | 역할 — 어디에 쓰고, 어디에 안 쓰는지 |
|---|---|---|
| `--brand-500` | `#1C5D5F` | **유일한 액션색**. 주 CTA, 활성 스텝, 선택된 카드 테두리, 링크. 화면당 1~2회. 본문·큰 면적 배경에 쓰지 않는다(마지막 CTA 밴드만 예외) |
| `--brand-600/700` | `#164B4D / #103A3B` | hover · CTA 밴드 위 흰 버튼 글자 |
| `--brand-50/100/300` | `#E8F3F2 / #D2E7E5 / #7FB7B4` | 선택 배경, 활성 질문 카드 테두리, 뱃지. 텍스트에 쓰지 않는다 |
| `--ink-50` | `#F4F8F7` | 페이지 캔버스. **순백 `#FFF` 를 페이지 배경으로 쓰지 않는다** — 흰색은 카드 표면 전용 |
| `--mint` / `--blush` | `#E4F0F1 / #F2E8E2` | 파스텔 카드 표면 2색. 도움 방식(민트) · 배포 방식(블러시) · 공감 카드 교차. **같은 줄에 같은 색 카드 2장 이상 금지**. 텍스트·버튼에는 절대 쓰지 않음 |
| `--mint-deep` / `--blush-deep` | `#65B8A2 / #D6AEC1` | 장식 전용 — 눈썹 라벨 점, 완료 스텝 점, 손그림 스트로크. 의미 전달에 쓰지 않는다 |
| `--sand` | `#FBF5EE` | 코칭 팁·이어하기 띠 배경 |
| `--text / --text-sub` | `#1B2B2C / #41585E` | 본문 위계. 대비 15:1 / 7.5:1 |
| `--text-muted` | `#5E7379` | 캡션·메타. 흰 배경 대비 5.0:1 (AA 통과). `--ink-500 #7A8E93` 은 **본문 금지** — 플레이스홀더·장식만 |
| 시맨틱 4쌍 | `success/warning/danger/info` + `-bg` | 상태 뱃지·알림 박스. 항상 **색 + 이모지 + 텍스트** 3중 부호화 |

차트(통계)는 **단일 시리즈 · 브랜드 1색**만 쓴다. 범례 없음(제목이 시리즈 이름), 값은 텍스트 토큰 색으로 직접 라벨, 표 병행. 다중 시리즈 차트가 필요해지면 dataviz 팔레트 검증 후 추가한다.

## 3. Typography

| 용도 | 폰트 | 크기/무게 |
|---|---|---|
| 히어로·요약 제목·완료 화면 제목 | **Noto Serif KR Variable** (`--font-serif`, 500) | `clamp(30px, 4.2vw, 46px)` / 요약 `clamp(24px,3vw,32px)` |
| 질문 대사 | Pretendard 700 | 20px |
| 본문 | Pretendard 400 | 15px / 1.6 |
| 캡션 | Pretendard | 12.5~13.5px, `--text-muted` |
| 눈썹 라벨·접수번호·사번 | **D2Coding** (`--font-mono`) | 12px, 대문자 `.08em` |

세리프는 **감정이 필요한 순간에만**(첫인상·마무리). 업무 화면(접수함·검토·통계)에는 등장하지 않는다. 마루부리(MaruBuri)를 1순위로 검토했으나 npm 미배포로 Noto Serif KR 을 채택 — 사내 배포 시 마루부리 woff2 를 `--font-serif` 첫 항목으로 교체 가능.
전역 규칙 유지: `word-break: keep-all` + `overflow-wrap`, `.num { tabular-nums }`, `.identifier` 는 모노 + `break-all`.

## 4. Layout

- **요청자 화면 = 셸 A · 중앙 단일 컬럼** (`--column-max: 880px`). 인터뷰는 1080px 이상에서 우측 340px 사이드바(판정 미리보기·알림)가 붙는다 — **경고 비침투 원칙**: 알림은 질문 흐름 안에 끼우지 않고 사이드바에만.
- **BRM 화면 = 셸 A · 고정 사이드바** (`BrmShell`, 264px). 1024px 이하에서 상단 탭으로 전환.
- 랜딩은 풀폭 섹션 스택(히어로 → 신뢰 띠 → 내 요청 → 공감 카드 → 진행 순서 → 두 갈래 → FAQ → CTA 밴드 → 푸터).
- 간격 4px 베이스, 섹션 64px, 카드 24px. 최대 콘텐츠 폭 1200px.

## 5. Depth & Elevation

**헤어라인 우선.** 카드는 `1px --line` 테두리, 그림자 없음(레퍼런스 규칙). 그림자는 토스트(`--shadow-elevated`)·모달(`--shadow-modal`)·hover 카드만. 활성 질문 카드는 그림자 대신 `--brand-300` 1.5px 테두리로 띄운다.

## 6. Components (이 프로젝트에서 실제 쓰는 것)

| 컴포넌트 | 파일 | 계약 |
|---|---|---|
| 필 버튼 | `components.css .btn` | 48px 라운드, 44px 최소 높이. primary 는 화면당 1~2회 |
| 선택 카드 (radio-as-card) | `.choice` | `role=radio` + `aria-checked` 로 스타일링. 클릭 즉시 진행. 숫자 키 1~9 단축 |
| 활성 질문 카드 | `QuestionCard.vue` | 진행 트리거: single=클릭, text=Enter/버튼, textarea=Ctrl+Enter/버튼. **blur 진행 금지**. optional 은 "건너뛰기" |
| 완료 행 | `AnswerRow.vue` / `.qrow` | 우측 볼드 요약 + ✎ 수정 + 💬 누적 코칭 팁 |
| 도트 스테퍼 | `StepDots.vue` | A~E 5구간, 숨김 구간 자동 제외, `aria-current=step` |
| 판정 패널 | `JudgementPanel.vue` | side/full 2모드. 쉬운 말 크게 + `internal` 옵션으로 BRM 용어 병기. 항상 "초안" 뱃지 |
| 상태 뱃지 | `StatusBadge.vue` | 톤 + 이모지 + 라벨 3중 부호화 |
| 알림 박스 | `.notice[data-level]` | info 💡 / warn ⚠️ / check 🔍 |
| 토스트 | `ToastStack.vue` | `role=status/alert`, 좌측 보더 톤, "실행 취소" 액션(삭제는 즉시 실행 + 8초 되돌리기) |
| 파일 업로드 | `FileUpload.vue` | 드롭존 + 메모, 20MB, 목업은 .html 만 |
| 목업 미리보기 | `MockupView.vue` | 별도 창의 최상위 문서로 목업 HTML 을 온전히 띄운다 (열람 티켓 · 그 창의 토큰 제거 · opener 차단) |
| 차트 | `BarChart.vue`, `ColumnChart.vue` | 단일 시리즈, 4px 데이터 엔드, 직접 라벨, `title` 툴팁 |
| 손그림 일러스트 | `HeroDoodle.vue` | 인라인 SVG, `currentColor` 스트로크 1.6px, 에셋 0 |
| 히어로 루프 영상 | `HeroSequence.vue` | 클레이 캐릭터 2명(요청자 코랄·AX-BRM 틸) 상담 장면 11.5초 mp4(427KB, 960×640) — 첫/끝 프레임 동일 + 0.5s 크로스페이드로 무단절 루프. 자막·글자 없음, autoplay muted loop playsinline + poster, reduced-motion 이면 poster 만. 원본 스틸: `landing_image/clay-*.png` |

## 7. Motion

이징 2종(`--ease-out`, `--ease-spring`)만. 진입은 `.rise` 스태거(0.05s 간격, transform/opacity 만). FAQ 아코디언은 `grid-template-rows: 0fr→1fr`. 완료 체크는 SVG 스트로크 드로우 0.7s. `prefers-reduced-motion` 단축 가드 전역. 랜딩도 **표준 모션**(연출형 아님) — Q3 "가끔 쓰는 사용자" 판정.

## 8. Voice & Tone

- 페르소나: **옆자리 베테랑 사수 = AX-BRM 상담사**. 지시가 아니라 도움. 친근한 존댓말 ~요체.
- 요청자 화면에서 로드맵 용어(Case B, BDP, AI-HUB…)를 **직접 쓰지 않는다**. `shared/glossary.js` 의 쉬운 말·비유를 쓰고, BRM 용어는 판정 패널 `internal` 모드(BRM 화면)에만 작은 모노 글씨로 병기.
- 버튼은 결과가 보이는 동사: "5분 상담 시작하기", "정리된 요약 보기 →", "AX-BRM에 신청하기", "이어하기".
- 이모지 역할 고정: 💡 팁 · ✨ 성공 · ⚠️/🚨 경고 · 💬 코칭/대화 · 🔍 확인 필요 · 🖥️ 목업.
- "잘 모르겠어요"는 항상 선택지에 있고, 고르면 **질책이 아니라 "함께 확인해요"**로 응답한다.
- 에러는 상태코드가 아니라 행동으로: `src/services/api.ts humanMessage`.

## 9. Do's and Don'ts (프로젝트 고유)

- ✅ 새 질문은 `shared/questions.js` 에만 추가하고 `QUESTIONNAIRE_VERSION` 을 올린다. 화면은 자동 반영된다.
- ✅ 판정 규칙 변경은 `shared/rules.js` + `tests/rules.test.js` 를 같은 커밋에서.
- ✅ 파스텔 카드는 표면에만. 파스텔 위 텍스트는 항상 `--text/--text-sub`.
- ❌ 페이지 배경에 순백 금지. ❌ 질문 흐름 중간에 경고 삽입 금지. ❌ 요청자 화면에 내부 용어 노출 금지.
- ❌ SSO 토큰을 URL·localStorage 에 두지 않는다(`ssoToken.ts` 단일 모듈). ❌ `popup.html` 을 운영 산출물에 포함하지 않는다(빌드 플러그인이 삭제).

## 10. Known Gaps

- **다크 모드 미정의** — 역할 토큰 레이어는 준비돼 있으나(`--bg/--surface/--text…`) 다크 값은 없음.
- **모바일 최적화 검토 전** — 768px 까지는 동작하나 사내 PC(1366×768) 기준으로 설계. 480px 이하 미검증.
- **지원 브라우저 기준선 미확인** — 폐쇄망 PC 의 Edge/Chrome 버전 확인 전. `backdrop-filter`, `text-wrap: balance`, `scrollbar-gutter` 는 장식(프로그레시브)로만 사용 중.
- **PostgreSQL 어댑터 실행 검증 전** — `server/db/pg.js` 는 스펙대로 작성했으나 로컬에 PG 가 없어 SQLite 만 검증됨.
- 마루부리 폰트 미적용(Noto Serif KR 대체). 목업 zip(다중 파일) 미지원 — 단일 HTML 만.
- 복도 테스트(§17) 미실시.
