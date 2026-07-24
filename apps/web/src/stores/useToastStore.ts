import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export interface ToastOptions {
  /** 자동 제거까지 시간(ms). 0 이하면 지속(수동 닫기). 미지정 시 기본 3초 */
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

let toastId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++toastId}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? 3000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));

/** 두 번째 인자로 숫자(duration) 또는 옵션 객체를 받아 정규화 */
function toToastFields(opts?: number | ToastOptions): Pick<Toast, 'duration'> {
  return typeof opts === 'number' ? { duration: opts } : (opts ?? {});
}

// 편의 함수
export const toast = {
  success: (message: string, opts?: number | ToastOptions) =>
    useToastStore.getState().addToast({ type: 'success', message, ...toToastFields(opts) }),
  error: (message: string, opts?: number | ToastOptions) =>
    useToastStore.getState().addToast({ type: 'error', message, ...toToastFields(opts) }),
  warning: (message: string, opts?: number | ToastOptions) =>
    useToastStore.getState().addToast({ type: 'warning', message, ...toToastFields(opts) }),
  info: (message: string, opts?: number | ToastOptions) =>
    useToastStore.getState().addToast({ type: 'info', message, ...toToastFields(opts) }),
};
