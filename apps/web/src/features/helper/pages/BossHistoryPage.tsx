import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCharacters } from '@/features/helper/api';
import { useCharacterStore } from '@/stores/useCharacterStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CharacterSelector } from '@/features/helper/characters/CharacterSelector';
import { BossCalendarView } from '@/features/helper/boss-tracker/BossCalendarView';

/** 보스 입장 이력 — 월별 달력 (MERGE_PLAN §7 2단계 잔여분) */
export function BossHistoryPage() {
  const selectedCharacterId = useCharacterStore((s) => s.selectedCharacterId);

  // 이번 달로 시작. year/month 를 한 객체로 들고 있어야 12월↔1월을 넘길 때
  // 두 setState 가 따로 돌며 "2026년 13월" 같은 중간 상태가 생기지 않는다.
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const shiftMonth = (delta: number) => {
    setPeriod((prev) => {
      const next = prev.month + delta;
      if (next < 1) return { year: prev.year - 1, month: 12 };
      if (next > 12) return { year: prev.year + 1, month: 1 };
      return { year: prev.year, month: next };
    });
  };

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ['characters'],
    queryFn: getCharacters,
  });

  return (
    <div>
      <PageHeader
        actions={
          <Link
            className="text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
            to="/boss-tracker"
          >
            <ArrowLeft className="h-4 w-4" />
            타이머로 돌아가기
          </Link>
        }
        description="캐릭터별 보스 입장 기록을 달력으로 봅니다. 날짜를 누르면 그날 내역이 나옵니다."
        title="입장 기록"
      />

      <div className="mb-6">
        <CharacterSelector characters={characters} className="max-w-xs" />
      </div>

      <div className="mb-4 flex items-center justify-center gap-4">
        <Button aria-label="이전 달" onClick={() => shiftMonth(-1)} size="sm" variant="ghost">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-text-primary text-sm font-semibold tabular-nums">
          {period.year}년 {period.month}월
        </span>
        <Button aria-label="다음 달" onClick={() => shiftMonth(1)} size="sm" variant="ghost">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : !selectedCharacterId ? (
        <EmptyState
          Icon={CalendarDays}
          description="입장 기록을 보려면 캐릭터를 먼저 등록·선택해야 합니다."
          title="캐릭터를 선택하세요"
        />
      ) : (
        <BossCalendarView
          characterId={selectedCharacterId}
          month={period.month}
          year={period.year}
        />
      )}
    </div>
  );
}
