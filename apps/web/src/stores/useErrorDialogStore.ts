/**
 * 에러 다이얼로그 스토어
 *
 * API 오류 발생 시 공통 다이얼로그를 표시하기 위한 전역 상태 관리
 */
import { create } from 'zustand';

interface ErrorDialogState {
  isOpen: boolean;
  title: string;
  message: string | string[];
}

interface ErrorDialogActions {
  showError: (params: { title: string; message: string | string[] }) => void;
  showHttpError: (params: { statusCode?: number; message?: string | string[] }) => void;
  closeError: () => void;
}

/** HTTP 상태 코드별 기본 타이틀 */
const HTTP_ERROR_TITLES: Record<number, string> = {
  400: '입력값 오류',
  401: '인증 필요',
  403: '접근 권한 없음',
  404: '리소스를 찾을 수 없음',
  409: '충돌 오류',
  422: '유효성 검증 실패',
  500: '서버 오류',
  502: '게이트웨이 오류',
  503: '서비스 일시 중단',
  504: '게이트웨이 시간 초과',
};

const initialState: ErrorDialogState = { isOpen: false, title: '', message: '' };

export const useErrorDialogStore = create<ErrorDialogState & ErrorDialogActions>()((set) => ({
  ...initialState,

  showError: ({ title, message }) => set({ isOpen: true, title, message }),

  showHttpError: ({ statusCode, message }) => {
    const title = statusCode ? (HTTP_ERROR_TITLES[statusCode] ?? '오류 발생') : '오류 발생';
    set({ isOpen: true, title, message: message ?? '오류가 발생했습니다.' });
  },

  closeError: () => set(initialState),
}));
