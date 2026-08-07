import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { getMyRecruitMembership, getRecruitPosts, type RecruitPost } from '@/features/recruit/api';
import { CATEGORY_ALL, RECRUIT_CATEGORIES } from '@/features/recruit/constants';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from '@/stores/useToastStore';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { RecruitCard } from '@/features/recruit/components/RecruitCard';
import { RecruitCreateModal } from '@/features/recruit/components/RecruitCreateModal';

/**
 * 파티 구인 목록 (MERGE_PLAN §7 4단계).
 *
 * 한 사람은 동시에 한 파티에만 속한다(0015 single-active 트리거). 그래서 이미
 * 어딘가에 속해 있으면 글 올리기·신청 버튼을 감추고 참여 중 배너를 대신 띄운다.
 * 눌러봐야 서버가 막을 걸 보여줄 이유가 없다.
 */
export function RecruitPage() {
  const session = useAuthStore((s) => s.session);
  const myUserId = session?.user.id ?? null;

  const [category, setCategory] = useState<string>(CATEGORY_ALL);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['recruitPosts', category],
    queryFn: () => getRecruitPosts(category === CATEGORY_ALL ? undefined : category),
  });

  const { data: myMembership } = useQuery({
    queryKey: ['myRecruitMembership'],
    queryFn: getMyRecruitMembership,
  });

  const isInParty = Boolean(myMembership);

  // 상세·신청 화면은 다음 이식분이다. 지금은 왜 안 되는지만 알려준다.
  const handleApply = (post: RecruitPost) => {
    toast.info(`"${post.title}" 신청 화면은 준비 중입니다.`);
  };

  return (
    <div>
      <PageHeader
        actions={
          !isInParty && (
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4" />글 올리기
            </Button>
          )
        }
        description="같이 사냥하거나 보스 돌 사람을 찾습니다. 한 번에 한 파티만 참여할 수 있습니다."
        title="파티 구인"
      />

      {myMembership && (
        <Card className="border-brand-200 bg-brand-50/60 mb-5 flex items-center gap-3 border p-4">
          <span className="bg-brand-100 text-brand-700 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-text-primary text-sm font-semibold">
              «{myMembership.title}» 에 참여 중입니다
            </p>
            <p className="text-text-secondary mt-0.5 text-xs">
              {myMembership.memberCount}/{myMembership.maxMembers}명 · 나가야 다른 파티에 참여할 수
              있습니다.
            </p>
          </div>
        </Card>
      )}

      {/* 카테고리 필터 — DB 로 내린다. 전부 받아 와서 거르면 egress 가 그대로 나간다 */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {[{ id: CATEGORY_ALL, label: '전체' }, ...RECRUIT_CATEGORIES].map((c) => (
          <button
            key={c.id}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              category === c.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-border-subtle text-text-secondary hover:bg-bg-hover',
            )}
            onClick={() => setCategory(c.id)}
            type="button"
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : posts.length === 0 ? (
        <EmptyState
          Icon={Users}
          description="아직 올라온 글이 없습니다. 첫 글을 올려 보세요."
          title="구인 글이 없습니다"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <RecruitCard
              key={post.id}
              canApply={!isInParty}
              isMine={post.leaderId === myUserId}
              onApply={handleApply}
              post={post}
            />
          ))}
        </div>
      )}

      <RecruitCreateModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
