import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Shield, Timer } from 'lucide-react';
import { getCharacters } from '@/features/helper/api';
import { useCharacterStore } from '@/stores/useCharacterStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CharacterSelector } from '@/features/helper/characters/CharacterSelector';
import { BossTimerDashboard } from '@/features/helper/boss-tracker/BossTimerDashboard';
import { BossRegistrationModal } from '@/features/helper/boss-tracker/BossRegistrationModal';

/**
 * 개인 보스 타이머 — 캐릭터별 재입장 쿨타임 (MERGE_PLAN §7 2단계).
 *
 * 정산 대시보드의 보스 타이머와 다르다. 저쪽은 공대가 같이 도는 쿨타임이고
 * 여기는 내 캐릭터 각각의 쿨타임이다 (함정 2).
 */
export function BossTrackerPage() {
  const selectedCharacterId = useCharacterStore((s) => s.selectedCharacterId);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ['characters'],
    queryFn: getCharacters,
  });

  return (
    <div>
      <PageHeader
        actions={
          selectedCharacterId && (
            <div className="flex items-center gap-2">
              <Link
                className="text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                to="/boss-tracker/history"
              >
                <CalendarDays className="h-4 w-4" />
                입장 기록
              </Link>
              <Button onClick={() => setIsRegistrationOpen(true)} size="sm" variant="secondary">
                <Shield className="h-4 w-4" />
                보스 등록 관리
              </Button>
            </div>
          )
        }
        description="입장을 기록하면 보스별 재입장 가능 시각을 계산해 보여줍니다."
        title="보스 타이머"
      />

      <div className="mb-6">
        <CharacterSelector characters={characters} className="max-w-xs" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : !selectedCharacterId ? (
        <EmptyState
          Icon={Timer}
          description="보스 타이머를 보려면 캐릭터를 먼저 등록·선택해야 합니다."
          title="캐릭터를 선택하세요"
        />
      ) : (
        <BossTimerDashboard characterId={selectedCharacterId} />
      )}

      {selectedCharacterId && (
        <BossRegistrationModal
          characterId={selectedCharacterId}
          isOpen={isRegistrationOpen}
          onClose={() => setIsRegistrationOpen(false)}
        />
      )}
    </div>
  );
}
