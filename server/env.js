// .env 로더 — 외부 의존성 없이. 이미 설정된 process.env 는 덮어쓰지 않는다.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), '.env');
if (fs.existsSync(file)) {
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export const env = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  SSO_JWT_SIGN: process.env.SSO_JWT_SIGN || '',
  SSO_CLOCK_SKEW_SECONDS: Number(process.env.SSO_CLOCK_SKEW_SECONDS || 60),
  DATABASE_URL: process.env.DATABASE_URL || '',
  SQLITE_PATH: process.env.SQLITE_PATH || './data/ai-brm.sqlite',
  DB_ALLOW_SQLITE: process.env.DB_ALLOW_SQLITE || '', // 운영에서 DATABASE_URL 없이 SQLite 를 쓰겠다는 명시적 동의 (server/db/index.js)
  UPLOAD_DIR: process.env.UPLOAD_DIR || './data/uploads',
  UPLOAD_MAX_MB: Number(process.env.UPLOAD_MAX_MB || 20),
  // 초기 관리자 시드(1회)에 **추가**할 사번 — 기본 2명(024498, 044692)은 hrSync.INITIAL_ADMIN_EMPLOYEE_NOS.
  // brm 은 env 로 시드하지 않는다 — HR 미러 동기화가 hr_code 규칙으로 매번 재계산한다.
  ADMIN_EMPLOYEE_NOS: (process.env.ADMIN_EMPLOYEE_NOS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // HR 인사 미러 (server/hrSync.js) — HOST 미설정 시 개발에서는 목업 시드, 운영에서는 동기화 스킵
  HR_DB_HOST: process.env.HR_DB_HOST || '',
  HR_DB_PORT: Number(process.env.HR_DB_PORT || 3306),
  HR_DB_USER: process.env.HR_DB_USER || '',
  HR_DB_PASSWORD: process.env.HR_DB_PASSWORD || '',
  HR_DB_NAME: process.env.HR_DB_NAME || '',
  HR_DB_TABLE: process.env.HR_DB_TABLE || 'tbl_employee_adv',
  HR_DB_TEAM_NM_COL: process.env.HR_DB_TEAM_NM_COL || 'beteam_nm', // 원본의 팀명 컬럼 (미러에서는 beteam_nm)
  HR_DB_CONNECT_TIMEOUT_MS: Number(process.env.HR_DB_CONNECT_TIMEOUT_MS || 10000),
  HR_DB_QUERY_TIMEOUT_MS: Number(process.env.HR_DB_QUERY_TIMEOUT_MS || 120000),
  HR_SYNC_ALLOW_SHRINK: process.env.HR_SYNC_ALLOW_SHRINK || '',
  HR_SYNC_STALE_HOURS: Number(process.env.HR_SYNC_STALE_HOURS || 24),
  // 사내 메신저 알림 (server/notify.js) — URL·서비스코드 둘 다 있을 때만 실제 발송, 아니면 로그만
  ALARM_URL: process.env.ALARM_URL || '',
  ALARM_SRV_CODE: process.env.ALARM_SRV_CODE || '',
  ALARM_TIMEOUT_MS: Number(process.env.ALARM_TIMEOUT_MS || 5000),
  // 알림 링크의 기준 주소 (예: https://ai-brm.ibk.co.kr). 비우면 요청 헤더의 호스트로 만든다
  APP_URL: process.env.APP_URL || '',
};
