/**
 * DB 계층 — 어댑터 인터페이스 하나로 SQLite(기본) / PostgreSQL 을 바꿔 쓴다.
 * SQL 은 `?` 플레이스홀더, ISO TEXT 시각, JSON TEXT 로 이식성을 유지한다.
 *
 * @typedef {Object} DbAdapter
 * @property {'sqlite'|'pg'} kind
 * @property {(sql:string)=>Promise<void>} exec
 * @property {(sql:string, params?:any[])=>Promise<any[]>} all
 * @property {(sql:string, params?:any[])=>Promise<any|null>} get
 * @property {(sql:string, params?:any[])=>Promise<{changes:number}>} run
 * @property {(fn:(tx?:DbAdapter)=>Promise<any>)=>Promise<any>} transaction
 * @property {()=>Promise<void>} close
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import { createSqlite } from './sqlite.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {DbAdapter} */
export let db;

export async function initDb() {
  if (env.DATABASE_URL) {
    const { createPg } = await import('./pg.js');
    db = await createPg(env.DATABASE_URL);
  } else {
    // 운영에서 DATABASE_URL 이 빠지면 조용히 SQLite 로 떨어져 컨테이너 재배포 때 상담 데이터가 통째로 사라진다.
    // 그래서 운영은 명시적으로 허용(DB_ALLOW_SQLITE=1, SQLITE_PATH 가 PVC 위에 있을 때만)하지 않으면 기동을 거부한다.
    if (env.isProd && env.DB_ALLOW_SQLITE !== '1') {
      throw new Error(
        '[db] 운영(NODE_ENV=production)인데 DATABASE_URL 이 비어 있어요. ' +
        'PostgreSQL 접속 문자열을 넣어 주세요 (예: postgres://aibrm:<pw>@<host>:5432/aibrm). ' +
        `SQLite(${env.SQLITE_PATH})를 정말 운영에 쓰려면 그 경로가 영구 볼륨(PVC)인지 확인한 뒤 DB_ALLOW_SQLITE=1 을 함께 설정하세요.`,
      );
    }
    db = createSqlite(env.SQLITE_PATH);
  }
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await db.exec(schema);
  // 경량 마이그레이션 — 기존 DB 에 없는 컬럼 추가 (이미 있으면 무시)
  for (const ddl of [
    'ALTER TABLE users ADD COLUMN position TEXT',
    'ALTER TABLE requests ADD COLUMN requester_position TEXT',
    'ALTER TABLE tbl_employee_adv ADD COLUMN beteam_cd TEXT',
    'ALTER TABLE tbl_employee_adv ADD COLUMN beteam_nm TEXT',
    // 담당자 지정 목록 정렬 키 (2026-09-04) — 다음 HR 동기화 때 채워진다
    'ALTER TABLE tbl_employee_adv ADD COLUMN ofor_sqc INTEGER',
    'ALTER TABLE tbl_employee_adv ADD COLUMN emp_rost_sqc INTEGER',
    // 본부부서 판정용 조직속성코드 (2026-09-11) — 다음 HR 동기화 때 채워진다
    'ALTER TABLE tbl_employee_adv ADD COLUMN ogzn_attcd TEXT',
    // AX-BRM 담당자 지정 (2026-09-04)
    'ALTER TABLE requests ADD COLUMN assignee_employee_no TEXT',
    'ALTER TABLE requests ADD COLUMN assignee_name TEXT',
    'ALTER TABLE requests ADD COLUMN assignee_position TEXT',
    'ALTER TABLE requests ADD COLUMN assigned_at TEXT',
    // 완료 시 종결 분류 (2026-09-04) — 배포 위치 · 완성 형태 · 완료 시각
    'ALTER TABLE requests ADD COLUMN closure_deploy TEXT',
    'ALTER TABLE requests ADD COLUMN closure_form TEXT',
    'ALTER TABLE requests ADD COLUMN closed_at TEXT',
    // 컨셉 목업 상태 폐지(2026-09-03) — 기존 행은 진행 확정으로 되돌린다 (멱등)
    "UPDATE requests SET status = 'accepted' WHERE status = 'mockup'",
    "UPDATE status_history SET to_status = 'accepted' WHERE to_status = 'mockup'",
    "UPDATE status_history SET from_status = 'accepted' WHERE from_status = 'mockup'",
  ]) { try { await db.exec(ddl); } catch { /* duplicate column */ } }
  console.log(`[db] ${db.kind} ready${db.kind === 'sqlite' ? ` (${env.SQLITE_PATH})` : ''}`);
  return db;
}

export const nowIso = () => new Date().toISOString();

/** JSON 컬럼 파서 (null 안전) */
export function parseJson(text, fallback = null) {
  if (text === null || text === undefined || text === '') return fallback;
  if (typeof text === 'object') return text;
  try { return JSON.parse(text); } catch { return fallback; }
}

/**
 * 접수번호 발급: BRM-YYYY-NNNN. counters 테이블 upsert (SQLite 3.35+/PG 공용 문법)
 * @param {DbAdapter} conn
 */
export async function nextReqNo(conn, year = new Date().getFullYear()) {
  const row = await conn.get(
    `INSERT INTO counters(year, seq) VALUES (?, 1)
     ON CONFLICT(year) DO UPDATE SET seq = counters.seq + 1
     RETURNING seq`,
    [year],
  );
  return `BRM-${year}-${String(row.seq).padStart(4, '0')}`;
}
