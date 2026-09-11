#!/usr/bin/env node
/**
 * HR 동기화 수동 실행 CLI.
 *   npm run hr:sync
 * 운영에서는 서버 내장 스케줄러 대신 OS cron 으로 이 스크립트를 07:00 에 돌려도 동일하다.
 * 성공 시 exit 0, 실패 시 exit 1.
 */
import '../env.js';
import { initDb, db } from '../db/index.js';

const main = async () => {
  await initDb(); // 스키마 멱등 적용 — cron 전용 배포에서 미러 테이블이 없으면 여기서 생긴다
  const { runHrSync } = await import('../hrSync.js');
  const result = await runHrSync({ trigger: 'cli' });
  console.log('[hr-sync] 결과:', JSON.stringify(result, null, 2));
  await db.close();
  process.exit(result.ok ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
