import { create } from 'zustand';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'default' | 'danger' | 'warning' | 'error';
}

interface ConfirmState {
  isOpen: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
}

interface ConfirmStore extends ConfirmState {
  openConfirm: (options: ConfirmOptions) => Promise<boolean>;
  closeConfirm: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  isOpen: false,
  options: null,
  resolve: null,

  openConfirm: (options) =>
    new Promise<boolean>((resolve) => {
      set({ isOpen: true, options, resolve });
    }),

  closeConfirm: (result) => {
    const { resolve } = get();
    if (resolve) resolve(result);
    set({ isOpen: false, options: null, resolve: null });
  },
}));

// 편의 함수
export const confirm = {
  show: (options: ConfirmOptions) => useConfirmStore.getState().openConfirm(options),
  default: (message: string, title?: string) =>
    useConfirmStore.getState().openConfirm({ message, title, type: 'default' }),
  warning: (message: string, title?: string) =>
    useConfirmStore.getState().openConfirm({ message, title, type: 'warning' }),
  danger: (message: string, title?: string) =>
    useConfirmStore.getState().openConfirm({
      message,
      title: title || '삭제 확인',
      type: 'danger',
      confirmText: '삭제',
    }),
};
