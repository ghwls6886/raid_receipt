/**
 * 보스 재입장 쿨타임 계산 — 순수 함수 (React/DOM 무관).
 *
 * 규칙: 다음 입장 가능 시각 = 입장 시각 + 보스별 쿨타임(Boss.cooldownHours).
 * 쿨타임을 코드에 박지 않고 보스 마스터 값으로 두었기 때문에, 게임 규칙이 바뀌거나
 * 보스마다 주기가 달라도(주 1회 = 168) 관리자 화면에서 숫자만 고치면 된다.
 */
import type { Boss } from '@/lib/masters';
import type { BossEntry } from '@/features/settlement/api';

const HOUR_MS = 60 * 60 * 1000;

/** 입장 시각 + 쿨타임 → 다음 입장 가능 시각 (epoch ms) */
export function nextAvailableAt(enteredAt: string, cooldownHours: number): number {
  return new Date(enteredAt).getTime() + cooldownHours * HOUR_MS;
}

/** 다음 입장 가능 시각까지 남은 ms. 0 이면 지금 입장 가능 */
export function remainingMs(nextAt: number, now: number): number {
  return Math.max(0, nextAt - now);
}

/** 보스 한 종류의 타이머 상태 — 화면이 그대로 그릴 수 있는 형태 */
export interface BossTimer {
  bossId: string;
  bossName: string;
  cooldownHours: number;
  /** 마지막 입장 기록 id (보정·취소 대상) */
  entryId: string;
  /** 마지막 입장 시각 ISO */
  enteredAt: string;
  /** 다음 입장 가능 시각 epoch ms */
  nextAt: number;
}

/**
 * 해당 공대의 입장 기록 → 타이머 행 목록.
 *
 * 보스 마스터 전체가 아니라 "기록이 있는 보스"만 행이 된다. 전체를 나열하면 그 공대가
 * 돌지도 않는 보스까지 전부 "지금 가능"으로 떠서, 보스가 늘어날수록 정작 도는 보스가
 * 묻힌다(스크롤을 달아도 안 도는 보스가 위를 차지할 뿐이다). 한 번이라도 들어간 보스만
 * 남기면 카드 높이가 "그 공대가 실제로 도는 보스 수"에 비례한다.
 * 아직 안 돈 보스는 bossesWithoutEntry() 로 뽑아 "+ 다른 보스 입장" 선택지로 넘긴다.
 *
 * 정렬은 nextAt 오름차순 = 지금 가능한 것(지난 시각) 먼저, 그 다음 곧 열리는 순.
 * now 를 쓰지 않으므로 매초 재정렬되지 않는다.
 */
export function buildBossTimers(bosses: Boss[], entries: BossEntry[]): BossTimer[] {
  const bossById = new Map(bosses.map((b) => [b.id, b]));

  return entries
    .flatMap((entry) => {
      const boss = bossById.get(entry.bossId);
      // 보스 마스터에서 삭제된 보스. 기록은 남지만 쿨타임 기준이 없어 타이머를 그릴 수 없다.
      if (!boss) return [];
      return [
        {
          bossId: boss.id,
          bossName: boss.name,
          cooldownHours: boss.cooldownHours,
          entryId: entry.id,
          enteredAt: entry.enteredAt,
          nextAt: nextAvailableAt(entry.enteredAt, boss.cooldownHours),
        },
      ];
    })
    .sort((a, b) => a.nextAt - b.nextAt);
}

/** 아직 이 공대의 입장 기록이 없는 보스 — "+ 다른 보스 입장" 선택지 */
export function bossesWithoutEntry(bosses: Boss[], entries: BossEntry[]): Boss[] {
  const recorded = new Set(entries.map((e) => e.bossId));
  return bosses.filter((b) => !recorded.has(b.id));
}
