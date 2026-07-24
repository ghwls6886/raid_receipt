import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore, type ToastType } from '@/stores/useToastStore';
import { cn } from '@/lib/cn';

const toastStyles: Record<
  ToastType,
  { bg: string; border: string; Icon: typeof Info; iconColor: string }
> = {
  success: {
    bg: 'bg-success-50',
    border: 'border-l-success-500',
    Icon: CheckCircle2,
    iconColor: 'text-success-600',
  },
  error: {
    bg: 'bg-error-50',
    border: 'border-l-error-500',
    Icon: XCircle,
    iconColor: 'text-error-600',
  },
  warning: {
    bg: 'bg-warning-50',
    border: 'border-l-warning-500',
    Icon: AlertTriangle,
    iconColor: 'text-warning-600',
  },
  info: {
    bg: 'bg-brand-50',
    border: 'border-l-brand-500',
    Icon: Info,
    iconColor: 'text-brand-600',
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] flex flex-col items-center gap-2 p-4">
      {toasts.map((toast) => {
        const { bg, border, Icon, iconColor } = toastStyles[toast.type];
        return (
          <div
            className="bg-bg-card animate-slide-up pointer-events-auto rounded-lg shadow-lg"
            key={toast.id}
          >
            <div className={cn('flex items-center gap-3 rounded-lg border-l-4 px-4 py-3', bg, border)}>
              <Icon className={cn('h-5 w-5 shrink-0', iconColor)} />
              <span className="text-text-primary text-sm font-medium">{toast.message}</span>
              <button
                aria-label="close"
                className="text-text-muted hover:text-text-secondary ml-2"
                onClick={() => removeToast(toast.id)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
