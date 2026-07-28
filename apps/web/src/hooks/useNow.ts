import { useEffect, useState } from 'react';

/**
 * intervalMs 마다 갱신되는 현재 시각(epoch ms).
 *
 * 매 tick 마다 Date.now() 를 새로 읽는다. 누적 카운터(remaining -= 1000)로 만들면
 * 두 상황에서 값이 실제 시각과 어긋난다:
 *  - 비활성 탭: 브라우저가 setInterval 을 1초 이상으로 throttle 한다
 *  - 절전/최대 절전 복귀: 그동안의 tick 이 통째로 사라진다
 * Date.now() 를 다시 읽으면 tick 을 몇 번 건너뛰었든 복귀 시점에 바로 정확해진다.
 *
 * 리렌더가 초당 1회 발생하므로 이 훅은 카운트다운을 실제로 그리는 말단 컴포넌트에서만
 * 호출한다. 상위(페이지·카드)에서 호출하면 형제 트리까지 매초 다시 그린다.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
