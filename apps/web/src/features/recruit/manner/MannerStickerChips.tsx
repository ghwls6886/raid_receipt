import { cn } from '@/lib/cn';
import { getSticker, type MannerSticker, type StickerTone } from './domain';

/**
 * 미선택 상태는 색을 빼고 중립으로 둔다.
 * 연한 톤 배경을 깔면 아무것도 안 골랐는데 이미 선택된 것처럼 보인다.
 * 색은 호버(예고)와 선택(확정)에만 쓴다.
 */
const TONE_STYLES: Record<StickerTone, { idle: string; active: string }> = {
  positive: {
    idle: 'border-border-default bg-bg-card text-text-secondary hover:border-emerald-400 hover:text-emerald-700',
    active: 'border-emerald-500 bg-emerald-500 text-white shadow-sm',
  },
  negative: {
    idle: 'border-border-default bg-bg-card text-text-secondary hover:border-rose-400 hover:text-rose-700',
    active: 'border-rose-500 bg-rose-500 text-white shadow-sm',
  },
};

// ─── 선택형 (평가 작성 시) ───────────────────────────────────────

interface StickerPickerProps {
  stickers: readonly MannerSticker[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  /** 최대 개수에 도달하면 미선택 항목을 비활성화한다. */
  maxReached: boolean;
  disabled?: boolean;
}

export function StickerPicker({
  stickers,
  selectedIds,
  onToggle,
  maxReached,
  disabled = false,
}: StickerPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {stickers.map((sticker) => {
        const isSelected = selectedIds.includes(sticker.id);
        const isDisabled = disabled || (maxReached && !isSelected);
        const styles = TONE_STYLES[sticker.tone];

        return (
          <button
            key={sticker.id}
            aria-pressed={isSelected}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:ring-brand-500 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
              isSelected ? styles.active : styles.idle,
              isDisabled && !isSelected && 'cursor-not-allowed opacity-40',
            )}
            disabled={isDisabled}
            onClick={() => onToggle(sticker.id)}
            type="button"
          >
            <span aria-hidden="true">{sticker.emoji}</span>
            {sticker.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 집계형 (프로필 표시) ────────────────────────────────────────

const COUNT_TONE: Record<StickerTone, string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  negative: 'border-rose-200 bg-rose-50 text-rose-800',
};

interface StickerCountListProps {
  /** 스티커 id → 받은 횟수 (manner_profiles.sticker_counts) */
  counts: Readonly<Record<string, number>>;
  /** 상위 몇 개까지 보여줄지 */
  limit?: number;
  emptyText?: string;
}

/** 받은 스티커를 많은 순으로 보여준다. */
export function StickerCountList({
  counts,
  limit = 6,
  emptyText = '아직 받은 스티커가 없습니다.',
}: StickerCountListProps) {
  const entries = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  if (entries.length === 0) {
    return <p className="text-text-tertiary text-sm">{emptyText}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map(([id, count]) => {
        // 스티커 목록에서 사라진 id 가 집계에 남아 있을 수 있다 (예전 평가).
        const sticker = getSticker(id);
        if (!sticker) return null;

        return (
          <li
            key={id}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              COUNT_TONE[sticker.tone],
            )}
          >
            <span aria-hidden="true">{sticker.emoji}</span>
            {sticker.label}
            <span className="tabular-nums opacity-70">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
