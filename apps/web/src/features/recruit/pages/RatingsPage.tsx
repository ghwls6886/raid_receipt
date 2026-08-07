import { useState } from 'react';
import { Star } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/useAuthStore';
import { categoryLabel } from '@/features/recruit/constants';
import type { RatingSession } from '@/features/recruit/manner/api';
import { MANNER_TEMP_INITIAL, RATING_TRIGGER_LABELS } from '@/features/recruit/manner/domain';
import { useMannerProfile, usePendingRatingSessions } from '@/features/recruit/manner/hooks';
import {
  MannerTemperatureBadge,
  MannerTemperatureGauge,
} from '@/features/recruit/manner/MannerTemperature';
import { StickerCountList } from '@/features/recruit/manner/MannerStickerChips';
import { RatingFlowModal } from '@/features/recruit/manner/RatingFlowModal';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 만료까지 남은 일수 (0이면 오늘 마감) */
function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
}

/** 파티원 평가 — 내 매너온도 + 평가 대기 목록 (MERGE_PLAN §7 4단계) */
export function RatingsPage() {
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const [active, setActive] = useState<RatingSession | null>(null);

  const { data: sessions = [], isLoading } = usePendingRatingSessions();
  const { data: myProfile } = useMannerProfile(myUserId);

  return (
    <div>
      <PageHeader
        description="함께한 파티원에게 평가를 남기면 상대의 매너온도에 반영됩니다."
        title="파티원 평가"
      />

      {/* 내 매너온도 — 아직 평가를 못 받았으면 프로필 행이 없어 기본값으로 보여준다 */}
      <Card className="mb-4 flex flex-col gap-4 p-4">
        <MannerTemperatureGauge temperature={myProfile?.temperature ?? MANNER_TEMP_INITIAL} />
        <div className="flex flex-col gap-2">
          <span className="text-text-secondary text-xs font-medium">내가 받은 스티커</span>
          <StickerCountList counts={myProfile?.stickerCounts ?? {}} />
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-12">
          <p className="text-text-tertiary text-center text-sm">불러오는 중...</p>
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="p-12 text-center">
          <Star className="text-text-tertiary mx-auto mb-3 h-10 w-10" />
          <p className="text-text-secondary text-sm">평가할 파티가 없습니다.</p>
          <p className="text-text-tertiary mt-1 text-xs">
            파티가 해산되거나 파티원이 나가면 여기에 평가 대상이 나타납니다.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => {
            const remaining = session.targets.filter((t) => !t.submitted);
            const left = daysLeft(session.expiresAt);

            return (
              <Card key={session.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-text-primary text-sm font-semibold">
                    {session.postTitle}
                  </span>
                  <Badge tone="brand">{RATING_TRIGGER_LABELS[session.trigger]}</Badge>
                  <Badge tone="neutral">{categoryLabel(session.category)}</Badge>
                  {/* 마감이 임박하면 색으로 알린다 — 지나면 영영 못 남긴다 */}
                  <span
                    className={
                      left <= 1
                        ? 'ml-auto text-xs font-medium text-amber-700'
                        : 'text-text-tertiary ml-auto text-xs'
                    }
                  >
                    {left === 0 ? '오늘 마감' : `${String(left)}일 남음`}
                  </span>
                </div>

                <ul className="mb-3 flex flex-wrap gap-2">
                  {remaining.map((t) => (
                    <li
                      key={t.userId}
                      className="border-border-subtle flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                    >
                      <span className="text-text-primary text-sm">{t.nickname}</span>
                      <span className="text-text-tertiary text-xs">
                        Lv.{t.level} {t.job}
                      </span>
                      <MannerTemperatureBadge temperature={t.temperature} />
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary text-xs tabular-nums">
                    {remaining.length}명 남음
                  </span>
                  <Button onClick={() => setActive(session)} size="sm">
                    <Star className="h-4 w-4" /> 평가하기
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {active && <RatingFlowModal onDone={() => setActive(null)} session={active} />}
    </div>
  );
}
