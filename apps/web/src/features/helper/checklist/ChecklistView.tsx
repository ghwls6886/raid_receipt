import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import {
  getChecklistCompletions,
  getChecklistTemplates,
  removeChecklistTemplate,
  toggleChecklistCompletion,
  type ChecklistCycle,
} from '@/features/helper/api';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChecklistItem } from '@/features/helper/checklist/ChecklistItem';

interface ChecklistViewProps {
  characterId: string;
  cycle: ChecklistCycle;
  /** 기간 키 "YYYY-MM-DD" — 일간/주간 뷰가 @/lib/date 로 계산해 넘긴다 */
  periodDate: string;
  emptyTitle: string;
}

/**
 * 한 주기(일간 또는 주간)의 체크리스트.
 *
 * 템플릿은 계정 단위라 캐릭터를 바꿔도 같지만, 완료 기록은 캐릭터 × 기간 단위다.
 * 그래서 완료 쿼리 키에만 characterId 와 periodDate 가 들어간다.
 */
export function ChecklistView({ characterId, cycle, periodDate, emptyTitle }: ChecklistViewProps) {
  const queryClient = useQueryClient();

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['checklistTemplates'],
    queryFn: getChecklistTemplates,
  });
  const templates = allTemplates.filter((t) => t.cycle === cycle);

  const { data: completions = [] } = useQuery({
    queryKey: ['checklistCompletions', characterId, periodDate],
    queryFn: () => getChecklistCompletions(characterId, periodDate),
    enabled: Boolean(characterId),
  });

  const toggleMutation = useMutation({
    mutationFn: (templateId: string) =>
      toggleChecklistCompletion(templateId, characterId, periodDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['checklistCompletions', characterId, periodDate],
      });
    },
    onError: (e: Error) => toast.error(e.message || '체크리스트 변경에 실패했습니다.'),
  });

  const removeMutation = useMutation({
    mutationFn: removeChecklistTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklistTemplates'] });
      toast.success('항목이 삭제되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '항목 삭제에 실패했습니다.'),
  });

  const handleRemove = async (templateId: string, name: string) => {
    const ok = await confirm.danger(`"${name}" 항목을 삭제하시겠습니까?`, '항목 삭제');
    if (ok) removeMutation.mutate(templateId);
  };

  if (templates.length === 0) {
    return (
      <EmptyState
        Icon={ListChecks}
        description="항목 추가 버튼으로 체크리스트를 만들어 보세요."
        title={emptyTitle}
      />
    );
  }

  const completedCount = templates.filter((t) =>
    completions.some((c) => c.templateId === t.id),
  ).length;
  const progressPercent = Math.round((completedCount / templates.length) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="bg-bg-muted h-2 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-brand-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${String(progressPercent)}%` }}
          />
        </div>
        <span className="text-text-secondary text-xs font-medium">
          {completedCount}/{templates.length}
        </span>
      </div>

      {templates.map((template) => (
        <ChecklistItem
          key={template.id}
          disabled={toggleMutation.isPending || removeMutation.isPending}
          isCompleted={completions.some((c) => c.templateId === template.id)}
          onRemove={() => void handleRemove(template.id, template.name)}
          onToggle={() => toggleMutation.mutate(template.id)}
          template={template}
        />
      ))}
    </div>
  );
}
