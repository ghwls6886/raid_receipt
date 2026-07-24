import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** 공통 셀렉트 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'border-border-default bg-bg-card text-text-primary focus:border-border-focus w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
