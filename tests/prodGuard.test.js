import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 운영 기동 가드 — DATABASE_URL 없이 production 으로 뜨면 SQLite 로 조용히 떨어져 재배포 때 데이터가 사라진다.
 * env 는 모듈 import 시점에 고정되므로 별도 프로세스로 서버를 띄워 확인한다.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-brm-guard-'));
const baseEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: '',
  DB_ALLOW_SQLITE: '',
  SQLITE_PATH: path.join(tmp, 'guard.sqlite'),
  UPLOAD_DIR: path.join(tmp, 'uploads'),
  SSO_JWT_SIGN: 'test-sign-key-0123456789abcdef-0123456789abcdef', // 32자 이상
  HR_DB_HOST: '',
  PORT: '0',
};

test('운영(production)에서 DATABASE_URL 이 비어 있으면 기동을 거부한다', () => {
  const r = spawnSync(process.execPath, ['server/index.js'], { env: baseEnv, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /DATABASE_URL 이 비어 있어요/);
  assert.ok(!fs.existsSync(baseEnv.SQLITE_PATH), 'SQLite 파일을 만들지 않아야 한다');
});

test('DB_ALLOW_SQLITE=1 로 명시하면 운영에서도 SQLite 로 기동한다', async () => {
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...baseEnv, DB_ALLOW_SQLITE: '1' } });
  let out = '';
  const started = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 20000);
    const onData = (b) => { out += b.toString(); if (/\[server\] http/.test(out)) { clearTimeout(timer); resolve(true); } };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', () => { clearTimeout(timer); resolve(false); });
  });
  child.kill();
  assert.ok(started, out);
  assert.match(out, /\[db\] sqlite ready/);
});
