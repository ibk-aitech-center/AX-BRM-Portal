#!/usr/bin/env node
/**
 * 신청 데이터 전체 초기화 CLI — 관리 화면의 "신청 데이터 전체 초기화"와 같은 동작 (server/resetRequests.js).
 *   node server/scripts/reset-requests.js            → 지울 대상 건수만 보여주고 끝 (dry-run)
 *   node server/scripts/reset-requests.js --yes      → 실제로 지운다
 *
 * 운영(k8s)에서는 파드 안에서 실행: kubectl exec deploy/ai-brm -- node server/scripts/reset-requests.js --yes
 * 되돌릴 수 없으므로 DB 백업(pg_dump) 후에 실행할 것.
 */
import '../env.js';
import { initDb, db } from '../db/index.js';
import { env } from '../env.js';

const yes = process.argv.includes('--yes');

const main = async () => {
  await initDb();
  const { countResetTargets, resetRequests } = await import('../resetRequests.js');
  const counts = await countResetTargets(db);
  console.log(`[reset] DB: ${env.DATABASE_URL ? 'PostgreSQL' : `SQLite ${env.SQLITE_PATH}`} · NODE_ENV=${env.NODE_ENV}`);
  console.log('[reset] 지울 대상:', JSON.stringify(counts));
  console.log('[reset] 남기는 것: users · tbl_employee_adv · app_meta');
  if (!yes) { console.log('[reset] dry-run — 실제로 지우려면 --yes 를 붙이세요'); await db.close(); return; }
  const r = await resetRequests({ conn: db, by: 'cli' });
  console.log(`[reset] 완료 — 첨부 파일 ${r.filesRemoved}/${r.filesTotal}개 삭제 · 다음 접수번호는 ${r.nextReqNo}`);
  await db.close();
};
main().catch((e) => { console.error('[reset] 실패:', e); process.exit(1); });
