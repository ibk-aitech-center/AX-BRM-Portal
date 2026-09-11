import './env.js';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { initDb, db } from './db/index.js';
import { ensureUploadDir, isUploadDirOnSeparateVolume, isUploadDirWritable } from './storage.js';
import { deriveKey } from './ssoAuth.js';
import { syncIfStale, scheduleDailyHrSync, seedInitialAdmins } from './hrSync.js';
import { authRouter } from './routes/auth.js';
import { requestsRouter } from './routes/requests.js';
import { attachmentsRouter } from './routes/attachments.js';
import { statsRouter } from './routes/stats.js';
import { adminRouter } from './routes/admin.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: `${env.UPLOAD_MAX_MB + 8}mb` }));

// 헬스 체크 — DB 가 실제로 응답하고 첨부 폴더에 쓸 수 있을 때만 ok. (k8s readiness/liveness 프로브 대상)
app.get('/api/health', async (_req, res) => {
  let dbOk = false;
  try { await db.get('SELECT 1 AS one'); dbOk = true; } catch { /* 아래 상태로 보고 */ }
  const uploadsOk = isUploadDirWritable();
  const ok = dbOk && uploadsOk;
  res.status(ok ? 200 : 503).json({
    ok, ts: new Date().toISOString(),
    db: { kind: db?.kind ?? null, ok: dbOk },
    uploads: { ok: uploadsOk, separateVolume: isUploadDirOnSeparateVolume() },
  });
});
app.use('/api/auth', authRouter);
app.use('/api/requests', requestsRouter);
app.use('/api', attachmentsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/admin', adminRouter);

// 운영: 빌드 산출물 정적 서빙 + SPA 폴백
const dist = path.resolve('dist');
if (env.isProd && fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    // popup.html 은 빌드 시 삭제되지만, 혹시 남아 있어도 절대 서빙하지 않는다
    if (req.path === '/popup.html') return res.status(404).end();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// 에러 핸들러 — 상태코드 → 사용자가 취할 행동으로 번역하는 것은 클라이언트가 한다. 서버는 코드와 메시지만.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: err.code || (status === 413 ? 'TOO_LARGE' : 'INTERNAL'),
    message: status >= 500 && env.isProd ? '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' : err.message,
  });
});

async function main() {
  if (!env.SSO_JWT_SIGN) console.warn('[sso] SSO_JWT_SIGN 이 비어 있어요 — 모든 로그인이 실패합니다');
  else deriveKey(env.SSO_JWT_SIGN); // 기동 시 키 길이 검사(경고)
  await initDb();
  ensureUploadDir();
  // 운영인데 첨부 폴더가 컨테이너 루트와 같은 파일시스템이면 PVC 가 안 붙은 것 — 재배포 때 첨부가 전부 사라진다
  if (env.isProd && isUploadDirOnSeparateVolume() === false) {
    console.warn(`[storage] ⚠ UPLOAD_DIR(${env.UPLOAD_DIR}) 이 별도 볼륨이 아니에요 — 컨테이너 재배포 시 첨부 파일이 유실됩니다. /app/data 에 PVC 를 마운트하세요.`);
  }
  await syncIfStale();                        // HR 미러가 비어 있으면 채운다 (개발: 목업 시드)
  await seedInitialAdmins();                  // 시스템 관리자 초기 1회 시드 — 이후 변경은 관리 화면에서 수기로
  if (env.HR_DB_HOST) scheduleDailyHrSync();  // 매일 07:00 KST — 운영은 OS cron(npm run hr:sync)으로 대체 가능
  app.listen(env.PORT, () => console.log(`[server] http://localhost:${env.PORT} (${env.NODE_ENV})`));
}
main().catch((e) => { console.error(e); process.exit(1); });
