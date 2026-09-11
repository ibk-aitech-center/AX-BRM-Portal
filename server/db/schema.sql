-- AX-BRM 요청 접수 — 스키마 (SQLite / PostgreSQL 공용 · 이식성 우선)
-- 시각은 ISO-8601 TEXT, JSON 은 TEXT 로 저장한다.

CREATE TABLE IF NOT EXISTS users (
  employee_no     TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  org_cd          TEXT,
  org_nm          TEXT,
  position        TEXT,                                -- 직책 (토큰 position 클레임 · 없으면 NULL)
  role            TEXT NOT NULL DEFAULT 'requester',   -- requester | brm | data_brm | admin
  created_at      TEXT NOT NULL,
  last_login_at   TEXT
);

-- HR 인사 미러 — 인사 MariaDB tbl_employee_adv 의 부분 복사 (server/hrSync.js 가 full-replace)
-- position(직책)의 원천. DU90(외주)만 제외하고 DU16(그룹장/부행장)은 포함한다.
CREATE TABLE IF NOT EXISTS tbl_employee_adv (
  emp_no      TEXT PRIMARY KEY,   -- 사번 (SSO JWT id 클레임과 동일)
  emp_nm      TEXT,               -- 직원명
  abnm_jtm    TEXT,               -- 직위명(직급) → users.position
  ducd        TEXT,               -- 직책코드 (DU90=외주 제외)
  blng_brcd   TEXT,               -- 부서코드
  blng_nm     TEXT,               -- 부서명
  beteam_cd   TEXT,               -- 팀코드 (BRM 권한 규칙 hr_code 매칭용)
  beteam_nm   TEXT,               -- 팀명 (담당자 관리 화면 표시용)
  ofor_sqc    INTEGER,            -- 조직 정렬순서 (담당자 지정 목록 정렬 1차 키)
  emp_rost_sqc INTEGER,           -- 직원 정렬순서 (담당자 지정 목록 정렬 2차 키)
  ogzn_attcd  TEXT,               -- 조직속성코드 → 본부부서 판정(HQ_OGZN_ATTCDS): 요청 자격
  synced_at   TEXT                -- 미러 동기화 시각 (ISO)
);

-- 1회성 플래그 저장 (예: admin_seed_done — 시스템 관리자 초기 시드 완료)
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS requests (
  id                      TEXT PRIMARY KEY,
  req_no                  TEXT UNIQUE,                 -- BRM-2026-0001 (신청 시 발급)
  title                   TEXT,
  status                  TEXT NOT NULL,               -- shared/statuses.js
  channel                 TEXT,
  requester_employee_no   TEXT NOT NULL,
  requester_name          TEXT,
  requester_org_cd        TEXT,                        -- 신청 시점 스냅샷 (통계용)
  requester_org_nm        TEXT,
  requester_position      TEXT,                        -- 신청 시점 직책 스냅샷
  questionnaire_version   TEXT NOT NULL,
  answers                 TEXT NOT NULL,               -- JSON
  judgement               TEXT,                        -- JSON (신청 시 스냅샷)
  assignee_employee_no    TEXT,                        -- 실제 진행할 AX-BRM 담당자 (검토 화면에서 지정 · NULL = 미지정)
  assignee_name           TEXT,                        -- 지정 시점 이름·직위 스냅샷
  assignee_position       TEXT,
  assigned_at             TEXT,
  closure_deploy          TEXT,                        -- 완료 시 종결 분류 · 배포 위치 (shared/closure.js CLOSURE_DEPLOY 키)
  closure_form            TEXT,                        -- 완료 시 종결 분류 · 완성 형태 (CLOSURE_FORM 키)
  closed_at               TEXT,                        -- 완료(done) 처리 시각
  submitted_at            TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester_employee_no);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_submitted ON requests(submitted_at);

CREATE TABLE IF NOT EXISTS request_reviews (
  id                    TEXT PRIMARY KEY,
  request_id            TEXT NOT NULL,
  reviewer_employee_no  TEXT NOT NULL,
  reviewer_name         TEXT,
  decision              TEXT NOT NULL,                 -- accept | hold | guide | reject | note
  feasible              TEXT,                          -- yes | cond | no | tbd
  approach              TEXT,
  opinion               TEXT,
  estimated_weeks_min   INTEGER,
  estimated_weeks_max   INTEGER,
  judgement_override    TEXT,                          -- JSON
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_request ON request_reviews(request_id);

CREATE TABLE IF NOT EXISTS status_history (
  id               TEXT PRIMARY KEY,
  request_id       TEXT NOT NULL,
  from_status      TEXT,
  to_status        TEXT NOT NULL,
  changed_by       TEXT NOT NULL,
  changed_by_name  TEXT,
  note             TEXT,
  changed_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_request ON status_history(request_id);

CREATE TABLE IF NOT EXISTS attachments (
  id                TEXT PRIMARY KEY,
  request_id        TEXT NOT NULL,
  kind              TEXT NOT NULL,                     -- mockup | reference | other
  file_name         TEXT NOT NULL,
  mime              TEXT,
  size              INTEGER NOT NULL,
  storage_path      TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,        -- kind 별 버전 (mockup v1, v2 …)
  note              TEXT,
  uploaded_by       TEXT NOT NULL,
  uploaded_by_name  TEXT,
  uploaded_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_request ON attachments(request_id);

CREATE TABLE IF NOT EXISTS comments (
  id                  TEXT PRIMARY KEY,
  request_id          TEXT NOT NULL,
  author_employee_no  TEXT NOT NULL,
  author_name         TEXT,
  author_role         TEXT,
  body                TEXT NOT NULL,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(request_id);

CREATE TABLE IF NOT EXISTS counters (
  year  INTEGER PRIMARY KEY,
  seq   INTEGER NOT NULL
);
