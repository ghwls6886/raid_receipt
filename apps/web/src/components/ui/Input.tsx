import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** 공통 텍스트/숫자 입력 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'border-border-default bg-bg-card text-text-primary placeholder:text-text-muted focus:border-border-focus w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
