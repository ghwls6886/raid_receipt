/**
 * 표시용 포매터 — 메소 금액, 날짜.
 */

/** 메소 금액 콤마 표기 (예: 45000000 -> "45,000,000") */
export function formatMeso(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 메소 금액 축약 표기 — 스탯 타일용 (예: 125000000 -> "1.25억", 3450000 -> "345만") */
export function formatMesoCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100_000_000) return `${sign}${trim(abs / 100_000_000)}억`;
  if (abs >= 10_000) return `${sign}${trim(abs / 10_000)}만`;
  return `${sign}${abs.toLocaleString('ko-KR')}`;
}

function trim(v: number): string {
  return (Math.round(v * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

/** ISO 날짜 -> "2026.07.24" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}
