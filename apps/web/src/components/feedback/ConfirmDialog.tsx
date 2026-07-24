import { CircleAlert, TriangleAlert, XCircle } from 'lucide-react';
import { Modal } from '@/components/popup/Modal';
import { useConfirmStore } from '@/stores/useConfirmStore';
import { cn } from '@/lib/cn';

const typeStyles = {
  default: { Icon: CircleAlert, iconColor: 'text-brand-500', confirmBtn: 'bg-brand-600 hover:bg-brand-700' },
  warning: { Icon: TriangleAlert, iconColor: 'text-warning-500', confirmBtn: 'bg-warning-600 hover:bg-warning-700' },
  danger: { Icon: XCircle, iconColor: 'text-error-600', confirmBtn: 'bg-error-600 hover:bg-error-700' },
  error: { Icon: XCircle, iconColor: 'text-error-600', confirmBtn: 'bg-brand-600 hover:bg-brand-700' },
} as const;

/**
 * 전역 확인 다이얼로그 — confirm.show()/danger()/warning() Promise 기반 API와 연동
 */
export function ConfirmDialog() {
  const { isOpen, options, closeConfirm } = useConfirmStore();

  if (!options) return null;

  const {
    title = '확인',
    message,
    confirmText = '확인',
    cancelText = '취소',
    type = 'default',
  } = options;

  const { Icon, iconColor, confirmBtn } = typeStyles[type];

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => closeConfirm(false)}
      title={title}
      width={400}
      footer={
        <>
          <button
            className="text-text-secondary hover:bg-bg-hover rounded-md px-4 py-2 text-sm font-medium"
            onClick={() => closeConfirm(false)}
            type="button"
          >
            {cancelText}
          </button>
          <button
            className={cn('rounded-md px-4 py-2 text-sm font-medium text-white', confirmBtn)}
            onClick={() => closeConfirm(true)}
            type="button"
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <Icon className={cn('h-6 w-6 shrink-0', iconColor)} />
        <p className="text-text-secondary text-sm whitespace-pre-line">{message}</p>
      </div>
    </Modal>
  );
}
