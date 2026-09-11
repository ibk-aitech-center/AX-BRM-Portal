// @ts-check
/** 완료(done) 처리 시 담당자가 고르는 종결 분류 — 클라이언트·서버·통계 공용 (2026-09-04) */

/** 배포 위치 — 완결된 결과물이 어디에 올라갔는가 (완료 모달에서 먼저 고르는 항목). 순서는 화면·통계 표시 순 */
export const CLOSURE_DEPLOY = /** @type {const} */ ({
  vibelabs: { label: '바이브 랩스', desc: '완결된 웹 서비스를 바이브 랩스에 올림' },
  aihub: { label: 'AI Hub 플랫폼', desc: 'AI Hub 플랫폼에 서비스로 올림' },
  geni: { label: 'Geni 특화서비스', desc: 'Geni 특화서비스로 개발' },
  legacy: { label: '기존 시스템 연계', desc: '기존 행내 시스템에 연계해 올림' },
  none: { label: '배포 안 함', desc: '결과물을 배포하지 않고 종결' },
});

/** 완성 형태 — 어디까지 만들었는가 (완료 모달에서 두 번째로 고르는 항목) */
export const CLOSURE_FORM = /** @type {const} */ ({
  concept: { label: '컨셉 확인', desc: '가상 데이터로 컨셉만 확인하고 종결' },
  poc: { label: '실데이터 PoC', desc: '실데이터로 PoC 까지 완결' },
  service: { label: '서비스 구축', desc: '온전한 서비스 구축까지 완료' },
});

/** @typedef {keyof typeof CLOSURE_DEPLOY} ClosureDeploy */
/** @typedef {keyof typeof CLOSURE_FORM} ClosureForm */

/** @type {ClosureDeploy[]} */
export const CLOSURE_DEPLOY_ORDER = /** @type {any} */ (Object.keys(CLOSURE_DEPLOY));
/** @type {ClosureForm[]} */
export const CLOSURE_FORM_ORDER = /** @type {any} */ (Object.keys(CLOSURE_FORM));

/** 요청 본문의 closure 값을 검증해 정규화한다. 둘 다 있어야 하고 정해진 키여야 한다 — 아니면 null
 * @param {unknown} input
 * @returns {{ deploy: ClosureDeploy, form: ClosureForm } | null} */
export function normalizeClosure(input) {
  const o = /** @type {Record<string, unknown>} */ (input && typeof input === 'object' ? input : {});
  const deploy = String(o.deploy || '');
  const form = String(o.form || '');
  if (!Object.hasOwn(CLOSURE_DEPLOY, deploy) || !Object.hasOwn(CLOSURE_FORM, form)) return null;
  return { deploy: /** @type {ClosureDeploy} */ (deploy), form: /** @type {ClosureForm} */ (form) };
}

/** 이력·알림에 쓰는 한 줄 표기: "바이브 랩스 · 실데이터 PoC"
 * @param {{ deploy: string, form: string } | null | undefined} c */
export function closureLabel(c) {
  if (!c) return '';
  const D = /** @type {Record<string, {label: string}>} */ (CLOSURE_DEPLOY);
  const F = /** @type {Record<string, {label: string}>} */ (CLOSURE_FORM);
  return `${D[c.deploy]?.label ?? c.deploy} · ${F[c.form]?.label ?? c.form}`;
}
