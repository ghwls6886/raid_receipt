import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** 화살표 한 번에 밀어낼 거리(px) — 칩 두어 개 분량 */
const SCROLL_STEP = 160;

/** scrollLeft 가 소수점으로 떨어질 때가 있어 끝 판정에 여유를 준다 */
const EDGE_EPSILON = 1;

interface ChipScrollerProps {
  children: ReactNode;
  className?: string;
}

/**
 * 칩을 한 줄에 가로로만 흘리는 스크롤 영역.
 *
 * 스크롤바를 숨겼기 때문에 PC 에서는 넘길 수단이 사라진다 — 마우스 휠은 세로로만 움직이고
 * 잡을 막대도 없다. 그래서 세 가지를 얹는다.
 *   1) 세로 휠을 가로 스크롤로 변환 (Shift 없이)
 *   2) 양 끝 페이드 + 화살표 — 더 있다는 신호이자 실제로 누를 수 있는 조작부
 *   3) 끝에 닿으면 휠을 페이지에 돌려줘 세로 스크롤이 갇히지 않게 한다
 */
export function ChipScroller({ children, className }: ChipScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflowing(max > EDGE_EPSILON);
    setAtStart(el.scrollLeft <= EDGE_EPSILON);
    setAtEnd(el.scrollLeft >= max - EDGE_EPSILON);
  }, []);

  // 칩이 늘거나 카드 폭이 바뀌면 화살표 표시 여부를 다시 계산한다
  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
  }, [sync]);

  /**
   * React 의 onWheel 은 루트에 passive 로 걸려 preventDefault 가 먹지 않는다.
   * 세로 휠을 가로 스크롤로 바꾸려면 non-passive 네이티브 리스너여야 한다.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return; // 넘치지 않으면 페이지 스크롤 그대로
      // 트랙패드 가로 제스처는 브라우저가 이미 처리하므로 건드리지 않는다
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // 끝에 닿았으면 페이지에 양보 — 안 그러면 목록 중간에서 세로 스크롤이 막힌다
      const goingBack = e.deltaY < 0;
      if (goingBack && el.scrollLeft <= 0) return;
      if (!goingBack && el.scrollLeft >= max) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scrollByStep = (direction: -1 | 1) =>
    scrollerRef.current?.scrollBy({ left: SCROLL_STEP * direction, behavior: 'smooth' });

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1', className)}>
      {/*
        화살표를 스크롤 영역 밖에 두어 칩을 가리지 않는다.
        끝에 닿아도 자리는 남겨(비활성) 스크롤 중에 줄이 흔들리지 않게 한다.
      */}
      {overflowing && (
        <EdgeButton side="left" disabled={atStart} onClick={() => scrollByStep(-1)} />
      )}

      <div
        ref={scrollerRef}
        className="scrollbar-none min-w-0 flex-1 overflow-x-auto"
        onScroll={sync}
      >
        <div ref={contentRef} className="flex w-max items-center gap-1.5">
          {children}
        </div>
      </div>

      {overflowing && <EdgeButton side="right" disabled={atEnd} onClick={() => scrollByStep(1)} />}
    </div>
  );
}

interface EdgeButtonProps {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}

/** 스크롤 영역 옆에 붙는 화살표 — 칩과 자리를 나눠 갖는다 */
function EdgeButton({ side, disabled, onClick }: EdgeButtonProps) {
  const isLeft = side === 'left';
  const Icon = isLeft ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={isLeft ? '이전 항목 보기' : '다음 항목 보기'}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'border-border-subtle text-text-tertiary hover:bg-bg-hover hover:text-text-secondary',
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
        // 끝에서는 흐리게 — 사라지면 그만큼 줄이 늘었다 줄었다 한다
        disabled && 'pointer-events-none opacity-25',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
