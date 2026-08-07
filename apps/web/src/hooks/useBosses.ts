import { useQuery } from '@tanstack/react-query';
import { getBosses, type Boss } from '@/lib/masters';

/**
 * 보스 마스터 목록. 거의 바뀌지 않으므로 길게 캐시한다.
 *
 * maple_helper 는 DB 가 비었을 때 하드코딩 상수로 폴백했는데 여기서는 하지 않는다.
 * 마스터의 진실은 0012 가 넣은 bosses 테이블 하나여야 하고, 폴백을 두면 화면과 DB 가
 * 어긋났을 때 어느 쪽이 맞는지 알 수 없게 된다.
 */
export function useBosses(): Boss[] {
  const { data } = useQuery({
    queryKey: ['bosses'],
    queryFn: getBosses,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? [];
}
