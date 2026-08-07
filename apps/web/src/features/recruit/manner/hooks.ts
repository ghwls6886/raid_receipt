/**
 * 매너온도 쿼리 훅 — maple_helper hooks/useManner.ts 이식
 *
 * 세 화면(평가 목록 · 파티방 · 평가 팝업)이 같은 캐시를 봐야 해서 훅으로 묶는다.
 * 팝업에서 평가를 남기면 그 뒤에 깔린 목록도 같이 갱신돼야 하기 때문이다.
 *
 * recruit 전용이라 공용 src/hooks 가 아니라 feature 안에 둔다 (§4.1 원칙 3).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/stores/useToastStore';
import {
  getAllRatingSessions,
  getMannerProfile,
  getPendingRatingSessions,
  getRatingSession,
  submitRating,
  type SubmitRatingInput,
} from './api';

export function useMannerProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['mannerProfile', userId],
    queryFn: () => getMannerProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function usePendingRatingSessions() {
  return useQuery({
    queryKey: ['ratingSessions', 'pending'],
    queryFn: getPendingRatingSessions,
    staleTime: 15_000,
  });
}

export function useAllRatingSessions() {
  return useQuery({
    queryKey: ['ratingSessions', 'all'],
    queryFn: getAllRatingSessions,
    staleTime: 15_000,
  });
}

/** 탈퇴·퇴장·해산 직후 세션 하나만 집어올 때 */
export function useRatingSession(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['ratingSession', sessionId],
    queryFn: () => getRatingSession(sessionId!),
    enabled: Boolean(sessionId),
    staleTime: 15_000,
  });
}

export function useSubmitRating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitRatingInput) => submitRating(input),
    onSuccess: () => {
      // 온도가 오른 상대의 프로필과, 남은 대상이 줄어든 세션 목록 둘 다 낡는다.
      void queryClient.invalidateQueries({ queryKey: ['mannerProfile'] });
      void queryClient.invalidateQueries({ queryKey: ['ratingSessions'] });
      void queryClient.invalidateQueries({ queryKey: ['ratingSession'] });
      toast.success('평가를 남겼습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '평가 제출에 실패했습니다.'),
  });
}
