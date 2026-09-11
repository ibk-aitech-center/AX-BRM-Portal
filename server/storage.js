// 첨부 파일 저장 — 디스크(UPLOAD_DIR) + DB 메타. 저장 파일명은 해시, 원본명은 DB 에만.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './env.js';

const root = path.resolve(env.UPLOAD_DIR);

export function ensureUploadDir() {
  fs.mkdirSync(root, { recursive: true });
}

/**
 * 첨부 폴더가 컨테이너 루트와 다른 파일시스템(= 별도 볼륨/PVC)에 있는지.
 * 같은 파일시스템이면 이미지 레이어 위에 쓰는 것이라 재배포 때 첨부가 사라진다. 판별이 불가능하면 null.
 * (Linux 컨테이너 기준 — Windows 개발 PC 에서는 드라이브가 같아 항상 같은 dev 로 나온다)
 */
export function isUploadDirOnSeparateVolume() {
  try {
    if (process.platform === 'win32') return null;
    return fs.statSync(root).dev !== fs.statSync('/').dev;
  } catch { return null; }
}

/** 첨부 폴더에 실제로 쓸 수 있는지 (헬스 체크용 — 파일 하나 쓰고 바로 지운다) */
export function isUploadDirWritable() {
  const probe = path.join(root, `.probe-${process.pid}-${Date.now()}`);
  try { fs.writeFileSync(probe, ''); fs.rmSync(probe, { force: true }); return true; } catch { return false; }
}

/**
 * @param {Buffer} buf
 * @param {string} ext  확장자(점 포함 가능)
 * @returns {string} 상대 저장 경로
 */
export function saveBuffer(buf, ext) {
  const safeExt = (ext || '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${safeExt.startsWith('.') || !safeExt ? safeExt : '.' + safeExt}`;
  const sub = new Date().toISOString().slice(0, 7); // YYYY-MM
  fs.mkdirSync(path.join(root, sub), { recursive: true });
  fs.writeFileSync(path.join(root, sub, name), buf);
  return path.posix.join(sub, name);
}

/** @param {string} rel */
export function absPath(rel) {
  const p = path.resolve(root, rel);
  if (!p.startsWith(root)) throw new Error('잘못된 경로');
  return p;
}

/** @param {string} rel */
export function removeFile(rel) {
  try { fs.rmSync(absPath(rel), { force: true }); } catch { /* noop */ }
}

/** 허용 MIME — 목업 HTML, 이미지, 문서류 */
export const ALLOWED_MIME = new Set([
  'text/html', 'text/plain', 'text/csv', 'application/json', 'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
]);

// 목업 허용 파일 표는 클라이언트와 공용 — shared/mockupTypes.js (업로드 검증·미리보기 Content-Type 이 같은 표를 쓴다)
export { MOCKUP_TYPES, MOCKUP_EXTS, mockupTypeOf } from '../shared/mockupTypes.js';
