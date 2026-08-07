import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus } from 'lucide-react';
import { addChecklistTemplate, getCharacters, type ChecklistCycle } from '@/features/helper/api';
import { getTodayKST, getWeekStartKST } from '@/lib/date';
import { useCharacterStore } from '@/stores/useCharacterStore';
import { toast } from '@/stores/useToastStore';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CharacterSelector } from '@/features/helper/characters/CharacterSelector';
import { ChecklistView } from '@/features/helper/checklist/ChecklistView';
import { ChecklistTemplateModal } from '@/features/helper/checklist/ChecklistTemplateModal';

/**
 * 주기별 탭. periodDate 를 여기서 계산해 ChecklistView 에 넘긴다 —
 * 상수만 채우는 래퍼 컴포넌트를 주기마다 따로 두지 않기 위함이다.
 */
const TABS = [
  { cycle: 'DAILY', label: '일간', getPeriod: getTodayKST },
  { cycle: 'WEEKLY', label: '주간', getPeriod: getWeekStartKST },
] as const satisfies readonly {
  cycle: ChecklistCycle;
  label: string;
  getPeriod: () => string;
}[];

/** 숙제 체크리스트 — 항목은 계정 단위, 완료는 캐릭터 × 기간 단위 (MERGE_PLAN §7 2단계) */
export function ChecklistPage() {
  const queryClient = useQueryClient();
  const selectedCharacterId = useCharacterStore((s) => s.selectedCharacterId);
  const [activeCycle, setActiveCycle] = useState<ChecklistCycle>('DAILY');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ['characters'],
    queryFn: getCharacters,
  });

  const addMutation = useMutation({
    mutationFn: addChecklistTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklistTemplates'] });
      toast.success('항목이 추가되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '항목 추가에 실패했습니다.'),
  });

  const activeTab = TABS.find((t) => t.cycle === activeCycle)!;

  return (
    <div>
      <PageHeader
        actions={
          selectedCharacterId && (
            <Button onClick={() => setIsModalOpen(true)} size="sm" variant="secondary">
              <Plus className="h-4 w-4" />
              항목 추가
            </Button>
          )
        }
        description="항목은 계정 전체가 공유하고, 완료 여부는 캐릭터마다 따로 기록됩니다."
        title="숙제 체크리스트"
      />

      <div className="mb-6">
        <CharacterSelector characters={characters} className="max-w-xs" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : !selectedCharacterId ? (
        <EmptyState
          Icon={ListChecks}
          description="체크리스트를 보려면 캐릭터를 먼저 등록·선택해야 합니다."
          title="캐릭터를 선택하세요"
        />
      ) : (
        <>
          <div className="border-border-subtle mb-5 flex border-b">
            {TABS.map(({ cycle, label }) => (
              <button
                key={cycle}
                className={cn(
                  'relative px-4 py-2 text-sm font-medium transition-colors',
                  activeCycle === cycle
                    ? 'text-brand-600'
                    : 'text-text-muted hover:text-text-secondary',
                )}
                onClick={() => setActiveCycle(cycle)}
                type="button"
              >
                {label}
                {activeCycle === cycle && (
                  <span className="bg-brand-500 absolute inset-x-0 bottom-0 h-0.5 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <ChecklistView
            characterId={selectedCharacterId}
            cycle={activeCycle}
            emptyTitle={`${activeTab.label} 항목이 없습니다`}
            periodDate={activeTab.getPeriod()}
          />
        </>
      )}

      <ChecklistTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(name, cycle) => addMutation.mutate({ name, cycle })}
      />
    </div>
  );
}
