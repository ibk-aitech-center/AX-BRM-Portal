| ogzn_attcd | TEXT | 조직속성코드 — **본부부서 판정**(`HQ_OGZN_ATTCDS`: 0001·0002·0003·0004·0005·0007·0008·0031). 이 값인 직원만 상담을 요청할 수 있다. users 로 복사하지 않고 로그인·API 마다 LEFT JOIN 해 판정 |
# AX-BRM 데이터베이스 레이아웃

운영 DB: **PostgreSQL** (DB명 `aibrm` / 계정 `aibrm`). 개발 기본은 `node:sqlite` 파일 DB이며 스키마는 양쪽 공용이다
([server/db/schema.sql](server/db/schema.sql) — 시각은 ISO-8601 TEXT, JSON 은 TEXT 저장, 이식성 우선).
테이블 생성·권한 스크립트: [ai-brm-dist/init-db.sql](ai-brm-dist/init-db.sql).

## users — 사용자 (SSO 로그인 시 JIT 생성)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| employee_no | TEXT PK | 사번 (SSO JWT `id` 클레임) |
| name | TEXT NOT NULL | 이름 (토큰 기준, 로그인마다 갱신) |
| org_cd / org_nm | TEXT | 부서 코드/명 (토큰 기준) |
| position | TEXT | 직책 — HR 미러(`tbl_employee_adv.abnm_jtm`)에서 채움 |
| role | TEXT NOT NULL | `requester` \| `brm` \| `data_brm` \| `admin` — brm 은 HR 동기화가 재계산, data_brm(DATA-BRM 조회 전용)·admin 은 수기 |
| created_at / last_login_at | TEXT | ISO-8601 |

## tbl_employee_adv — HR 인사 미러 (매일 07:00 full-replace)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| emp_no | TEXT PK | 사번 |
| emp_nm | TEXT | 직원명 |
| abnm_jtm | TEXT | 직위명(직급) → users.position |
| ducd | TEXT | 직책코드 (DU90 외주만 제외, DU16 포함) |
| blng_brcd / blng_nm | TEXT | 부서코드/명 |
| beteam_cd / beteam_nm | TEXT | 팀코드 (BRM 권한 hr_code 매칭) / 팀명 |
| ofor_sqc / emp_rost_sqc | INTEGER | 조직 정렬순서 / 직원 정렬순서 — 담당자 지정 목록 정렬 키 (NULL 은 맨 뒤) |
| synced_at | TEXT | 동기화 시각 |

## app_meta — 1회성 플래그 (key-value)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| key | TEXT PK | 예: `admin_seed_done` |
| value | TEXT | 값(시각 등) |

## requests — 상담 요청 (핵심 테이블)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK | UUID |
| req_no | TEXT UNIQUE | 접수번호 `BRM-YYYY-NNNN` (신청 시 발급) |
| title / status / channel | TEXT | 제목 · 상태(shared/statuses.js 9종) · 시작 계기 |
| requester_employee_no | TEXT NOT NULL | 요청자 사번 |
| requester_name / _org_cd / _org_nm / _position | TEXT | **신청 시점 스냅샷** (통계·이력 보존용) |
| questionnaire_version | TEXT NOT NULL | 답변 당시 질문 버전 |
| answers / judgement | TEXT | JSON — 답변 · 자동 판정 스냅샷 |
| assignee_employee_no | TEXT | 실제 진행할 AX-BRM 담당자 사번 (검토 화면 "AX-BRM 담당자" 카드에서 의견 없이 단독 저장 · `POST /:id/assignee`, NULL = 미지정). 후보 = 미러의 부서코드 1094 중 DU22 제외 |
| assignee_name / assignee_position / assigned_at | TEXT | 지정 시점 이름·직위 스냅샷 · 지정 시각 |
| closure_deploy / closure_form | TEXT | 완료(done) 처리 때 담당자가 고르는 종결 분류 — 배포 위치(`vibelabs·aihub·geni·legacy·none`) · 완성 형태(`concept·poc·service`). 키·라벨은 `shared/closure.js`. 완료 전이 시 필수(`CLOSURE_REQUIRED`), 완료 후 `POST /:id/closure` 로 정정 |
| closed_at | TEXT | 완료 처리 시각 (개발 중으로 되돌리면 NULL) |
| submitted_at / created_at / updated_at | TEXT | ISO-8601 |

인덱스: requester_employee_no, status, submitted_at

## request_reviews — BRM 검토 의견

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | TEXT PK / request_id | 소속 요청 |
| reviewer_employee_no / reviewer_name | TEXT | 검토자 |
| decision | TEXT NOT NULL | accept \| hold \| reject \| note (guide 는 2026-09-07 제거 — 과거 행에만 남음) |
| feasible | TEXT | yes \| cond \| no \| tbd |
| approach / opinion | TEXT | 진행 방식 · 의견 (요청자 공개) |
| estimated_weeks_min / _max | INTEGER | BRM 예상 기간(주) |
| judgement_override | TEXT | JSON — 자동 판정 조정 |
| created_at | TEXT | |

## status_history — 상태 전이 이력

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id / request_id | TEXT | |
| from_status / to_status | TEXT | 전이 (to NOT NULL) |
| changed_by / changed_by_name / note | TEXT | 수행자 · 메모 |
| changed_at | TEXT | |

## attachments — 첨부 (파일 본문은 디스크 `UPLOAD_DIR`, DB 는 메타만)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id / request_id | TEXT | |
| kind | TEXT NOT NULL | mockup(BRM 전용) \| reference(요청자 전용) — other 는 폐지(레거시 표시만) |
| file_name / mime / size | TEXT/INTEGER | |
| storage_path | TEXT NOT NULL | UPLOAD_DIR 기준 상대 경로 (k8s PVC: /app/data) |
| version | INTEGER | kind 별 자동 증가 (목업 v1, v2 …) |
| note / uploaded_by / uploaded_by_name / uploaded_at | | |

## comments — 요청자·BRM 대화

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id / request_id | TEXT | |
| author_employee_no / author_name / author_role | TEXT | |
| body / created_at | TEXT | |

## counters — 접수번호 발급기

| 컬럼 | 타입 | 설명 |
|---|---|---|
| year | INTEGER PK | 연도 |
| seq | INTEGER NOT NULL | 연도별 일련번호 (upsert `ON CONFLICT … RETURNING`) |
