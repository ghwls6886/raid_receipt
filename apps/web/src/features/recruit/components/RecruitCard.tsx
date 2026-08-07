import { Users } from 'lucide-react';
import type { RecruitPost } from '@/features/recruit/api';
import { categoryLabel } from '@/features/recruit/constants';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RecruitStatusBadge } from '@/features/recruit/components/RecruitStatusBadge';

interface RecruitCardProps {
  post: RecruitPost;
  onApply: (post: RecruitPost) => void;
  onView: (post: RecruitPost) => void;
}

function formatStat(value: number | null): string {
  return value == null ? '-' : value.toLocaleString();
}

/**
 * 구인 글 카드.
 *
 * 신청 가능 여부는 여기서 판단하지 않는다 — 버튼은 모집중이면 항상 보이고,
 * 페이지가 눌렀을 때 이유를 토스트로 알려준다(원본 동작). 조건을 카드에 숨기면
 * "왜 신청 버튼이 없지?"가 되고, 이유를 말해 주는 편이 낫다.
 */
export function RecruitCard({ post, onApply, onView }: RecruitCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3
            className="text-text-primary cursor-pointer truncate text-sm font-semibold hover:underline"
            onClick={() => onView(post)}
          >
            {post.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{categoryLabel(post.category)}</Badge>
            <RecruitStatusBadge status={post.status} />
            <Badge tone="neutral">{post.serverName}</Badge>
          </div>
        </div>
      </div>

      <div className="text-text-secondary space-y-1 text-xs">
        <p>
          <span className="text-text-tertiary">파티장:</span> {post.leaderNickname ?? '알 수 없음'}
          {post.leaderJob && ` (${post.leaderJob})`}
          {post.leaderLevel != null && ` Lv.${String(post.leaderLevel)}`}
        </p>
        {post.requiredStatAttack != null && (
          <p>
            <span className="text-text-tertiary">요구 스공:</span>{' '}
            {formatStat(post.requiredStatAttack)}
          </p>
        )}
        {post.specDescription && (
          <p>
            <span className="text-text-tertiary">스펙 요구:</span> {post.specDescription}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="text-text-secondary flex items-center gap-1 text-xs">
          <Users className="h-3.5 w-3.5" />
          <span>
            {post.memberCount}/{post.maxMembers}
          </span>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onView(post)} size="sm" variant="secondary">
            파티방
          </Button>
          {post.status === 'OPEN' && (
            <Button onClick={() => onApply(post)} size="sm">
              참여 신청
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
