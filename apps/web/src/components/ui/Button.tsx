import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-xs',
  secondary: 'border border-border-default bg-bg-card text-text-primary hover:bg-bg-hover',
  ghost: 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
  danger: 'bg-error-600 text-white hover:bg-error-700',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9 gap-2 px-4 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** 앱 공통 버튼 — variant/size 프리셋 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'focus-visible:ring-border-focus inline-flex items-center justify-center rounded-lg font-medium outline-none transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
