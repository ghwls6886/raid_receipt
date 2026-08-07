import { Check, Trash2 } from 'lucide-react';
import type { ChecklistTemplate } from '@/features/helper/api';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface ChecklistItemProps {
  template: ChecklistTemplate;
  isCompleted: boolean;
  onToggle: () => void;
  onRemove: () => void;
  disabled: boolean;
}

const CYCLE_LABEL: Record<ChecklistTemplate['cycle'], string> = {
  DAILY: '일간',
  WEEKLY: '주간',
};

const CYCLE_TONE: Record<ChecklistTemplate['cycle'], 'brand' | 'warning'> = {
  DAILY: 'brand',
  WEEKLY: 'warning',
};

export function ChecklistItem({
  template,
  isCompleted,
  onToggle,
  onRemove,
  disabled,
}: ChecklistItemProps) {
  return (
    <Card
      className={cn(
        'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors',
        disabled && 'pointer-events-none opacity-50',
        isCompleted && 'bg-bg-muted',
      )}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
          isCompleted
            ? 'border-brand-500 bg-brand-500 text-white'
            : 'border-border-default bg-bg-card',
        )}
      >
        {isCompleted && <Check className="h-3.5 w-3.5" />}
      </div>

      <span
        className={cn(
          'flex-1 text-sm font-medium',
          isCompleted ? 'text-text-muted line-through' : 'text-text-primary',
        )}
      >
        {template.name}
      </span>

      <Badge tone={CYCLE_TONE[template.cycle]}>{CYCLE_LABEL[template.cycle]}</Badge>

      {/* 카드 전체가 토글 버튼이라 삭제는 이벤트 전파를 끊어야 한다 */}
      <button
        aria-label={`${template.name} 항목 삭제`}
        className="text-text-tertiary hover:text-error-600 shrink-0 rounded-md p-1"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Card>
  );
}
