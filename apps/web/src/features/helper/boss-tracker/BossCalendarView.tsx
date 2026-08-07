import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { getCharBossEntriesByMonth, type CharBossEntry } from '@/features/helper/api';
import { getBossColor } from '@/features/helper/bossColors';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/feedback/LoadingState';

interface BossCalendarViewProps {
  characterId: string;
  year: number;
  /** 1-12 (Date 의 0-based month 가 아니다) */
  month: number;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 날짜(1-31) → 그날의 기록들 */
function groupByDay(entries: CharBossEntry[]): Map<number, CharBossEntry[]> {
  const map = new Map<number, CharBossEntry[]>();
  for (const entry of entries) {
    const day = new Date(entry.enteredAt).getDate();
    const list = map.get(day);
    if (list) list.push(entry);
    else map.set(day, [entry]);
  }
  return map;
}

/**
 * 월별 입장 기록 달력.
 *
 * 날짜 칸에는 그날 들어간 보스의 **색 점만** 찍는다 — 칸이 작아서 이름을 넣으면 못 읽는다.
 * 자세한 내역은 칸을 눌러 아래에서 본다. 색은 타이머 화면과 같은 팔레트를 쓰므로
 * 점만 보고도 어느 보스인지 감이 온다.
 */
export function BossCalendarView({ characterId, year, month }: BossCalendarViewProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['charBossEntriesByMonth', characterId, year, month],
    queryFn: () => getCharBossEntriesByMonth(characterId, year, month),
    enabled: Boolean(characterId),
  });

  const entriesByDay = useMemo(() => groupByDay(entries), [entries]);

  // month 는 1-based, Date 는 0-based. new Date(y, m, 0) 은 "m월의 0일" = 이전 달 말일이라
  // 그대로 그 달의 일수가 된다.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedEntries = selectedDay === null ? [] : (entriesByDay.get(selectedDay) ?? []);

  if (isLoading) return <LoadingState />;

  return (
    <Card className="p-4">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label) => (
          <div key={label} className="text-text-tertiary py-2 text-center text-xs font-medium">
            {label}
          </div>
        ))}

        {cells.map((day, idx) => {
          if (day === null) return <div key={`pad-${String(idx)}`} />;

          const dayEntries = entriesByDay.get(day) ?? [];
          const isSelected = day === selectedDay;
          // 같은 보스를 두 번 들어가도 점은 하나만 — 칸이 좁다
          const bossIds = [...new Set(dayEntries.map((e) => e.bossId))];

          return (
            <button
              key={day}
              className={cn(
                'flex h-12 flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors',
                isSelected
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-text-primary hover:bg-bg-hover',
              )}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              type="button"
            >
              <span>{day}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {bossIds.slice(0, 4).map((bossId) => (
                  <span
                    key={bossId}
                    className={cn('h-1.5 w-1.5 rounded-full', getBossColor(bossId).dot)}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay !== null && (
        <div className="border-border-subtle mt-4 border-t pt-4">
          <h3 className="text-text-primary mb-2 text-sm font-semibold">
            {month}월 {selectedDay}일 입장 기록
          </h3>

          {selectedEntries.length === 0 ? (
            <p className="text-text-tertiary py-4 text-center text-sm">
              이 날은 입장 기록이 없습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {selectedEntries.map((entry) => {
                const color = getBossColor(entry.bossId);
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'bg-bg-muted flex items-center gap-3 rounded-lg border-l-4 px-3 py-2',
                      color.border,
                    )}
                  >
                    <CalendarDays className={cn('h-4 w-4 shrink-0', color.text)} />
                    <div className="min-w-0 flex-1">
                      <span className="text-text-primary text-sm font-medium">
                        {entry.bossName}
                      </span>
                      {entry.note && (
                        <span className="text-text-tertiary ml-2 text-xs">{entry.note}</span>
                      )}
                    </div>
                    <span className="text-text-secondary shrink-0 text-xs">
                      {formatClock(entry.enteredAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
