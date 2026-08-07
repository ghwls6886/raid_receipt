import { useMemo, useState } from 'react';
import type { RatingSession } from './api';
import type { RatingValue } from './domain';
import { useSubmitRating } from './hooks';
import { RatingModal } from './RatingModal';

interface RatingFlowModalProps {
  session: RatingSession;
  /** 모든 대상을 처리했거나 사용자가 그만뒀을 때 */
  onDone: () => void;
}

/**
 * 평가 세션의 남은 대상을 한 명씩 순서대로 돈다.
 *
 * RatingModal 은 1명 전용이라, 파티 해산처럼 여러 명을 평가해야 하는
 * 상황에서는 이 컨테이너가 대상을 넘겨 가며 반복시킨다.
 */
export function RatingFlowModal({ session, onDone }: RatingFlowModalProps) {
  const submitRating = useSubmitRating();

  // 제출할 때마다 목록을 다시 계산하면(submitted 가 true 로 바뀌며 대상이 빠진다)
  // 인덱스가 가리키는 사람이 밀려서 순서가 흔들린다. 최초 목록을 고정한다.
  const queue = useMemo(
    () => session.targets.filter((t) => !t.submitted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.id],
  );
  const [index, setIndex] = useState(0);

  const current = queue[index];

  // 평가할 상대가 없으면(혼자였거나 이미 다 끝냄) 아무것도 띄우지 않는다.
  if (!current) return null;

  const advance = () => {
    if (index + 1 >= queue.length) {
      onDone();
      return;
    }
    setIndex((i) => i + 1);
  };

  const handleSubmit = (value: RatingValue, stickerIds: string[]) => {
    submitRating.mutate(
      {
        sessionId: session.id,
        targetUserId: current.userId,
        value,
        stickerIds,
      },
      { onSuccess: advance },
    );
  };

  return (
    <RatingModal
      // 대상이 바뀌면 앞사람에게 고른 평가·스티커가 남지 않도록 새로 마운트한다.
      key={current.userId}
      isSubmitting={submitRating.isPending}
      onClose={onDone}
      onSubmit={handleSubmit}
      progress={{ current: index + 1, total: queue.length }}
      session={session}
      target={current}
    />
  );
}
