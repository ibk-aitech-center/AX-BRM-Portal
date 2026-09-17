# AX-BRM 포탈 (요청 접수 서비스)

현업 직원이 **쉬운 질문에 답하는 것만으로** AX-BRM 상담 신청서를 완성하고, AX-BRM 은 답변을 로드맵 판정(지원 갈래·데이터 케이스·배포지·연계 방식·예상 기간)으로 자동 번역해 받아 **검토 의견·상태·목업 HTML** 까지 한 곳에서 관리하는 사내 웹 서비스.

- 기획: [PLAN.md](PLAN.md) · 디자인: [DESIGN.md](DESIGN.md) / [preview.html](preview.html) · 원본 로드맵: `ai-brm-roadmap-v0.6.html`
- 전역 지침: `DESIGN_GUIDELINES.md`, `SSO연동가이드.md`

## 구성

```
index.html            SSO 부트스트랩 IIFE (토큰 수신 → sessionStorage → 포탈 이동) — Vue 마운트 전 실행
src/                  Vue 3 + TS SPA
  services/ssoToken   토큰 접근 단일 모듈 · api.ts 거절/네트워크 구분 · draft.ts 자동저장
  views/              Home(랜딩) · Interview · Summary · Done · MyRequests · RequestDetail · brm/{Inbox,Review,Stats,Admin}
  styles/             tokens → base → components → utilities (4레이어)
shared/               클라이언트·서버 공용 도메인 (질문 트리 · 판정 규칙 · 상태 · 용어 사전)
server/               Express 5 API · ssoAuth.js(검증만) · db/{sqlite,pg} 어댑터 · 첨부 저장
tests/                node:test 단위 테스트 + API 스모크
```

## 로컬 실행

```bash
npm install
cp .env.example .env          # SSO_JWT_SIGN 에 32자 이상 임의 문자열(로컬) 또는 포탈 sign 값
npm run dev                   # popup.html 생성 → API(3000) + Vite(5173) 동시 기동
# http://localhost:5173 → 로컬 목업 포탈(popup.html)에서 직원 선택 → 앱 진입
```

- `045345`(김브름)는 부서코드 1094(AX디지털추진부) 규칙으로 **AX-BRM** 역할(관리자 아님). 관리자를 더 추가하려면 `.env` 의 `ADMIN_EMPLOYEE_NOS`.
- DB 기본값은 `node:sqlite`(`./data/ai-brm.sqlite`, 의존성 0). PostgreSQL 은 `DATABASE_URL` 설정 시 사용(`pg` 패키지 필요, 어댑터 실행 검증은 아직 안 됨 — DESIGN.md Known Gaps).

## 테스트

```bash
npm test                      # 판정 규칙(로드맵 트리 1:1) + SSO 검증 모듈
node tests/smoke.api.js       # 서버 기동 상태에서 전 API 구간 스모크 (로그인→신청→검토→목업→통계)
npm run test:e2e              # npm run dev 상태에서 Edge headless 로 화면 전 구간 드라이브 (스크린샷 tests/e2e-shots/)
npm run typecheck             # vue-tsc
```

## HR 인사 미러 (직책 표시)

직책(position)은 SSO 토큰에 없다 — 인사 MariaDB `tbl_employee_adv` 를 우리 DB 미러로 복사해 얻는다
([server/hrSync.js](server/hrSync.js), weekly-ai 방식 축소 이식).

- **원천**: `abnm_jtm`(직위명) → `users.position` → 신청 시 `requests.requester_position` 스냅샷
- **포함 범위**: DU90(외주)만 제외. **DU16(그룹장/부행장)은 포함** — 전 직원이 상담을 요청할 수 있어야 한다
- **동기화**: 서버 기동 시 미러가 비면 채우고, `HR_DB_HOST` 설정 시 매일 07:00 KST 자동 실행.
  수동/cron: `npm run hr:sync`. 드라이버 `mysql2` 는 dependencies 에 포함(weekly-ai 와 같은 3.x) — 운영에는 `.env` 의 `HR_DB_*` 만 채우면 된다.
  원천 컬럼명(emp_no·emp_nm·abnm_jtm·ducd·blng_brcd·blng_nm·beteam_cd·beteam_nm·ofor_sqc·emp_rost_sqc·ogzn_attcd)은 weekly-ai 의 HR 미러와 동일
- **본부부서 전용 (2026-09-11)**: `ogzn_attcd`(조직속성코드)가 `HQ_OGZN_ATTCDS`(0001·0002·0003·0004·0005·0007·0031)인 직원만 상담을 요청할 수 있다.
  판정은 서버가 로그인·API 호출마다 미러를 LEFT JOIN 해 `user.canRequest` 로 내려 주고(역할 무관 — admin·brm 도 같은 규칙, 미러에 없으면 false),
  요청 쓰기 API(생성·초안 저장·신청)는 `requireRequester` 가 403 `HQ_ONLY` 로 막는다. 화면은 랜딩의 상담 시작·프리셋 카드·이어하기와
  `/interview·/summary·/done` 진입을 안내 모달로 돌린다. 내 요청 화면은 안내 배너(본부부서 대상 시스템 · 지식제안으로 진행)를 위에 두고
  규칙 적용 전에 올린 기존 요청은 아래에서 **조회만** 할 수 있다(이어하기·새 상담 버튼 숨김, 상세·대화는 그대로).
  로컬 목업에서는 박영업(062211, 을지로지점 0011)으로 차단 경로를 확인한다.
- **`HR_DB_*` 는 언제 넣나**: 운영 API 컨테이너의 **환경변수**(k8s Secret / `docker run -e`)로, 첫 기동 **전에** 넣는다.
  서버는 부팅 때 `process.env` 만 읽으므로 나중에 추가하면 파드 재시작이 필요하고, `HR_DB_HOST` 가 비어 있으면
  07:00 자동 동기화 스케줄러 자체가 켜지지 않는다. 넣은 뒤 `npm run hr:sync`(또는 담당자 관리 화면의 동기화) 1회로 즉시 채운다.
- **로컬**: `HR_DB_HOST` 미설정이면 목업 직원 10명으로 미러를 시드한다 (popup.html 사번과 1:1)
- **검토 화면 오른쪽 열**은 할 일 순서대로 AX-BRM 담당자 → 검토 의견 등록 → 컨셉 목업 → 요청자와의 대화. 의견 이력·상태 이력은 본문에서 빼고
  헤더의 "이력 N" 버튼으로 여는 서랍(`AppDrawer`)에 한 타임라인(최신 먼저, 전체·의견·상태 필터)으로 합쳤다 — 의견 등록이 상태를 바꾸므로 섞어 봐야 인과가 읽힌다.
  "검토 의견 등록" 카드에는 마지막 의견 한 줄만 남기고 "의견 이력 N건 →" 로 서랍을 연다.
- **컨셉 목업 파일 형식**(2026-09-11): HTML 전용에서 **브라우저가 바로 여는 파일**로 확장 — html · htm · png · jpg · jpeg · gif · webp · svg · pdf (`shared/mockupTypes.js` 한 표를 클라이언트 검증·accept·서버 검증·미리보기 Content-Type 이 같이 쓴다).
  동영상(mp4·webm)·오피스·zip 은 목업 불가(참고 자료로). 이미지·PDF 는 별도 뷰어 없이 원본 그대로 새 창에 연다. 미리보기 Content-Type 은 저장된 MIME 이 아니라 확장자 표로 정한다(위장 파일 방지).
- **담당자 지정**: 검토 화면의 "AX-BRM 담당자" 카드에서 **의견·상태 변경 없이 담당자만** 저장한다(`POST /api/requests/:id/assignee`).
  흐름은 담당자 지정 → 지정된 담당자가 아래 "검토 의견 등록"에서 의견 작성. 후보 = 미러의 부점코드 `1094` 직원 중 DU22(부장) 제외,
  정렬은 `ofor_sqc`(조직) → `emp_rost_sqc`(직원) → 이름. 지정 결과는 `requests.assignee_*` 에 스냅샷으로 남고 요청자 화면·접수함에 보이며
  상태 이력에 `담당자 지정: 이름 직위` 로 남는다(미지정이면 "담당자 미지정"). 규칙은 `server/hrSync.js` 의 `ASSIGNEE_RULE`.
- **완료 처리 · 종결 분류**: 개발 중 → 완료로 넘길 때 담당자가 **배포 위치**(바이브 랩스·AI Hub 플랫폼·Geni 특화서비스·기존 시스템 연계·배포 안 함)와
  **완성 형태**(컨셉 확인·실데이터 PoC·서비스 구축)를 반드시 고른다(`POST /:id/status` body `closure`, 없으면 400 `CLOSURE_REQUIRED`).
  `requests.closure_deploy/closure_form/closed_at` 에 저장, 이력에 `종결 분류: 배포 위치 · 완성 형태` 로 남는다. 완료 후엔 검토 화면 "종결 분류" 카드에서
  정정(`POST /:id/closure`, 완료 상태가 아니면 409), 완료에서 되돌리면 분류는 비운다. 키·라벨은 [shared/closure.js](shared/closure.js)
- **접수함 조회 조건**: 부서·계기·유형·**AX-BRM 담당자**는 타이핑으로 걸러 고르는 콤보([ComboSelect](src/components/ComboSelect.vue), 라이브러리 없음).
  담당자는 지정된 적 있는 담당자(건수)와 "담당자 미지정"(`assignee=none`) — 후보는 `GET /api/requests/meta` 의 `assignees`/`unassigned`
- **통계 화면**: "담당자별 처리 현황"(담당자마다 대기·진행·완료·정체 띠, 완료 건수·목업 제공·완료까지 평균 일수, 미지정 건은 맨 아래)과
  "완료 건 종결 분류"(컨셉 목업 제공 여부, 배포 위치·완성 형태 분포, 배포 위치 × 완성 형태 교차표). CSV 는 요청자·AX-BRM담당자를 `이름 직위` 한 셀로,
  목업제공(Y/N)·배포위치·완성형태·완료일시 컬럼 포함
- **안전장치**: full-replace 는 한 트랜잭션(실패 시 기존 미러 유지), 조회 결과가 기존의 50% 미만이면
  중단(`HR_SYNC_ALLOW_SHRINK=1` 로 강행), 조회 타임아웃 120초
- **역할 자동 갱신** (2026-09-08 규칙): 동기화 때마다 ① 팀코드 `8476`(AX-BRM팀) 전원 + 부서코드 `1094` 의 부장(DU22) → **admin**,
  ② 나머지 `1094` 소속 전원 → **brm**, ③ 어느 규칙에도 안 맞는 brm → requester 로 회수. **admin 은 자동 회수하지 않는다**
  (시드 관리자 보호 — 해제는 관리 화면에서 수기). data_brm·group_planner 는 건드리지 않는다. **수기 역할 변경은 다음 동기화 때 규칙대로 되돌아간다**.
  규칙 상수는 `ADMIN_TEAM_CODES` · `ADMIN_DEPT_HEAD_RULES` · `BRM_DEPT_CODES` (server/hrSync.js)
- **시스템 관리자**: 024498·044692 는 최초 기동 시 **1회만** admin 으로 시드(`app_meta` 플래그).
  이후 변경은 관리 화면에서 수기로만 한다

## 빌드 · 배포 (AI-HUB, 폐쇄망)

```bash
npm run build                 # vue-tsc + vite build → dist/ (popup.html 자동 삭제)
NODE_ENV=production node server/index.js    # dist 정적 서빙 + SPA 폴백 + /api
```

- **내부망 반입 묶음**은 [ai-brm-dist/](ai-brm-dist/) — 목록은 [ai-brm-dist/반입목록.md](ai-brm-dist/반입목록.md), 시스템 담당자용 절차는 [ai-brm-dist/배포지시서.md](ai-brm-dist/배포지시서.md).
  내부망은 **가이드 방식**(base 이미지 tar + `dist.zip`, 시스템팀이 내부망에서 빌드)으로 배포한다 — 완성 이미지 tar 는 반입하지 않는다.
  만들기: `sh scripts/make-dist.sh` → `ui.tar.gz`(vite 빌드) + `app.tar.gz`(가이드의 app.jar 대응: 빈 폴더에서 `npm ci --omit=dev` 한 운영 `node_modules` 포함 — 폰트 패키지는 빌드 전용이라 devDependencies)
  + `Dockerfile` · `start.sh` · `nginx.conf` · `build.sh` · `create-db.sql` · `init-db.sql` · `k8s/` → `dist.zip`, `CHECKSUMS.md5`.
  **이미지는 1개**(`ai-brm:<ver>` = nginx 80 + Node API 3000): 내부망은 `unzip dist.zip && sh build.sh <ver>`(= dist.zip 루트에서 `docker build --network none -t ai-brm:<ver> .`).
  `docker/Dockerfile` 이 `ADD` 로 두 tar 를 풀고 npm 을 부르지 않으므로 npm 미러·인터넷 불필요. 컨테이너 안에서 `/app/start.sh` 가 nginx 와 node 를 함께 띄우고(하나가 죽으면 컨테이너 종료),
  nginx 가 `/api/` 를 `127.0.0.1:3000` 으로 넘긴다. 사내 플랫폼 배포 템플릿이 args 로 `/app/start.sh` 를 넘겨도 그대로 뜬다(2026-09-07 1차 배포에서 이 파일이 없어 `MODULE_NOT_FOUND` 로 죽었던 문제의 해결).
  k8s 매니페스트는 [k8s/](k8s/) (Secret · ConfigMap · PVC · Deployment · Service · Ingress, 파일명 순 = 적용 순). dist.zip 에 그대로 동봉되며 `<registry>` `<host>` 와 Secret 값만 채워 `kubectl apply -f k8s/`. 검증: `docker run --rm -v $PWD/k8s:/k8s ghcr.io/yannh/kubeconform -strict /k8s`.
- 외부 CDN 0개 — Pretendard·Noto Serif KR·D2Coding 모두 로컬 번들.
- 포탈 운영팀 협의: 팝업 경로 등록(`VITE_SSO_PORTAL_PROD/DEV` — 개발계 `http://devaiportal.ibk.co.kr/portal/link/aibrm/popup`, 운영계 `http://aiportal.ibk.co.kr/portal/link/aibrm/popup`, 2026-09-07 확정), 리디렉트 `https://<host>/?token=`, sign 문자열 수령(`SSO_JWT_SIGN`).
- 포탈로 **자동 이동은 토큰이 없을 때만**(index.html IIFE · `bootstrapSession`). 토큰이 있는데 서버가 거절(401/400)하면 폐기만 하고 "다시 로그인이 필요해요" 화면에서 사용자가 "포탈로 이동"을 눌러야 간다 — 토큰을 들고 되돌려 보내면 포탈 ↔ 앱 루프가 되기 때문(`redirectToPortal` 은 토큰이 있으면 no-op, `force` 는 버튼·로그아웃 전용).
- 보호 API 는 호출마다 Bearer 재검증. BRM 여부는 DB `users.role`(토큰 role 미사용). 첨부는 `UPLOAD_DIR` 디스크 + DB 메타.
- HR 미러링 때 **미러의 전 직원이 로그인 전에 users 에 미리 등록**(`syncRoles` provisioned — 규칙대로 admin/brm/requester) → 관리자가 로그인 전에 역할을 줄 수 있고 첫 로그인부터 적용. 관리자는 미접속 직원도 검색해 역할을 줄 수 있다(`provisionUserFromMirror`). 첫 로그인 역할은 `roleForNewLogin`(미러 규칙). 로그아웃 버튼은 로컬 개발(`import.meta.env.DEV`)에서만 — 운영은 포탈 SSO.
- 배포 번들은 `scripts/make-dist.sh` 가 `NODE_ENV=production` 을 셸에서 못박고 빌드한다 — `.env` 의 `NODE_ENV=development` 는 로컬 개발 서버용인데 `vite build` 에도 적용돼 개발 런타임이 운영 번들에 들어간 적이 있다(2026-09-08). 로컬에서 `npm run build` 만 따로 돌릴 때도 같은 함정에 주의.
- 신청된 요청의 삭제는 시스템 관리자만(`DELETE /api/requests/:id`, 접수함 상세 상단의 "접수 삭제" 버튼, 접수번호 재입력 확인). 의견·이력·첨부 파일·대화를 함께 지우고 서버 로그에 남긴다. 초안은 작성자 본인이 지운다.
- 역할 일괄 변경: `POST /api/admin/users/bulk-role` { employeeNos, role } — 담당자 관리에서 검색 결과를 체크해 한 번에. 규칙은 단건과 같다(미접속은 미러로 등록, 자기 관리자 강등 불가).
- 역할 5종: `requester` · `brm`(AX-BRM, HR 동기화가 재계산) · `data_brm`(**DATA-BRM 조회 전용**, 관리자가 수기 부여 — "행내 데이터가 필요한가요?"에 네/모르겠어요로 답한 요청만 `/data` 에서 조회, 접수 시 메신저 알림 1회, 쓰기 API 전부 403) · `group_planner`(**그룹기획 접수현황 조회 전용**, 수기 부여 — 신청된 **모든** 건을 `/status` 에서 조회, 알림 없음, 쓰기 API 전부 403) · `admin`. 판정 기준은 `server/dataBrm.js` · `server/groupPlanner.js` 한 곳씩.
- 목업은 **`.html` 확장자만** 업로드(클라이언트·서버 양쪽 검사). 미리보기는 `/mockup/:id` 를 **별도 창(window.open)** 으로 열고,
  그 창의 부트스트랩(MockupView)이 `POST /api/attachments/:id/view-ticket`(Bearer)로 **10분짜리 열람 티켓**을 받은 뒤 그 창의 SSO 토큰을 지우고 opener 를 끊고서
  `GET /api/attachments/:id/view?t=…` 를 최상위 문서로 연다 — sandbox iframe 이 아니라 목업의 localStorage·모달·폼이 온전히 동작한다 (2026-09-09).
  티켓은 첨부 id·사번에 묶인 HMAC(`server/mockupTicket.js`)이고 열 때 권한을 다시 확인한다. 토큰은 URL 에 싣지 않는다.

### 사내 메신저 알림 (IBK톡)

AI 포탈(aihub)의 `AlarmCall.java` 와 같은 AnnounceService 규약을 `server/notify.js` 가 Node `fetch` 로 그대로 재현한다
(`POST` form-urlencoded · `SRV_CODE, RECIPIENT="E:"+사번, SEND, TITLE, BODY, LINKTXT, LINKURL` · 사번은 맨 앞 `0` 하나 제거 · 수신자 1명당 1회).

| 시점 | 발신 | 수신 | 문구 |
|---|---|---|---|
| 요청자가 신청을 확정했을 때 | 요청자 | **관리자(admin) 전원만** — 발송 시점의 `users.role` 기준. AX-BRM(brm) 은 받지 않는다 (담당자로 지정될 때만 받음). HR 미러 규칙·부서코드로는 보내지 않는다 | 신규 AX-BRM 요청건이 있습니다 |
| 담당자를 지정했을 때 | 지정한 사람(관리자·BRM) | 지정된 담당자 — AX-BRM 이 메신저를 받는 유일한 접수 경로 | AX-BRM 담당자로 지정되었습니다 |
| 요청자가 문의·대화를 남겼을 때 | 요청자 | 지정된 담당자 (미지정이면 안 보냄 · BRM 답글은 안 보냄) | 요청자가 문의·대화를 남겼습니다 |

- **켜는 조건**: `ALARM_URL` 과 `ALARM_SRV_CODE` 둘 다 있을 때만 실제 발송. 하나라도 비면(로컬·검증) 호출 없이 `[notify] (비활성 …)` 로그만 남기고 성공 처리.
- 알림은 부가 기능 — 응답을 보낸 뒤 fire-and-forget 으로 부르고, 타임아웃(`ALARM_TIMEOUT_MS`, 기본 5초)·HTTP 오류·예외는 `[notify]` 로그로만 남긴다. 신청·지정 처리는 영향받지 않는다.
- 예외는 **담당자 지정**: 화면 토스트가 실제 발송 여부를 보여줘야 해서 응답 전에 결과를 기다리고 `notified`(`sent`·`failed`·`disabled`·`skipped`)로 돌려준다. 실패·비활성이면 "직접 알려주세요" 경고 토스트. 지정 자체는 알림과 무관하게 커밋된다.
- `APP_URL`(운영 도메인)이 있으면 알림 링크(`/brm/requests/:id`)의 기준 주소로 쓰고, 없으면 요청 헤더(`x-forwarded-host`)로 만든다.
- **운영 전 준비**: ① 메신저 운영팀에서 AX-BRM 용 `SRV_CODE` 발급 (샘플의 `AIHAIH` 는 AI 포탈 것 — 그대로 쓰면 안 된다) ② API 파드 → 메신저 서버(내부망 `:8010`) 네트워크 허용 ③ 발신자 사번이 메신저에 실제 존재해야 한다.
- 문구는 `server/notify.js` 의 `MESSAGES` 한 곳에서만 바꾼다. 규약 테스트: `tests/notify.test.js`.

### 오픈 전 신청 데이터 초기화

리얼테스트 데이터를 통째로 지울 때는 단건 삭제 대신 **담당자 관리 화면 맨 아래 "신청 데이터 전체 초기화"**(관리자 · 확인 문구 `초기화` 입력)
또는 CLI `npm run reset:requests`(= `server/scripts/reset-requests.js`)를 쓴다. 둘 다 `server/resetRequests.js` 를 부른다.
단건 삭제는 접수번호 카운터(`counters`)를 되감지 않아 번호가 건너뛰지만, 전체 초기화는 카운터까지 비워 다음 신청이 `BRM-YYYY-0001` 부터 시작한다.

- API: `GET /api/admin/reset-requests`(지울 건수) · `POST /api/admin/reset-requests` { confirm: "초기화" }. 실행자는 `[reset]` 경고 로그로 남는다.
- CLI 는 인자 없이 실행하면 **dry-run**(지울 건수만 출력). `--yes` 를 붙여야 실제로 지운다. 되돌릴 수 없으니 `pg_dump` 백업 후 실행.
- 지움: requests · request_reviews · status_history · comments · attachments(+ `UPLOAD_DIR` 실제 파일) · counters. 남김: users(역할) · HR 미러 · app_meta.
- 운영(k8s): `kubectl exec deploy/ai-brm -- node server/scripts/reset-requests.js --yes` (파드 안에서 돌려야 DATABASE_URL·UPLOAD_DIR 이 같다)

### 재배포해도 데이터가 남으려면 (필수 점검)

컨테이너 이미지 안에는 데이터가 없다. 아래 둘이 컨테이너 밖에 있어야 재배포·재기동 때 유실이 없다.

| 데이터 | 어디에 | 안 하면 |
|---|---|---|
| 상담·이력·사용자·HR 미러 | **PostgreSQL** (`DATABASE_URL`) — DB 자체도 PVC/StatefulSet 또는 외부 DB | `DATABASE_URL` 이 비면 운영 서버는 **기동을 거부**한다(SQLite 로 조용히 떨어져 재배포 때 전부 사라지는 사고 방지). 정말 SQLite 를 쓰려면 `/app/data` 를 PVC 로 붙이고 `DB_ALLOW_SQLITE=1` |
| 첨부 파일 | **`/app/data` 에 PVC 마운트** (`UPLOAD_DIR=/app/data/uploads`) | 첨부만 사라지고 DB 메타는 남아 다운로드가 404. 기동 로그에 `[storage] ⚠ … 별도 볼륨이 아니에요` 경고, `/api/health` 의 `uploads.separateVolume: false` |

- 스키마는 `CREATE TABLE IF NOT EXISTS` + 컬럼 추가형 마이그레이션만 있어 재기동이 기존 데이터를 지우지 않는다. `DROP`/`TRUNCATE` 없음.
  HR 미러 교체(`DELETE`+`INSERT`)는 한 트랜잭션이고 절반 이하로 줄면 중단한다(`HR_SYNC_ALLOW_SHRINK`). `users`·`requests` 는 건드리지 않는다.
- `/api/health` 는 DB 쿼리 + 첨부 폴더 쓰기까지 확인해 둘 다 되면 200, 아니면 503 — k8s readiness/liveness 프로브로 쓴다.
- 백업: PG 는 `pg_dump aibrm`, 첨부는 PVC 스냅샷(또는 `/app/data/uploads` tar). 둘을 같은 시점에 받아야 메타와 파일이 맞는다.
- 볼륨은 `ReadWriteOnce` 면 API 파드 1개(`replicas: 1`, `strategy: Recreate`)로 운영한다. 파드를 여러 개 띄우려면 `ReadWriteMany` 스토리지가 필요하다.

## 질문·판정 규칙 바꾸기

1. `shared/questions.js` — 질문 추가/수정 후 `QUESTIONNAIRE_VERSION` 올리기 (요청은 답변 당시 버전을 저장).
2. `shared/rules.js` — 판정 함수. 3. `tests/rules.test.js` 갱신 후 `npm test`.
