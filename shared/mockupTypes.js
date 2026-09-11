// @ts-check
/**
 * 컨셉 목업으로 올릴 수 있는 파일 — 브라우저가 플러그인 없이 바로 여는 것만. 클라이언트(업로드 검증·accept)·서버(업로드 검증·미리보기 Content-Type) 공용.
 * 2026-09-11: HTML 전용 → 이미지·PDF 추가. 동영상(mp4·webm)·오피스 문서·zip 은 제외 — 참고 자료(reference)로 올린다.
 * 미리보기 응답의 Content-Type 은 클라이언트가 보낸 MIME 이 아니라 **이 표의 확장자**로 정한다 (위장 파일 방지).
 * SVG 는 스크립트를 담을 수 있어 HTML 과 같은 등급 — 목업은 AX-BRM 만 올리므로 허용한다.
 */
export const MOCKUP_TYPES = /** @type {const} */ ({
  '.html': { mime: 'text/html; charset=utf-8', label: 'HTML' },
  '.htm': { mime: 'text/html; charset=utf-8', label: 'HTML' },
  '.png': { mime: 'image/png', label: 'PNG' },
  '.jpg': { mime: 'image/jpeg', label: 'JPG' },
  '.jpeg': { mime: 'image/jpeg', label: 'JPG' },
  '.gif': { mime: 'image/gif', label: 'GIF' },
  '.webp': { mime: 'image/webp', label: 'WebP' },
  '.svg': { mime: 'image/svg+xml', label: 'SVG' },
  '.pdf': { mime: 'application/pdf', label: 'PDF' },
});
/** @type {string[]} */
export const MOCKUP_EXTS = Object.keys(MOCKUP_TYPES);
/** <input accept> 값 */
export const MOCKUP_ACCEPT = MOCKUP_EXTS.join(',');
/** 안내 문구용 — "HTML · 이미지(PNG·JPG·GIF·WebP·SVG) · PDF" */
export const MOCKUP_KINDS_TEXT = 'HTML · 이미지(PNG · JPG · GIF · WebP · SVG) · PDF';

/**
 * 파일명 → 목업 타입(없으면 null). 확장자 대소문자 무관
 * @param {string} fileName
 * @returns {{ mime: string, label: string } | null}
 */
export function mockupTypeOf(fileName) {
  const m = /\.[a-z0-9]+$/i.exec(String(fileName || ''));
  if (!m) return null;
  const ext = /** @type {keyof typeof MOCKUP_TYPES} */ (m[0].toLowerCase());
  return MOCKUP_TYPES[ext] ?? null;
}
