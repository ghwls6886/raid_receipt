import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** on/off 스위치 — role="switch" 라 스크린리더가 체크박스가 아닌 스위치로 읽는다 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: ToggleProps) {
  return (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cn(
        'focus-visible:ring-border-focus relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-500' : 'bg-border-default',
        className,
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
