import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';
import { db, nowIso } from '../db/index.js';
import { requireAuth, isBrm, canReadRequest, toUser, HttpError } from '../auth.js';
import { saveBuffer, absPath, removeFile, ALLOWED_MIME } from '../storage.js';
import { mintTicket, verifyTicket, TICKET_TTL_MS } from '../mockupTicket.js';

export const attachmentsRouter = Router();

const isHtml = (a) => /^text\/html/.test(a.mime || '') || /\.html?$/i.test(a.file_name || '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VIEW_ERROR = {
  MALFORMED: '열람 링크가 올바르지 않아요.', BAD_SIGNATURE: '열람 링크가 올바르지 않아요.', WRONG_ATTACHMENT: '다른 파일의 링크예요.',
  EXPIRED: '열람 링크가 만료됐어요 (10분).', NOT_FOUND: '파일을 찾을 수 없어요.', FORBIDDEN: '이 목업을 볼 권한이 없어요.', GONE: '파일이 저장소에 없어요.', NOT_HTML: 'HTML 파일만 열 수 있어요.',
};
function viewErrorPage(res, status, code) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>목업 미리보기</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Pretendard",system-ui,sans-serif;background:#F4F8F7;color:#1B2B2C}.box{text-align:center;padding:32px}h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#41585E;font-size:14px}</style></head>
<body><div class="box"><h1>${esc(VIEW_ERROR[code] || '목업을 열 수 없어요.')}</h1><p>원래 화면으로 돌아가 "미리보기" 버튼을 다시 눌러 주세요.</p></div></body></html>`);
}

/**
 * GET /api/attachments/:id/view?t=<티켓> — 목업 HTML 을 **그대로 최상위 문서로** 준다 (2026-09-09).
 *   iframe sandbox 로 격리하던 방식은 localStorage·모달·폼 등이 막혀 목업이 제대로 동작하지 않았다 → 별도 창에 온전히 띄운다.
 *   인증은 Bearer 대신 10분짜리 열람 티켓(mockupTicket.js). 티켓의 사번으로 열람 권한을 다시 확인한다.
 *   격리는 클라이언트 쪽 부트스트랩(MockupView)이 맡는다 — 이 문서로 넘어오기 전에 그 창의 SSO 토큰을 지우고 opener 를 끊는다.
 *   requireAuth 보다 먼저 등록해야 한다.
 */
attachmentsRouter.get('/attachments/:id/view', async (req, res) => {
  const v = verifyTicket(String(req.query.t || ''), req.params.id);
  if (!v.ok) return viewErrorPage(res, 403, v.reason);
  const a = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
  if (!a) return viewErrorPage(res, 404, 'NOT_FOUND');
  const userRow = await db.get('SELECT * FROM users WHERE employee_no = ?', [v.employeeNo]);
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [a.request_id]);
  if (!userRow || !row || !canReadRequest(toUser(userRow), row)) return viewErrorPage(res, 403, 'FORBIDDEN');
  if (!isHtml(a)) return viewErrorPage(res, 400, 'NOT_HTML');
  const p = absPath(a.storage_path);
  if (!fs.existsSync(p)) return viewErrorPage(res, 410, 'GONE');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'"); // 다른 사이트 iframe 에 끼워 넣지 못하게
  fs.createReadStream(p).pipe(res);
});

attachmentsRouter.use(requireAuth);

// kind='other' 는 폐지(2026-09-03) — AX-BRM 은 목업만 올리고, 부가 자료는 요청자의 'reference' 로 일원화.
// 기존 'other' 행의 표시·다운로드는 그대로 동작한다(신규 업로드만 막는다).
const KINDS = new Set(['mockup', 'reference']);

async function loadRequestFor(id, user) {
  const row = await db.get('SELECT * FROM requests WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, '요청을 찾을 수 없어요', 'NOT_FOUND');
  const own = row.requester_employee_no === user.employeeNo;
  // DATA-BRM 은 데이터 관련 건의 첨부·목업을 내려받고 미리 볼 수만 있다 — 업로드·삭제는 아래에서 own/isBrm 으로 막힌다
  if (!canReadRequest(user, row)) throw new HttpError(403, '권한이 없어요', 'FORBIDDEN');
  return { row, own };
}

/**
 * POST /api/requests/:id/attachments
 * body: { kind, fileName, mime, contentBase64, note }
 *  - kind='mockup'    : AX-BRM 전용 (HTML만, 같은 요청 안에서 버전 자동 증가)
 *  - kind='reference' : 요청자 본인 전용 (요청 내용의 부가 설명 자료 — 초안·신청 후 모두 가능)
 */
attachmentsRouter.post('/requests/:id/attachments', async (req, res) => {
  const { row, own } = await loadRequestFor(req.params.id, req.user);
  const b = req.body || {};
  const kind = KINDS.has(b.kind) ? b.kind : 'reference';
  // 역할이 섞이지 않게 서버에서 못박는다 — 목업은 AX-BRM, 참고 자료는 요청자 본인만.
  if (kind === 'mockup' && !isBrm(req.user)) throw new HttpError(403, '목업은 AX-BRM만 올릴 수 있어요', 'FORBIDDEN');
  if (kind === 'reference' && !own) throw new HttpError(403, '참고 자료는 요청자 본인만 올릴 수 있어요', 'FORBIDDEN');
  if (row.status === 'draft' && !own) throw new HttpError(409, '아직 신청되지 않은 요청이에요', 'IS_DRAFT');

  const fileName = String(b.fileName || '').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
  if (!fileName) throw new HttpError(400, '파일 이름이 없어요', 'NO_NAME');
  const mime = String(b.mime || 'application/octet-stream').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new HttpError(400, '올릴 수 없는 파일 형식이에요', 'BAD_MIME');
  if (typeof b.contentBase64 !== 'string' || !b.contentBase64) throw new HttpError(400, '파일 내용이 없어요', 'NO_CONTENT');
  const buf = Buffer.from(b.contentBase64, 'base64');
  const maxBytes = env.UPLOAD_MAX_MB * 1024 * 1024;
  if (buf.length > maxBytes) throw new HttpError(413, `파일이 너무 커요. ${env.UPLOAD_MAX_MB}MB 이하로 줄여서 올려주세요`, 'TOO_LARGE');
  if (kind === 'mockup' && !/\.html$/i.test(fileName)) throw new HttpError(400, '목업은 확장자가 .html 인 파일만 올릴 수 있어요', 'MOCKUP_HTML_ONLY');

  const ext = path.extname(fileName);
  const rel = saveBuffer(buf, ext);
  const ver = await db.get('SELECT COALESCE(MAX(version), 0) AS v FROM attachments WHERE request_id = ? AND kind = ?', [row.id, kind]);
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO attachments(id, request_id, kind, file_name, mime, size, storage_path, version, note, uploaded_by, uploaded_by_name, uploaded_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, row.id, kind, fileName, mime, buf.length, rel, Number(ver.v) + 1, b.note ? String(b.note).slice(0, 500) : null, req.user.employeeNo, req.user.name, nowIso()],
  );
  await db.run('UPDATE requests SET updated_at = ? WHERE id = ?', [nowIso(), row.id]);
  res.status(201).json({ id, version: Number(ver.v) + 1 });
});

async function loadAttachment(id, user) {
  const a = await db.get('SELECT * FROM attachments WHERE id = ?', [id]);
  if (!a) throw new HttpError(404, '파일을 찾을 수 없어요', 'NOT_FOUND');
  await loadRequestFor(a.request_id, user); // 권한 확인
  return a;
}

/** 첨부 하나의 메타 — 목업 미리보기 창의 상단 바(파일명·버전·요청 제목)용. 권한은 loadAttachment 가 확인 */
attachmentsRouter.get('/attachments/:id', async (req, res) => {
  const a = await loadAttachment(req.params.id, req.user);
  const r = await db.get('SELECT id, req_no, title FROM requests WHERE id = ?', [a.request_id]);
  res.json({
    id: a.id, kind: a.kind, fileName: a.file_name, mime: a.mime, size: a.size, version: a.version, note: a.note,
    uploadedBy: { employeeNo: a.uploaded_by, name: a.uploaded_by_name }, uploadedAt: a.uploaded_at,
    request: { id: r.id, reqNo: r.req_no, title: r.title },
  });
});

/** 다운로드 — 클라이언트는 fetch(Bearer) → blob 으로 받는다 (URL 에 토큰을 싣지 않기 위해) */
attachmentsRouter.get('/attachments/:id/download', async (req, res) => {
  const a = await loadAttachment(req.params.id, req.user);
  const p = absPath(a.storage_path);
  if (!fs.existsSync(p)) throw new HttpError(410, '파일이 저장소에 없어요', 'GONE');
  res.setHeader('Content-Type', a.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(p).pipe(res);
});

/**
 * 목업 열람 티켓 발급 — 로그인된 사용자가 권한 있는 HTML 첨부에 대해서만. 돌려준 url 을 별도 창의 최상위 문서로 연다.
 */
attachmentsRouter.post('/attachments/:id/view-ticket', async (req, res) => {
  const a = await loadAttachment(req.params.id, req.user);
  if (!isHtml(a)) throw new HttpError(400, 'HTML 파일만 미리 볼 수 있어요', 'NOT_HTML');
  const t = mintTicket({ attachmentId: a.id, employeeNo: req.user.employeeNo });
  res.json({ url: `/api/attachments/${a.id}/view?t=${encodeURIComponent(t)}`, expiresInMs: TICKET_TTL_MS, fileName: a.file_name });
});

attachmentsRouter.delete('/attachments/:id', async (req, res) => {
  const a = await loadAttachment(req.params.id, req.user);
  if (a.uploaded_by !== req.user.employeeNo && !isBrm(req.user)) throw new HttpError(403, '올린 사람만 지울 수 있어요', 'FORBIDDEN');
  await db.run('DELETE FROM attachments WHERE id = ?', [a.id]);
  removeFile(a.storage_path);
  res.json({ ok: true });
});
