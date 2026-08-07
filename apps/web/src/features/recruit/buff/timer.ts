/**
 * 버프 주기 계산 — 순수 함수.
 *
 * 워커가 알림을 쏘고, 화면은 이 함수들로 남은 시간을 그린다. 둘 다 같은
 * (startedAt, intervalMs) 에서 출발하므로 표시와 알림이 어긋나지 않는다.
 *
 * 모든 시각 인자는 **epoch ms 정수**다.
 */

/** 다음 버프 시점까지 남은 ms */
export function remainingBuffMs(startedAt: number, intervalMs: number, now: number): number {
  // 아직 시작 전이면 첫 사이클을 통째로 기다린다.
  if (now < startedAt) return intervalMs;
  const elapsed = (now - startedAt) % intervalMs;
  return intervalMs - elapsed;
}

/** 현재 사이클 번호 (0-based) */
export function currentCycle(startedAt: number, intervalMs: number, now: number): number {
  if (now < startedAt) return 0;
  return Math.floor((now - startedAt) / intervalMs);
}

/** 진행률 (0~1) */
export function progressRatio(startedAt: number, intervalMs: number, now: number): number {
  if (now < startedAt) return 0;
  const elapsed = (now - startedAt) % intervalMs;
  return elapsed / intervalMs;
}
