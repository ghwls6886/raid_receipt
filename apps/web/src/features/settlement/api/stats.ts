/**
 * 집계 — 보스별 평균 · 공대원 통계
 */
import { supabase, throwIfError } from '@/lib/supabase';
import { getRaids } from './raids';

// ─── 대시보드 집계 ──────────────────────────────────────────
export interface BossAverage {
  bossName: string;
  avgPerPerson: number;
  raidCount: number;
}

/** P7 에서 view/RPC 집계로 교체 예정 — 지금은 클라이언트 집계 */
export async function getBossAverages(guildId: string): Promise<BossAverage[]> {
  const rows = await getRaids(guildId);
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of confirmed) {
    const cur = map.get(r.bossName) ?? { sum: 0, count: 0 };
    cur.sum += r.perPerson;
    cur.count += 1;
    map.set(r.bossName, cur);
  }
  return [...map.entries()]
    .map(([bossName, v]) => ({
      bossName,
      avgPerPerson: Math.round(v.sum / v.count),
      raidCount: v.count,
    }))
    .sort((a, b) => b.avgPerPerson - a.avgPerPerson);
}

export interface MemberStat {
  memberId: string;
  nickname: string;
  job: string;
  raidCount: number;
  totalReceived: number;
}

/** 한 번에 가져올 행 수. Supabase 기본 상한(1000)보다 낮게 잡아 페이지 경계를 명확히 한다 */
const PAGE_SIZE = 1000;

/**
 * P7 에서 view/RPC 집계로 교체 예정 — 지금은 클라이언트 집계.
 *
 * raids 를 !inner 조인해 확정 레이드로 좁힌다.
 * 예전에는 raid_id 목록을 먼저 조회해 .in() 으로 넘겼는데,
 *   - 안쪽 쿼리의 error 를 검사하지 않아 실패 시 빈 통계가 조용히 반환됐고
 *   - 확정 레이드가 0건이면 .in('raid_id', []) 이 나갔으며
 *   - 왕복이 2회였다.
 */
export async function getMemberStats(guildId: string): Promise<MemberStat[]> {
  const map = new Map<string, MemberStat>();

  // 참여 행은 레이드 수에 비례해 늘어난다. 한 페이지에서 끊기면 통계가
  // 조용히 축소되므로 마지막 페이지까지 명시적으로 돌린다.
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from('raid_participants')
      .select('member_id, final_amount, members(nickname, job), raids!inner(guild_id, status)')
      .not('member_id', 'is', null)
      .eq('raids.guild_id', guildId)
      .eq('raids.status', 'CONFIRMED')
      .order('member_id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    throwIfError(error);

    const rows = data ?? [];
    for (const p of rows) {
      if (!p.member_id) continue;
      const m = p.members as unknown as { nickname: string; job: string } | null;
      const existing = map.get(p.member_id) ?? {
        memberId: p.member_id,
        nickname: m?.nickname ?? '알수없음',
        job: m?.job ?? '',
        raidCount: 0,
        totalReceived: 0,
      };
      existing.raidCount += 1;
      existing.totalReceived += p.final_amount;
      map.set(p.member_id, existing);
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return [...map.values()].sort((a, b) => b.raidCount - a.raidCount);
}


// ─── 대시보드 요약 ──────────────────────────────────────────
export interface DashboardStats {
  totalNetProfit: number;
  monthNetProfit: number;
  raidCount: number;
  topContributor: { name: string; raidCount: number } | null;
}

export async function getDashboardStats(guildId: string): Promise<DashboardStats> {
  const rows = await getRaids(guildId);
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const totalNetProfit = confirmed.reduce((sum, r) => sum + r.netProfit, 0);

  const latestMonth = rows.reduce((max, r) => (r.date > max ? r.date : max), '').slice(0, 7);
  const monthNetProfit = confirmed
    .filter((r) => r.date.startsWith(latestMonth))
    .reduce((sum, r) => sum + r.netProfit, 0);

  // topContributor: 참여 횟수가 가장 많은 공대원
  let topContributor: DashboardStats['topContributor'] = null;
  try {
    const stats = await getMemberStats(guildId);
    const top = stats[0];
    if (top) {
      topContributor = { name: top.nickname, raidCount: top.raidCount };
    }
  } catch {
    // 집계 실패 시 null 유지
  }

  return {
    totalNetProfit,
    monthNetProfit,
    raidCount: confirmed.length,
    topContributor,
  };
}
