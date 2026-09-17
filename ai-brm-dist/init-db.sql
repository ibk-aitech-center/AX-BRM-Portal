-- AX-BRM PostgreSQL 초기화 스크립트 (레이아웃: DB.MD)
-- 전제: DB `aibrm` 와 계정 `aibrm` 이 이미 생성돼 있음 (예: CREATE USER aibrm PASSWORD '...'; CREATE DATABASE aibrm OWNER aibrm;)
-- 실행: psql -U aibrm -d aibrm -f init-db.sql
--   ⚠ postgres(슈퍼유저)로 실행하면 테이블 소유자가 postgres 가 되어, 서버 기동 시 경량 마이그레이션
--     (ALTER TABLE)이 "must be owner" 로 실패한다. 반드시 aibrm 계정으로 실행하거나,
--     이미 실행했다면: ALTER TABLE <각 테이블> OWNER TO aibrm; 으로 소유권을 넘겨줄 것.
-- 참고: 서버(server/db/index.js)도 기동 시 같은 스키마를 멱등 적용하므로, 이 파일은 사전 반입 절차용이다.

CREATE TABLE IF NOT EXISTS users (
  employee_no     TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  org_cd          TEXT,
  org_nm          TEXT,
  position        TEXT,
  role            TEXT NOT NULL DEFAULT 'requester',
  created_at      TEXT NOT NULL,
  last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS tbl_employee_adv (
  emp_no      TEXT PRIMARY KEY,
  emp_nm      TEXT,
  abnm_jtm    TEXT,
  ducd        TEXT,
  blng_brcd   TEXT,
  blng_nm     TEXT,
  beteam_cd   TEXT,
  beteam_nm   TEXT,
  ofor_sqc    INTEGER,
  emp_rost_sqc INTEGER,
  ogzn_attcd  TEXT,               -- 조직속성코드: 본부부서 판정(요청 자격) — 2026-09-11
  synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS requests (
  id                      TEXT PRIMARY KEY,
  req_no                  TEXT UNIQUE,
  title                   TEXT,
  status                  TEXT NOT NULL,
  channel                 TEXT,
  requester_employee_no   TEXT NOT NULL,
  requester_name          TEXT,
  requester_org_cd        TEXT,
  requester_org_nm        TEXT,
  requester_position      TEXT,
  questionnaire_version   TEXT NOT NULL,
  answers                 TEXT NOT NULL,
  judgement               TEXT,
  assignee_employee_no    TEXT,
  assignee_name           TEXT,
  assignee_position       TEXT,
  assigned_at             TEXT,
  closure_deploy          TEXT,
  closure_form            TEXT,
  closed_at               TEXT,
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
  decision              TEXT NOT NULL,
  feasible              TEXT,
  approach              TEXT,
  opinion               TEXT,
  estimated_weeks_min   INTEGER,
  estimated_weeks_max   INTEGER,
  judgement_override    TEXT,
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
  kind              TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  mime              TEXT,
  size              INTEGER NOT NULL,
  storage_path      TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
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

-- 미읽음 표시 — 역할 화면 사용자가 요청 상세를 연 시각 (server/unread.js). 기록 없음 = 신규, requests.updated_at > read_at = 업데이트
CREATE TABLE IF NOT EXISTS request_reads (
  request_id  TEXT NOT NULL,
  employee_no TEXT NOT NULL,
  read_at     TEXT NOT NULL,
  PRIMARY KEY (request_id, employee_no)
);

CREATE TABLE IF NOT EXISTS counters (
  year  INTEGER PRIMARY KEY,
  seq   INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- 계정 권한 부여 (가이드 준수 — 맨 아래): aibrm 계정이 aibrm DB 에 접근·사용
-- ─────────────────────────────────────────────────────────────
GRANT CONNECT ON DATABASE aibrm TO aibrm;
GRANT USAGE, CREATE ON SCHEMA public TO aibrm;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO aibrm;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO aibrm;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO aibrm;
