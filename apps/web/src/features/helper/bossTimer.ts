/**
 * 개인 보스 타이머 계산 — 순수 함수 (React/DOM 무관).
 *
 * ⚠️ features/settlement/bossTimer.ts 와 이름은 비슷하지만 **축이 다르다**
 * (MERGE_PLAN 함정 2):
 *   정산 = 공대 단위 (party_id). 공대가 같이 도는 쿨타임
 *   여기 = 캐릭터 단위 (character_id). 내 캐릭터별 쿨타임 + 몇 트째인지
 *
 * 공유하는 건 쿨타임 공식뿐이라 그것만 @/lib/cooldown 에 있다.
 */
import type { Boss } from '@/lib/masters';
import { nextAvailableAt } from '@/lib/cooldown';
import type { Character, CharBossEntry } from '@/features/helper/api';

/** 화면이 그대로 그릴 수 있는 형태의 타이머 한 줄 */
export interface BossTimer {
  bossId: string;
  bossName: string;
  cooldownHours: number;
  entryId: string;
  enteredAt: string;
  nextAt: number;
  characterId: string;
  characterName: string;
  /** 현재 몇 트인지 (1-based) */
  attemptNumber: number;
  /** 이 보스의 최대 입장 횟수 */
  maxEntries: number;
}

const groupKey = (e: CharBossEntry) => `${e.bossId}::${e.characterId}`;

/**
 * 입장 기록 → 타이머 행 목록. nextAt 오름차순(곧 열리는 것부터).
 *
 * 같은 보스+캐릭터의 기록을 묶어 attemptNumber(몇 트)를 매긴다. 하루 2트 보스가
 * 있어서 "자쿰 1/2트, 자쿰 2/2트"처럼 같은 보스가 여러 줄로 나올 수 있다.
 * 마스터에 없는 보스나 목록에 없는 캐릭터의 기록은 버린다.
 */
export function buildBossTimers(
  bosses: Boss[],
  entries: CharBossEntry[],
  characters: Character[],
): BossTimer[] {
  const bossById = new Map(bosses.map((b) => [b.id, b]));
  const charById = new Map(characters.map((c) => [c.id, c]));

  const groups = new Map<string, CharBossEntry[]>();
  for (const entry of entries) {
    const key = groupKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  // 트 번호는 입장 시각 순이다 — 목록 정렬(최신순)과 다르므로 여기서 다시 정렬한다
  for (const group of groups.values()) {
    group.sort((a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime());
  }

  return entries
    .flatMap((entry) => {
      const boss = bossById.get(entry.bossId);
      const character = charById.get(entry.characterId);
      if (!boss || !character) return [];

      return [
        {
          bossId: boss.id,
          bossName: boss.name,
          cooldownHours: boss.cooldownHours,
          entryId: entry.id,
          enteredAt: entry.enteredAt,
          nextAt: nextAvailableAt(entry.enteredAt, boss.cooldownHours),
          characterId: character.id,
          characterName: character.nickname,
          attemptNumber: groups.get(groupKey(entry))!.indexOf(entry) + 1,
          maxEntries: boss.maxEntries,
        },
      ];
    })
    .sort((a, b) => a.nextAt - b.nextAt);
}

/** 보스별로 지금 쿨타임이 도는 기록 수 */
export function cooldownCounts(bosses: Boss[], entries: CharBossEntry[]): Map<string, number> {
  const now = Date.now();
  const bossById = new Map(bosses.map((b) => [b.id, b]));
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const boss = bossById.get(entry.bossId);
    if (boss && nextAvailableAt(entry.enteredAt, boss.cooldownHours) > now) {
      counts.set(entry.bossId, (counts.get(entry.bossId) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * 지금 입장 기록을 남길 수 있는 보스.
 * 쿨타임이 도는 기록 수가 maxEntries 미만이면 아직 여유가 있다.
 */
export function bossesAvailableForEntry(bosses: Boss[], entries: CharBossEntry[]): Boss[] {
  const counts = cooldownCounts(bosses, entries);
  return bosses.filter((b) => (counts.get(b.id) ?? 0) < b.maxEntries);
}
