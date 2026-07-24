import axios, { AxiosError } from 'axios';
import { useErrorDialogStore } from '@/stores/useErrorDialogStore';

/** 백엔드 에러 응답 형태 (api ApiErrorResponse와 동일) */
interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

/**
 * 공통 axios 인스턴스
 *
 * - baseURL '/api' (vite dev proxy 또는 프로덕션 리버스 프록시로 백엔드 연결)
 * - 응답 에러를 전역 에러 다이얼로그로 표시 (401/취소 제외)
 */
export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    // 취소된 요청은 무시
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const body = error.response?.data;

    // 401은 인증 흐름에서 처리 (여기서 다이얼로그 표시 안 함)
    if (status !== 401) {
      useErrorDialogStore.getState().showHttpError({
        statusCode: status,
        message: body?.message ?? error.message,
      });
    }

    return Promise.reject(error);
  },
);
