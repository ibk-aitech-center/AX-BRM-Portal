import { Router } from 'express';
import { env } from '../env.js';
import { db, nowIso } from '../db/index.js';
import { verifySsoToken, SsoError } from '../ssoAuth.js';
import { requireAuth, toUser, findUserWithHr, HttpError } from '../auth.js';
import { positionFor, syncIfStale, roleForNewLogin } from '../hrSync.js';

export const authRouter = Router();

/**
 * POST /api/auth/sso { token }  (SSO연동가이드 §6)
 *  검증 → 사번 형식 → 사용자 배치(매칭/백필/신규) → 로그인 응답. 성공/실패 로그 1줄.
 */
authRouter.post('/sso', async (req, res, next) => {
  const token = req.body?.token;
  try {
    const c = verifySsoToken(token, { sign: env.SSO_JWT_SIGN, clockSkewSeconds: env.SSO_CLOCK_SKEW_SECONDS });
    if (!/^\d{6}$/.test(c.employeeNo)) throw new HttpError(401, '사번 형식이 올바르지 않아요', 'SSO_ID_FORMAT');

    // 직책(position)은 SSO 토큰에 없다 — HR 미러에서 조회한다. 미러가 비어 있으면 먼저 채운다.
    await syncIfStale();
    const position = await positionFor(db, c.employeeNo);

    const now = nowIso();
    const existing = await db.get('SELECT * FROM users WHERE employee_no = ?', [c.employeeNo]);
    // 역할은 DB 가 진실 — brm 은 HR 동기화(syncBrmRoles)가, admin·data_brm 은 관리 화면이 관리한다.
    // 기존 행의 역할은 로그인 경로가 절대 바꾸지 않는다. 행이 없는 첫 로그인만 미러 규칙(1094 소속 → brm)으로 정한다
    // — 동기화가 사전 생성해 두지 못한 신규·전입 직원도 첫 화면부터 맞는 권한을 갖도록.
    const role = existing?.role || await roleForNewLogin(db, c.employeeNo);

    if (existing) {
      await db.run(
        // 미러에 없는 직원(외주 등)은 position 을 지우지 않는다 — COALESCE 로 기존 값 유지
        'UPDATE users SET name = ?, org_cd = ?, org_nm = ?, position = COALESCE(?, position), role = ?, last_login_at = ? WHERE employee_no = ?',
        [c.name, c.orgCd, c.orgNm, position, role, now, c.employeeNo],
      );
    } else {
      try {
        await db.run(
          'INSERT INTO users(employee_no, name, org_cd, org_nm, position, role, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?)',
          [c.employeeNo, c.name, c.orgCd, c.orgNm, position, role, now, now],
        );
      } catch (e) {
        // 동시 로그인 경합 (unique 충돌) → 409
        if (String(e?.code) === '23505' || /UNIQUE|constraint/i.test(String(e?.message))) throw new HttpError(409, '동시에 로그인 처리 중이에요. 다시 시도해 주세요', 'RACE');
        throw e;
      }
    }
    const row = await findUserWithHr(c.employeeNo); // 미러 JOIN — canRequest(본부부서 자격) 포함
    console.log(`[sso] ok ${c.orgNm || '-'}|${c.name} role=${row.role}`);
    res.json({ user: toUser(row) });
  } catch (e) {
    if (e instanceof SsoError) {
      console.warn(`[sso] fail ${e.code}`);
      return res.status(e.status).json({ error: e.code, message: '로그인 확인에 실패했어요. 포탈에서 다시 접속해 주세요.' });
    }
    next(e);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
