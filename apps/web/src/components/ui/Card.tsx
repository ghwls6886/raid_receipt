import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** 기본 카드 표면 — 배경/보더/라운드/그림자 토큰 적용 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-bg-card border-border-subtle shadow-card rounded-xl border', className)}
      {...props}
    />
  );
}
