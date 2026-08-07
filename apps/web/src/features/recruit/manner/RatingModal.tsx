import { useState } from 'react';
import { Check, Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { categoryLabel } from '@/features/recruit/constants';
import type { RatingSession, RatingTarget } from './api';
import {
  MAX_STICKERS_PER_RATING,
  RATING_LABELS,
  RATING_TRIGGER_LABELS,
  stickersFor,
  type RatingValue,
} from './domain';
import { MannerTemperatureBadge } from './MannerTemperature';
import { StickerPicker } from './MannerStickerChips';

const RATING_OPTIONS: readonly {
  value: RatingValue;
  Icon: typeof ThumbsUp;
  active: string;
}[] = [
  { value: 'LIKE', Icon: ThumbsUp, active: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { value: 'NEUTRAL', Icon: Minus, active: 'border-slate-400 bg-slate-100 text-slate-700' },
  { value: 'DISLIKE', Icon: ThumbsDown, active: 'border-rose-500 bg-rose-50 text-rose-700' },
];

interface RatingModalProps {
  session: RatingSession;
  target: RatingTarget;
  /** 여러 명을 연속 평가할 때 진행 상황 (1명뿐이면 생략) */
  progress?: { current: number; total: number };
  onSubmit: (value: RatingValue, stickerIds: string[]) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

/** 파티원 한 명에 대한 평가 입력 — 여러 명 순회는 RatingFlowModal 이 맡는다 */
export function RatingModal({
  session,
  target,
  progress,
  onSubmit,
  onClose,
  isSubmitting,
}: RatingModalProps) {
  const [value, setValue] = useState<RatingValue | null>(null);
  const [stickerIds, setStickerIds] = useState<string[]>([]);

  // 평가를 바꾸면 이전 톤의 스티커는 더 이상 유효하지 않으므로 비운다.
  const handleValueChange = (next: RatingValue) => {
    setValue(next);
    setStickerIds([]);
  };

  const toggleSticker = (id: string) => {
    setStickerIds((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= MAX_STICKERS_PER_RATING) return prev;
      return [...prev, id];
    });
  };

  const availableStickers = value ? stickersFor(value) : [];

  const title = (
    <div>
      <div className="flex items-center gap-2">
        <span>파티원 평가</span>
        {progress && progress.total > 1 && (
          <span className="bg-bg-muted text-text-secondary rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
            {progress.current}/{progress.total}
          </span>
        )}
      </div>
      <p className="text-text-tertiary mt-0.5 text-xs font-normal">
        {RATING_TRIGGER_LABELS[session.trigger]} · {categoryLabel(session.category)} ·{' '}
        {session.postTitle}
      </p>
    </div>
  );

  const footer = (
    <>
      <Button disabled={isSubmitting} onClick={onClose} type="button" variant="secondary">
        나중에
      </Button>
      <Button
        disabled={value === null || isSubmitting}
        onClick={() => {
          if (value) onSubmit(value, stickerIds);
        }}
        type="button"
      >
        <Check className="h-4 w-4" /> 평가 남기기
      </Button>
    </>
  );

  return (
    <Modal
      // 되돌릴 수 없는 입력이라 오버레이를 잘못 눌러 고른 내용이 날아가면 안 된다.
      closeOnOverlayClick={false}
      footer={footer}
      isOpen
      maxWidth={448}
      onClose={onClose}
      title={title}
      width="100%"
    >
      <div className="flex flex-col gap-5">
        {/* 평가 대상 */}
        <div className="bg-bg-muted flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
          <div>
            <p className="text-text-primary text-sm font-semibold">{target.nickname}</p>
            <p className="text-text-tertiary text-xs">
              Lv.{target.level} {target.job}
            </p>
          </div>
          <MannerTemperatureBadge temperature={target.temperature} />
        </div>

        {/* 좋아요 / 보통 / 싫어요 */}
        <fieldset className="flex flex-col gap-2" disabled={isSubmitting}>
          <legend className="text-text-primary mb-2 text-sm font-medium">
            이 파티원과 함께한 경험은 어땠나요?
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {RATING_OPTIONS.map((option) => {
              const isActive = value === option.value;

              return (
                <button
                  key={option.value}
                  aria-pressed={isActive}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border-2 px-2 py-3 text-xs font-medium transition-colors',
                    'focus-visible:ring-brand-500 focus-visible:ring-2 focus-visible:outline-none',
                    isActive
                      ? option.active
                      : 'border-border-subtle text-text-secondary hover:bg-bg-muted',
                  )}
                  onClick={() => handleValueChange(option.value)}
                  type="button"
                >
                  <option.Icon className="h-5 w-5" />
                  {RATING_LABELS[option.value]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* 스티커 — 평가를 고른 뒤에만, 해당 톤만 노출 */}
        {value !== null && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-text-primary text-sm font-medium">
                스티커 <span className="text-text-tertiary font-normal">(선택)</span>
              </span>
              <span className="text-text-tertiary text-xs tabular-nums">
                {stickerIds.length}/{MAX_STICKERS_PER_RATING}
              </span>
            </div>

            {availableStickers.length > 0 ? (
              <StickerPicker
                disabled={isSubmitting}
                maxReached={stickerIds.length >= MAX_STICKERS_PER_RATING}
                onToggle={toggleSticker}
                selectedIds={stickerIds}
                stickers={availableStickers}
              />
            ) : (
              <p className="text-text-tertiary text-sm">
                &lsquo;보통이에요&rsquo;에는 스티커를 붙이지 않습니다.
              </p>
            )}
          </div>
        )}

        <p className="text-text-tertiary border-border-subtle border-t pt-3 text-[11px] leading-relaxed">
          평가는 상대에게 익명으로 반영되며, 되돌릴 수 없습니다. 좋아요는 매너온도를 0.5°C 올리고
          싫어요는 0.5°C 내립니다.
        </p>
      </div>
    </Modal>
  );
}
