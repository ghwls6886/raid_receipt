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

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * epoch ms 또는 ISO -> "21:34" (로컬 시각).
 * 저장은 UTC(ISO), 표시는 로컬이라 변환은 항상 이 레이어에서만 일어난다.
 */
export function formatClock(at: number | string): string {
  const d = new Date(at);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 로컬 자정 기준 epoch ms — 달력상 며칠 차이인지 세기 위한 기준점 */
function startOfDay(at: number | string): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 달력 기준 상대 표기 -> "오늘 21:34" | "내일 21:34" | "어제 21:34" | "07.30 21:34"
 *
 * 시간 차(24h)가 아니라 달력 날짜 차로 판단한다. 23:50 에 입장해 다음날 23:50 이
 * 되는 경우처럼 "24시간 뒤"와 "내일"이 어긋나는 상황에서 사람이 읽는 기준을 따른다.
 * 일수 계산에 Math.round 를 쓰는 이유는 서머타임 등으로 하루가 23/25시간이 될 때
 * 나눗셈이 소수로 떨어져도 날짜 차가 흔들리지 않게 하기 위함.
 */
export function formatRelativeDateTime(at: number | string, now: number): string {
  const dayDiff = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  const clock = formatClock(at);
  if (dayDiff === 0) return `오늘 ${clock}`;
  if (dayDiff === 1) return `내일 ${clock}`;
  if (dayDiff === -1) return `어제 ${clock}`;

  const d = new Date(at);
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${clock}`;
}

/**
 * 남은 시간 -> "3시간 12분" | "12분 05초" | "45초"
 *
 * 단위를 상황에 따라 바꾼다. 몇 시간 남았을 때 초까지 보여주면 시선만 뺏기고,
 * 1시간 안쪽으로 들어오면 초 단위가 실제로 의미가 생긴다.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${pad2(seconds)}초`;
  return `${seconds}초`;
}
