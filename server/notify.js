/**
 * 사내 메신저(IBK톡) 알림 — AI 포탈(aihub)의 AlarmCall.java 와 같은 규약으로 AnnounceService 에 POST 한다.
 *
 * 규약(ibktalk-sample/AlarmCall.java 그대로):
 *   POST {ALARM_URL}  Content-Type: application/x-www-form-urlencoded; charset=UTF-8
 *   SRV_CODE=<서비스코드> · RECIPIENT=E:<수신 사번> · SEND=<발신 사번> · TITLE · BODY · LINKTXT · LINKURL
 *   사번은 맨 앞 '0' 한 글자를 떼고 보낸다 (045346 → 45346). 수신자 1명당 1회 호출.
 *
 * 운영 원칙:
 *   - ALARM_URL · ALARM_SRV_CODE 둘 다 있을 때만 실제로 보낸다. 비어 있으면(개발·검증) 로그만 남기고 성공으로 처리.
 *   - 알림은 부가 기능이다 — 실패해도 신청·검토 처리는 그대로 끝나야 하므로 호출 측은 응답을 보낸 뒤 fire-and-forget 으로 부른다.
 *     (타임아웃 5초, 예외는 전부 잡아서 [notify] 로그로만)
 *   - 메시지 문구는 이 파일의 MESSAGES 한 곳에서만 바꾼다.
 */
import { env } from './env.js';
import { db } from './db/index.js';
import { listAdminRecipients } from './hrSync.js';
import { listDataBrmRecipients } from './dataBrm.js';

export const MESSAGES = {
  newRequest: { title: 'AX-BRM 신규 요청', body: '신규 AX-BRM 요청건이 있습니다', linkText: '요청 확인' },
  newDataRequest: { title: 'AX-BRM 데이터 협의 요청', body: '행내 데이터가 필요한 AX-BRM 요청건이 접수되었습니다', linkText: '요청 확인' },
  assigned: { title: 'AX-BRM 담당자 지정', body: 'AX-BRM 담당자로 지정되었습니다', linkText: '요청 확인' },
  comment: { title: 'AX-BRM 문의', body: '요청자가 문의·대화를 남겼습니다', linkText: '문의 확인' },
};

/** 사번 표기 — 샘플과 동일하게 맨 앞 '0' 하나만 뗀다 */
export const stripLeadingZero = (empNo) => { const s = String(empNo ?? '').trim(); return s.startsWith('0') ? s.slice(1) : s; };

export function notifyConfig() {
  return { url: env.ALARM_URL, srvCode: env.ALARM_SRV_CODE, timeoutMs: env.ALARM_TIMEOUT_MS, enabled: Boolean(env.ALARM_URL && env.ALARM_SRV_CODE) };
}

/** 알림 안의 링크 — APP_URL(운영 도메인) 이 없으면 요청 헤더의 호스트로 만든다 */
export function appBaseUrl(req) {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, '');
  if (!req) return '';
  const proto = req.get?.('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get?.('x-forwarded-host') || req.get?.('host') || '';
  return host ? `${proto}://${host}` : '';
}

/**
 * 수신자 1명에게 알림 1건. 성공 여부만 돌려주고 절대 throw 하지 않는다.
 * @param {{ recipient: string, sender: string, title: string, body: string, linkText?: string, linkUrl?: string }} msg
 * @param {{ url?: string, srvCode?: string, timeoutMs?: number, fetchImpl?: typeof fetch, logger?: Console }} [opts]
 */
export async function sendMessengerAlarm(msg, opts = {}) {
  const cfg = { ...notifyConfig(), ...opts };
  const logger = opts.logger || console;
  const recipient = stripLeadingZero(msg.recipient);
  const sender = stripLeadingZero(msg.sender);
  const tag = `E:${recipient} ← ${sender} "${msg.body}"`;
  if (!recipient) { logger.warn(`[notify] 수신 사번이 비어 건너뜀 · ${tag}`); return false; }
  if (!cfg.url || !cfg.srvCode) { logger.log(`[notify] (비활성 · ALARM_URL/ALARM_SRV_CODE 미설정) ${tag}`); return true; }

  const form = new URLSearchParams({
    SRV_CODE: cfg.srvCode, RECIPIENT: `E:${recipient}`, SEND: sender,
    TITLE: msg.title, BODY: msg.body, LINKTXT: msg.linkText || '', LINKURL: msg.linkUrl || '',
  });
  try {
    const res = await (opts.fetchImpl || fetch)(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form.toString(),
      signal: AbortSignal.timeout(cfg.timeoutMs || 5000),
    });
    const text = (await res.text().catch(() => '')).slice(0, 200);
    if (!res.ok) { logger.error(`[notify] 실패 HTTP ${res.status} · ${tag} · ${text}`); return false; }
    logger.log(`[notify] 보냄 · ${tag}${text ? ` · 응답 ${text}` : ''}`);
    return true;
  } catch (e) {
    logger.error(`[notify] 오류 · ${tag} · ${e?.name === 'TimeoutError' ? `타임아웃 ${cfg.timeoutMs}ms` : e?.message || e}`);
    return false;
  }
}

/** 여러 수신자에게 같은 메시지 — 발신자 본인은 제외, 중복 제거. 결과 { sent, failed, recipients } */
export async function broadcast(recipients, msg, opts = {}) {
  const uniq = [...new Set(recipients.map((r) => String(r ?? '').trim()).filter(Boolean))]
    .filter((r) => stripLeadingZero(r) !== stripLeadingZero(msg.sender));
  const results = await Promise.all(uniq.map((recipient) => sendMessengerAlarm({ ...msg, recipient }, opts)));
  return { sent: results.filter(Boolean).length, failed: results.filter((r) => !r).length, recipients: uniq };
}

/**
 * ① 요청자가 신청을 확정했을 때 — 발신: 요청자, 수신: **관리자(admin) 전원만**
 *    (발송 시점의 users.role 이 admin 인 직원 — HR 미러 규칙으로는 보내지 않는다. hrSync.listAdminRecipients)
 *    AX-BRM(brm) 은 여기서 받지 않는다 — 관리자가 담당자로 지정하면 ② 로 그 담당자만 받는다.
 */
export async function notifyNewRequest({ requestId, reqNo, requesterEmployeeNo, baseUrl, dataRelated = false, conn = db, logger = console, ...opts }) {
  const recipients = await listAdminRecipients(conn);
  const m = MESSAGES.newRequest;
  const r = await broadcast(recipients, { sender: requesterEmployeeNo, title: m.title, body: m.body, linkText: m.linkText, linkUrl: baseUrl ? `${baseUrl}/brm/requests/${requestId}` : '' }, { ...opts, logger });
  logger.log(`[notify] 신규 요청 ${reqNo} → ${r.recipients.length}명 (성공 ${r.sent} · 실패 ${r.failed})`);
  // ①-b 행내 데이터가 필요한(또는 모르겠다는) 건이면 DATA-BRM(조회 전용)에게도 — 접수 때 한 번만. 링크는 DATA-BRM 조회 화면
  if (dataRelated) {
    const dataRecipients = (await listDataBrmRecipients(conn)).filter((e) => !r.recipients.includes(e));
    const dm = MESSAGES.newDataRequest;
    const dr = await broadcast(dataRecipients, { sender: requesterEmployeeNo, title: dm.title, body: dm.body, linkText: dm.linkText, linkUrl: baseUrl ? `${baseUrl}/data/requests/${requestId}` : '' }, { ...opts, logger });
    logger.log(`[notify] 데이터 협의 요청 ${reqNo} → DATA-BRM ${dr.recipients.length}명 (성공 ${dr.sent} · 실패 ${dr.failed})`);
    return { ...r, data: dr };
  }
  return r;
}

/** ② 담당자가 지정됐을 때 — 발신: 지정한 BRM, 수신: 지정된 담당자 */
export async function notifyAssigned({ requestId, reqNo, assigneeEmployeeNo, byEmployeeNo, baseUrl, logger = console, ...opts }) {
  const m = MESSAGES.assigned;
  const ok = await sendMessengerAlarm({ recipient: assigneeEmployeeNo, sender: byEmployeeNo, title: m.title, body: m.body, linkText: m.linkText, linkUrl: baseUrl ? `${baseUrl}/brm/requests/${requestId}` : '' }, { ...opts, logger });
  logger.log(`[notify] 담당자 지정 ${reqNo} → ${assigneeEmployeeNo} (${ok ? '성공' : '실패'})`);
  return ok;
}

/**
 * 담당자 지정처럼 화면이 "실제로 알렸는지" 를 보여줘야 하는 곳용 — 응답에 실을 상태 하나로 돌려준다.
 *   'sent'     실제 POST 성공
 *   'failed'   POST 실패(HTTP 오류·타임아웃·연결 불가·수신 사번 없음) — 서버 로그 [notify] 에 이유가 있다
 *   'disabled' ALARM_URL/ALARM_SRV_CODE 미설정이라 호출 자체를 안 함
 * 절대 throw 하지 않는다. 기다리는 시간은 최대 ALARM_TIMEOUT_MS(기본 5초).
 */
export async function notifyAssignedStatus(args) {
  const enabled = notifyConfig().enabled || Boolean(args.url && args.srvCode);
  try {
    const ok = await notifyAssigned(args); // 비활성이면 안에서 로그만 남기고 true
    return !enabled ? 'disabled' : ok ? 'sent' : 'failed';
  } catch (e) { (args.logger || console).error(`[notify] 담당자 지정 처리 중 예외 · ${e?.message || e}`); return 'failed'; }
}

/**
 * ③ 요청자가 문의·대화를 남겼을 때 — 발신: 요청자, 수신: 지정된 AX-BRM 담당자.
 *    담당자가 없으면(미지정) 보내지 않는다 — 신규 요청 알림을 이미 전원이 받았으므로 문의까지 전원에 뿌리지 않는다.
 */
export async function notifyComment({ requestId, reqNo, assigneeEmployeeNo, byEmployeeNo, baseUrl, logger = console, ...opts }) {
  if (!assigneeEmployeeNo) { logger.log(`[notify] 문의 ${reqNo} · 담당자 미지정이라 알리지 않음`); return false; }
  const m = MESSAGES.comment;
  const ok = await sendMessengerAlarm({ recipient: assigneeEmployeeNo, sender: byEmployeeNo, title: m.title, body: m.body, linkText: m.linkText, linkUrl: baseUrl ? `${baseUrl}/brm/requests/${requestId}` : '' }, { ...opts, logger });
  logger.log(`[notify] 문의 ${reqNo} → ${assigneeEmployeeNo} (${ok ? '성공' : '실패'})`);
  return ok;
}

/** fire-and-forget 래퍼 — 응답을 먼저 보낸 뒤 부른다. 어떤 예외도 요청 처리에 번지지 않게 */
export function fireAndForget(promise, logger = console) {
  Promise.resolve(promise).catch((e) => logger.error(`[notify] 처리 중 예외 · ${e?.message || e}`));
}
