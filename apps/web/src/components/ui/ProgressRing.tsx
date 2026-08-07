import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ProgressRingProps {
  /** 0~1. 범위를 벗어난 값은 잘라 낸다. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: ReactNode;
}

/** 원형 진행 표시 — 가운데에 남은 시간 같은 텍스트를 넣을 수 있다 */
export function ProgressRing({
  progress,
  size = 80,
  strokeWidth = 4,
  className,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      {/* 12시 방향에서 시작하도록 돌린다 — SVG 원은 3시에서 시작한다 */}
      <svg className="-rotate-90" height={size} width={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--color-border-subtle)"
          strokeWidth={strokeWidth}
        />
        <circle
          className="transition-[stroke-dashoffset] duration-100"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--color-brand-500)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}
