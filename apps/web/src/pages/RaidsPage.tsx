import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useCurrentGuild } from '@/stores/useGuildStore';
import { getRaids, type RaidRow } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { RaidTable } from '@/components/raids/RaidTable';
import { LineChart, type LineChartSeries } from '@/components/charts/LineChart';
import { LoadingState } from '@/components/feedback/LoadingState';

const PALETTE = ['#f97316', '#8b5cf6', '#10b981', '#3b82f6', '#ef4444', '#64748b'];
const TEMP_PARTY = '임시 공대';
const colorAt = (i: number): string => PALETTE[i % PALETTE.length] ?? '#64748b';

type StatusFilter = 'all' | 'confirmed' | 'draft' | 'unsent';

interface PartyGroup {
  name: string;
  rows: RaidRow[];
}

/** 공대명으로 그룹핑 (null = 임시 공대), 횟수 많은 순 */
function groupByParty(rows: RaidRow[]): PartyGroup[] {
  const map = new Map<string, RaidRow[]>();
  for (const r of rows) {
    const key = r.partyName ?? TEMP_PARTY;
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .map(([name, groupRows]) => ({ name, rows: groupRows }))
    .sort((a, b) => b.rows.length - a.rows.length);
}

function matchesStatus(r: RaidRow, f: StatusFilter): boolean {
  if (f === 'confirmed') return r.status === 'confirmed';
  if (f === 'draft') return r.status === 'draft';
  if (f === 'unsent') return !r.sent;
  return true;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** anchor(YYYY-MM)에서 끝나는 최근 n개월 (오름차순) */
function lastMonths(anchorYM: string, n: number): string[] {
  const parts = anchorYM.split('-');
  let year = Number(parts[0]) || new Date().getFullYear();
  let mon = Number(parts[1]) || 1;
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${year}-${String(mon).padStart(2, '0')}`);
    mon -= 1;
    if (mon === 0) {
      mon = 12;
      year -= 1;
    }
  }
  return out;
}

/** 레이드 이력 (명세서 §5) — 조회 조건 + 공대별 그룹핑 + 요약 + 일자별 라인차트 */
export function RaidsPage() {
  const navigate = useNavigate();
  const guild = useCurrentGuild();
  const { data, isLoading } = useQuery({
    queryKey: ['raids', guild.id],
    queryFn: () => getRaids(guild.id),
  });

  const [month, setMonth] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');

  const raids = useMemo(() => data ?? [], [data]);
  const months = useMemo(
    () => [...new Set(raids.map((r) => r.date.slice(0, 7)))].sort().reverse(),
    [raids],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return raids.filter((r) => {
      if (month !== 'all' && !r.date.startsWith(month)) return false;
      if (!matchesStatus(r, status)) return false;
      if (query) {
        const hay = `${r.bossName} ${r.partyName ?? TEMP_PARTY}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [raids, month, status, q]);

  const groups = useMemo(() => groupByParty(filtered), [filtered]);
  const chartMonths = useMemo(() => {
    const all = raids.map((r) => r.date.slice(0, 7)).sort();
    const anchor = all[all.length - 1] ?? currentYearMonth();
    return lastMonths(anchor, 6);
  }, [raids]);
  const series: LineChartSeries[] = useMemo(
    () =>
      groups.map((g, i) => ({
        name: g.name,
        color: colorAt(i),
        values: chartMonths.map((ym) => g.rows.filter((r) => r.date.startsWith(ym)).length),
      })),
    [groups, chartMonths],
  );

  const onEdit = (row: RaidRow) => navigate(`/raids/${row.id}/edit`);

  return (
    <div>
      <PageHeader
        title="레이드"
        description="공대별 이력과 요약 · 임시저장/미발송 건은 수정할 수 있습니다"
        actions={
          <Button onClick={() => navigate('/raids/new')}>
            <Plus className="h-4 w-4" /> 레이드 추가
          </Button>
        }
      />

      {/* 조회 조건 */}
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Select className="w-40" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">전체 기간</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace('-', '.')}
            </option>
          ))}
        </Select>
        <Select
          className="w-32"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">전체 상태</option>
          <option value="confirmed">확정</option>
          <option value="draft">임시</option>
          <option value="unsent">미발송</option>
        </Select>
        <div className="relative min-w-40 flex-1">
          <Search className="text-text-muted pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder="보스·공대명 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-10">
          <LoadingState message="불러오는 중..." />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <RaidTable rows={[]} emptyText="조건에 맞는 레이드가 없습니다." />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 공대별 요약 */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-card-title">공대별 요약</h2>
              <span className="text-text-tertiary text-xs">총 {filtered.length}회</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.map((g, i) => (
                <div
                  key={g.name}
                  className="border-border-subtle flex items-center gap-2 rounded-lg border px-3 py-1.5"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorAt(i) }} />
                  <span className="text-text-primary text-sm font-medium">{g.name}</span>
                  <span className="text-text-secondary text-sm tabular-nums">{g.rows.length}회</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 일자별 라인차트 */}
          <Card className="p-5">
            <h2 className="text-card-title mb-3">월별 공대 레이드 횟수 (최근 6개월)</h2>
            <LineChart
              labels={chartMonths.map((ym) => `${ym.slice(5)}월`)}
              series={series}
              height={120}
            />
          </Card>

          {/* 공대별 목록 */}
          {groups.map((g, i) => (
            <Card key={g.name} className="overflow-hidden">
              <div className="border-border-subtle flex items-center gap-2 border-b px-5 py-3">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorAt(i) }} />
                <h3 className="text-card-title">{g.name}</h3>
                <span className="text-text-muted text-xs">{g.rows.length}회</span>
              </div>
              <RaidTable rows={g.rows} onEdit={onEdit} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
