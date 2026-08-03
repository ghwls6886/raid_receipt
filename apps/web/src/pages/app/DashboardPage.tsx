import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, Wallet, CalendarDays, Crown, ArrowRight } from 'lucide-react';
import { useCurrentGuild } from '@/stores/useGuildStore';
import { getDashboardStats, getRaids, getBossAverages, getMemberStats } from '@/lib/api';
import { formatMesoCompact } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { RaidTable } from '@/components/raids/RaidTable';
import { LineChart } from '@/components/charts/LineChart';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BossTimerCard } from '@/components/dashboard/BossTimerCard';
import { cn } from '@/lib/cn';

const RANK_TONE = [
  'bg-warning-100 text-warning-700',
  'bg-bg-muted text-text-secondary',
  'bg-brand-50 text-brand-700',
];

/** 대시보드 — 원프레임 벤토 레이아웃 (명세서 §8) */
export function DashboardPage() {
  const navigate = useNavigate();
  const guild = useCurrentGuild();

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', guild.id],
    queryFn: () => getDashboardStats(guild.id),
  });
  const raidsQuery = useQuery({ queryKey: ['raids', guild.id], queryFn: () => getRaids(guild.id) });
  const bossAvgQuery = useQuery({
    queryKey: ['boss-averages', guild.id],
    queryFn: () => getBossAverages(guild.id),
  });
  const memberStatsQuery = useQuery({
    queryKey: ['member-stats', guild.id],
    queryFn: () => getMemberStats(guild.id),
  });

  const stats = statsQuery.data;
  const raids = useMemo(() => raidsQuery.data ?? [], [raidsQuery.data]);
  const bossAvgs = bossAvgQuery.data ?? [];
  const memberStats = memberStatsQuery.data ?? [];
  const maxAvg = Math.max(1, ...bossAvgs.map((b) => b.avgPerPerson));

  const monthly = useMemo(() => {
    const confirmed = raids.filter((r) => r.status === 'confirmed');
    const months = [...new Set(confirmed.map((r) => r.date.slice(0, 7)))].sort();
    return {
      hasData: months.length > 0,
      labels: months.map((m) => `${m.slice(5)}월`),
      net: months.map((m) =>
        confirmed.filter((r) => r.date.startsWith(m)).reduce((s, r) => s + r.netProfit, 0),
      ),
    };
  }, [raids]);

  return (
    <div>
      <PageHeader
        title="대시보드"
        description={`${guild.serverName} · ${guild.guildName}`}
        actions={
          <Button onClick={() => navigate('/raids/new')}>
            <Plus className="h-4 w-4" /> 레이드 추가
          </Button>
        }
      />

      {/* 스탯 타일 */}
      {statsQuery.isLoading || !stats ? (
        <Card className="mb-4 p-8">
          <LoadingState message="집계 중..." />
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="이번 달 순수익"
            value={`${formatMesoCompact(stats.monthNetProfit)} 메소`}
            Icon={TrendingUp}
            tone="success"
          />
          <StatTile
            label="누적 순수익"
            value={`${formatMesoCompact(stats.totalNetProfit)} 메소`}
            Icon={Wallet}
            tone="brand"
          />
          <StatTile label="레이드 횟수" value={`${stats.raidCount}회`} Icon={CalendarDays} tone="brand" />
          <StatTile
            label="참여도 1위"
            value={stats.topContributor?.name ?? '—'}
            sub={stats.topContributor ? `${stats.topContributor.raidCount}회 참여` : undefined}
            Icon={Crown}
            tone="violet"
          />
        </div>
      )}

      {/* 보스 입장 쿨타임 — 정산 전에 "지금 들어갔다"를 남기는 자리 */}
      <BossTimerCard />

      {/* 벤토: 차트 + 참여도 + 보스별 평균 */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {/* 월별 순수익 */}
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-card-title mb-3">월별 순수익</h2>
          {monthly.hasData ? (
            <LineChart
              labels={monthly.labels}
              series={[{ name: '순수익', color: '#f97316', values: monthly.net }]}
              yFormat={formatMesoCompact}
            />
          ) : (
            <p className="text-text-muted py-8 text-center text-sm">확정 레이드가 쌓이면 표시됩니다.</p>
          )}
        </Card>

        {/* 참여도 랭킹 (세로로 길게) */}
        <Card className="p-4 lg:row-span-2">
          <h2 className="text-card-title mb-3">참여도 랭킹</h2>
          {memberStats.length === 0 ? (
            <p className="text-text-muted py-8 text-center text-sm">데이터가 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {memberStats.slice(0, 8).map((m, i) => (
                <li key={m.memberId} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      RANK_TONE[i] ?? 'bg-bg-muted text-text-muted',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="text-text-primary text-sm font-medium">{m.nickname}</span>
                      <span className="text-text-tertiary ml-1 text-xs">{m.job}</span>
                    </div>
                    <div className="text-text-tertiary text-xs tabular-nums">
                      {formatMesoCompact(m.totalReceived)} 메소
                    </div>
                  </div>
                  <span className="text-text-secondary shrink-0 text-sm tabular-nums">
                    {m.raidCount}회
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 보스별 1인당 평균 */}
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-card-title mb-3">보스별 1인당 평균</h2>
          {bossAvgs.length === 0 ? (
            <p className="text-text-muted py-8 text-center text-sm">데이터가 없습니다.</p>
          ) : (
            <div className="space-y-2.5">
              {bossAvgs.slice(0, 6).map((b) => (
                <div key={b.bossName}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-text-primary font-medium">{b.bossName}</span>
                    <span className="text-text-secondary tabular-nums">
                      {formatMesoCompact(b.avgPerPerson)} 메소
                      <span className="text-text-muted ml-1 text-xs">· {b.raidCount}회</span>
                    </span>
                  </div>
                  <div className="bg-bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-brand-500 h-full rounded-full"
                      style={{ width: `${Math.round((b.avgPerPerson / maxAvg) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 최근 레이드 */}
      <Card>
        <div className="border-border-subtle flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-card-title">최근 레이드</h2>
          <button
            className="text-text-link hover:text-text-link-hover flex items-center gap-1 text-sm font-medium"
            onClick={() => navigate('/raids')}
            type="button"
          >
            전체 보기 <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {raidsQuery.isLoading ? (
          <div className="p-8">
            <LoadingState message="불러오는 중..." />
          </div>
        ) : (
          <RaidTable
            rows={raids.slice(0, 4)}
            emptyText="아직 레이드가 없습니다. 첫 레이드를 추가해 보세요."
          />
        )}
      </Card>
    </div>
  );
}
