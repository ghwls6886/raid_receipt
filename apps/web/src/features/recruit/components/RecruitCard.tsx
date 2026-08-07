import { Users } from 'lucide-react';
import type { RecruitPost } from '@/features/recruit/api';
import { categoryLabel } from '@/features/recruit/constants';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RecruitStatusBadge } from '@/features/recruit/components/RecruitStatusBadge';

interface RecruitCardProps {
  post: RecruitPost;
  /** 내가 이 글의 파티장인가 — 자기 글에는 신청 버튼을 띄우지 않는다 */
  isMine: boolean;
  /** 이미 어떤 파티에 속해 있으면 신청할 수 없다 (0015 single-active 트리거) */
  canApply: boolean;
  onApply: (post: RecruitPost) => void;
}

function formatStat(value: number | null): string {
  return value == null ? '-' : value.toLocaleString();
}

export function RecruitCard({ post, isMine, canApply, onApply }: RecruitCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="min-w-0">
        <h3 className="text-text-primary truncate text-sm font-semibold">{post.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">{categoryLabel(post.category)}</Badge>
          <RecruitStatusBadge status={post.status} />
          <Badge>{post.serverName}</Badge>
          {isMine && <Badge tone="warning">내 글</Badge>}
        </div>
      </div>

      <div className="text-text-secondary space-y-1 text-xs">
        <p>
          <span className="text-text-tertiary">파티장</span> {post.leaderNickname ?? '알 수 없음'}
          {post.leaderJob && ` · ${post.leaderJob}`}
          {post.leaderLevel != null && ` · Lv.${String(post.leaderLevel)}`}
        </p>
        {post.requiredStatAttack != null && (
          <p>
            <span className="text-text-tertiary">요구 스공</span>{' '}
            {formatStat(post.requiredStatAttack)}
          </p>
        )}
        {post.specDescription && (
          <p className="line-clamp-2">
            <span className="text-text-tertiary">스펙 요구</span> {post.specDescription}
          </p>
        )}
      </div>

      <div className="border-border-subtle flex items-center justify-between border-t pt-3">
        <span className="text-text-secondary flex items-center gap-1 text-xs tabular-nums">
          <Users className="h-3.5 w-3.5" />
          {post.memberCount}/{post.maxMembers}
        </span>

        {/* 모집중이 아니거나, 내 글이거나, 이미 다른 파티에 있으면 신청 버튼을 숨긴다.
            눌러봐야 서버가 막을 걸 굳이 보여줄 이유가 없다. */}
        {post.status === 'OPEN' && !isMine && canApply && (
          <Button onClick={() => onApply(post)} size="sm">
            참여 신청
          </Button>
        )}
      </div>
    </Card>
  );
}
