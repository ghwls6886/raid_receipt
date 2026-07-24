import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning';

const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-muted text-text-secondary',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/** 상태 표시용 알약 배지 */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
