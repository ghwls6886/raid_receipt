import { useCallback, useEffect, useRef, useState } from 'react';

type ModalScroll = 'none' | 'body';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;

  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;

  // size
  width?: number | string;
  maxWidth?: number | string;
  height?: number | string;
  maxHeight?: number | string;

  // behavior
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  showHeader?: boolean;
  showCloseButton?: boolean;
  scroll?: ModalScroll;
  resizable?: boolean;
  /** 헤더를 잡고 끌어서 창을 옮길 수 있게 한다 (default false) */
  draggable?: boolean;
  /** 최초 위치를 중앙에서 이만큼 밀어 놓는다 (px). 계단식 다중 팝업용 */
  initialOffset?: { x: number; y: number };

  // style hooks
  zIndex?: number;
  className?: string;
  bodyClassName?: string;
  overlayClassName?: string;
  containerClassName?: string;
}

function toCssSize(v?: number | string) {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

/**
 * 의존성 없는 순수 React 모달 (드래그 이동/리사이즈/모덜리스 지원)
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,

  width = 350,
  maxWidth = '92vw',
  height,
  maxHeight = '80vh',

  closeOnOverlayClick = true,
  closeOnEsc = true,
  showHeader = true,
  showCloseButton = true,
  // 기본을 'body'로 둔다. maxHeight(80vh)에 눌려 body가 압축될 때
  // 'none'이면 내용이 스크롤 없이 잘려서 작은 화면에서 접근 자체가 막힌다.
  scroll = 'body',
  resizable = false,
  draggable = false,
  initialOffset,

  zIndex = 1000,
  className,
  bodyClassName,
  overlayClassName,
  containerClassName,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  // 헤더 드래그로 창 이동 — 중앙 정렬을 유지한 채 transform 오프셋만 누적한다
  const [offset, setOffset] = useState(initialOffset ?? { x: 0, y: 0 });
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggable || (e.target as HTMLElement).closest('button')) return;
      dragRef.current = { pointerX: e.clientX, pointerY: e.clientY, ...offset };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [draggable, offset],
  );

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    setOffset({
      x: start.x + e.clientX - start.pointerX,
      y: start.y + e.clientY - start.pointerY,
    });
  }, []);

  const handleDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${containerClassName ?? ''}`}
      role="presentation"
      style={{ zIndex }}
    >
      {/* Overlay */}
      <div
        className={`absolute inset-0 ${overlayClassName ?? 'bg-black/50'}`}
        onClick={closeOnOverlayClick ? onClose : undefined}
        role="presentation"
      />

      {/* Dialog */}
      <div
        aria-modal="true"
        className={['bg-bg-card relative flex flex-col rounded-lg shadow-xl', className ?? ''].join(
          ' ',
        )}
        role="dialog"
        style={{
          width: toCssSize(width),
          maxWidth: toCssSize(maxWidth),
          height: toCssSize(height),
          maxHeight: toCssSize(maxHeight),
          transform:
            offset.x || offset.y
              ? `translate(${String(offset.x)}px, ${String(offset.y)}px)`
              : undefined,
          ...(resizable
            ? { resize: 'both', overflow: 'hidden', minWidth: 300, minHeight: 200 }
            : {}),
        }}
      >
        {showHeader && (
          <div
            className={`border-border-subtle flex items-center justify-between border-b px-4 py-3 ${
              draggable ? 'cursor-move select-none' : ''
            }`}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
          >
            <div className="text-text-primary text-lg font-semibold">{title}</div>
            {showCloseButton && (
              <button
                aria-label="close"
                className="text-text-muted hover:text-text-secondary"
                onClick={onClose}
                type="button"
              >
                ✕
              </button>
            )}
          </div>
        )}

        <div
          className={[
            'min-h-0 flex-1 p-4',
            scroll === 'body' ? 'overflow-auto' : 'overflow-hidden',
            bodyClassName ?? '',
          ].join(' ')}
        >
          {children}
        </div>

        {footer && (
          <div className="border-border-subtle flex justify-end gap-2 border-t px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
