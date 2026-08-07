/**
 * 보스 재입장 쿨타임 계산 — 순수 함수 (React/DOM 무관).
 *
 * 정산(공대 단위)과 helper(캐릭터 단위)가 같은 공식을 쓴다. 축은 달라도
 * "입장 시각 + 쿨타임 = 다음 입장 가능 시각"이라는 규칙은 하나뿐이라 여기 둔다
 * (MERGE_PLAN §4.1 원칙 3 — helper 가 settlement 을 import 하면 안 된다).
 *
 * 쿨타임을 코드에 박지 않고 보스 마스터(bosses.cooldown_hours) 값으로 두었기 때문에,
 * 게임 규칙이 바뀌거나 보스마다 주기가 달라도(주 1회 = 168) 관리자 화면에서
 * 숫자만 고치면 된다.
 */

const HOUR_MS = 60 * 60 * 1000;

/** 입장 시각 + 쿨타임 → 다음 입장 가능 시각 (epoch ms) */
export function nextAvailableAt(enteredAt: string, cooldownHours: number): number {
  return new Date(enteredAt).getTime() + cooldownHours * HOUR_MS;
}

/** 다음 입장 가능 시각까지 남은 ms. 0 이면 지금 입장 가능 */
export function remainingMs(nextAt: number, now: number): number {
  return Math.max(0, nextAt - now);
}
