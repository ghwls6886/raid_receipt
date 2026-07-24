/** HTML 특수문자 이스케이프 (XSS 방지) */
export function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char] ?? char);
}

/** URL 경로에서 마지막 세그먼트 추출 */
export function getLastUrlSegment(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}
