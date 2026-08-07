import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LogOut, Trash2 } from 'lucide-react';
import {
  closeRecruitPost,
  getRecruitApplications,
  getRecruitMembers,
  getRecruitPost,
  kickRecruitMember,
  leaveRecruitPost,
  respondToApplication,
} from '@/features/recruit/api';
import { categoryLabel } from '@/features/recruit/constants';
import { useAuthStore } from '@/stores/useAuthStore';
import { confirm } from '@/stores/useConfirmStore';
import { toast } from '@/stores/useToastStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RecruitStatusBadge } from '@/features/recruit/components/RecruitStatusBadge';
import { RecruitMemberList } from '@/features/recruit/components/RecruitMemberList';
import { RecruitApplicationList } from '@/features/recruit/components/RecruitApplicationList';
import { RecruitChatPanel } from '@/features/recruit/components/RecruitChatPanel';

const LIST_PATH = '/recruit';

/** 파티방 — 멤버 · 신청 · 채팅 (MERGE_PLAN §7 4단계) */
export function RecruitDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const myUserId = session?.user.id;

  const { data: post, isLoading } = useQuery({
    queryKey: ['recruitPost', postId],
    queryFn: () => getRecruitPost(postId!),
    enabled: Boolean(postId),
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['recruitMembers', postId],
    queryFn: () => getRecruitMembers(postId!),
    enabled: Boolean(postId),
  });

  const { data: applications = [] } = useQuery({
    queryKey: ['recruitApplications', postId],
    queryFn: () => getRecruitApplications(postId!),
    enabled: Boolean(postId),
  });

  /** 멤버였던 적이 있는지 — 강퇴 감지의 기준점 */
  const wasMemberRef = useRef(false);
  /** 내가 스스로 나갔는지 — 강퇴 안내가 겹치지 않게 한다 */
  const selfLeavingRef = useRef(false);
  /** 해산 안내를 한 번만 띄우기 위한 플래그 */
  const dissolveHandledRef = useRef(false);

  const [isKicking, setIsKicking] = useState(false);

  const amMember = Boolean(myUserId) && members.some((m) => m.userId === myUserId);
  const isClosed = post?.status === 'CLOSED';

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['recruitPost', postId] });
    void queryClient.invalidateQueries({ queryKey: ['recruitMembers', postId] });
    void queryClient.invalidateQueries({ queryKey: ['recruitApplications', postId] });
    void queryClient.invalidateQueries({ queryKey: ['recruitPosts'] });
    void queryClient.invalidateQueries({ queryKey: ['myRecruitMembership'] });
  };

  // 강퇴 감지 — 멤버였다가 목록에서 사라졌는데 내가 나간 게 아니면 퇴장당한 것이다.
  useEffect(() => {
    if (membersLoading || !postId) return;

    if (amMember) {
      wasMemberRef.current = true;
      return;
    }
    if (!wasMemberRef.current) return; // 애초에 멤버가 아니었음 (구경 중)
    if (selfLeavingRef.current) return; // 내가 탈퇴/해산
    if (isClosed) return; // 해산은 아래 effect 가 처리

    toast.warning('파티에서 퇴장되었습니다.');
    navigate(LIST_PATH);
  }, [amMember, membersLoading, isClosed, postId, navigate]);

  // 파티장이 해산한 경우 — 남아 있던 파티원도 목록으로 내보낸다.
  useEffect(() => {
    if (!isClosed || !postId) return;
    if (!wasMemberRef.current) return;
    if (selfLeavingRef.current) return; // 내가 해산 — 아래 핸들러가 이미 처리
    if (dissolveHandledRef.current) return;

    dissolveHandledRef.current = true;
    toast.warning('파티가 해산되었습니다.');
    navigate(LIST_PATH);
  }, [isClosed, postId, navigate]);

  const respondMutation = useMutation({
    mutationFn: ({ applicationId, accept }: { applicationId: string; accept: boolean }) =>
      respondToApplication(applicationId, accept),
    onSuccess: (_, { accept }) => {
      invalidateAll();
      toast.success(accept ? '신청을 수락했습니다.' : '신청을 거절했습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '처리에 실패했습니다.'),
  });

  /**
   * 탈퇴·퇴장·해산은 평가 세션 id 를 돌려준다.
   * TODO 평가 팝업(RatingFlowModal)은 다음 이식분. 지금은 세션이 생겼다는 것만 알린다.
   */
  const afterDissolve = (sessionId: string | null, shouldLeave: boolean) => {
    if (sessionId) toast.info('함께한 파티원 평가가 대기 중입니다. (평가 화면 준비 중)');
    if (shouldLeave) navigate(LIST_PATH);
  };

  const handleClose = async () => {
    if (!post) return;
    const ok = await confirm.danger(
      '정말로 파티를 해산하시겠습니까? 모든 멤버가 파티에서 제거되고 채팅이 삭제됩니다.',
      '파티 해산',
    );
    if (!ok) return;

    selfLeavingRef.current = true;
    try {
      const sessionId = await closeRecruitPost(post.id);
      invalidateAll();
      afterDissolve(sessionId, true);
    } catch (e) {
      selfLeavingRef.current = false;
      toast.error(e instanceof Error ? e.message : '해산에 실패했습니다.');
    }
  };

  const handleLeave = async () => {
    if (!post) return;
    const ok = await confirm.warning('정말로 파티에서 탈퇴하시겠습니까?', '파티 탈퇴');
    if (!ok) return;

    selfLeavingRef.current = true;
    try {
      const sessionId = await leaveRecruitPost(post.id);
      invalidateAll();
      afterDissolve(sessionId, true);
    } catch (e) {
      selfLeavingRef.current = false;
      toast.error(e instanceof Error ? e.message : '탈퇴에 실패했습니다.');
    }
  };

  const handleKick = async (userId: string, nickname: string) => {
    if (!post) return;
    const ok = await confirm.danger(`${nickname}님을 파티에서 퇴장시키겠습니까?`, '파티원 퇴장');
    if (!ok) return;

    setIsKicking(true);
    try {
      const sessionId = await kickRecruitMember(post.id, userId);
      invalidateAll();
      // 퇴장시킨 파티장은 파티에 남아 있으므로 화면을 유지한다
      afterDissolve(sessionId, false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '퇴장에 실패했습니다.');
    } finally {
      setIsKicking(false);
    }
  };

  if (isLoading) {
    return <div className="text-text-tertiary py-12 text-center">불러오는 중...</div>;
  }

  if (!post) {
    return (
      <div className="py-12 text-center">
        <p className="text-text-tertiary">파티를 찾을 수 없습니다.</p>
        <Button className="mt-4" onClick={() => navigate(LIST_PATH)} variant="secondary">
          <ArrowLeft className="h-4 w-4" /> 목록으로
        </Button>
      </div>
    );
  }

  const isLeader = myUserId === post.leaderId;
  const myNickname =
    members.find((m) => m.userId === myUserId)?.nickname ??
    session?.user.email?.split('@')[0] ??
    '유저';

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <button
          className="text-text-secondary hover:text-text-primary mb-3 flex items-center gap-1 text-sm"
          onClick={() => navigate(LIST_PATH)}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" /> 파티 목록
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-text-primary text-xl font-bold">{post.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge>{categoryLabel(post.category)}</Badge>
              <RecruitStatusBadge status={post.status} />
              <Badge tone="neutral">{post.serverName}</Badge>
              <Badge tone="neutral">
                {members.length}/{post.maxMembers}명
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            {amMember && !isLeader && !isClosed && (
              <Button onClick={() => void handleLeave()} size="sm" variant="secondary">
                <LogOut className="h-4 w-4" /> 나가기
              </Button>
            )}
            {isLeader && !isClosed && (
              <Button onClick={() => void handleClose()} size="sm" variant="danger">
                <Trash2 className="h-4 w-4" /> 해산
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="mb-4 p-4">
        <div className="text-text-secondary space-y-1 text-sm">
          <p>
            <span className="text-text-tertiary">파티장:</span>{' '}
            {post.leaderNickname ?? '알 수 없음'}
            {post.leaderJob && ` (${post.leaderJob})`}
            {post.leaderLevel != null && ` Lv.${String(post.leaderLevel)}`}
            {post.leaderStatAttack != null && ` | 스공 ${post.leaderStatAttack.toLocaleString()}`}
          </p>
          {post.leaderSpec && (
            <p>
              <span className="text-text-tertiary">파티장 스펙:</span> {post.leaderSpec}
            </p>
          )}
          {post.requiredStatAttack != null && (
            <p>
              <span className="text-text-tertiary">요구 스공:</span>{' '}
              {post.requiredStatAttack.toLocaleString()}
            </p>
          )}
          {post.specDescription && (
            <p>
              <span className="text-text-tertiary">스펙 요구:</span> {post.specDescription}
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <RecruitMemberList
              currentUserId={myUserId}
              isKicking={isKicking}
              members={members}
              onKick={isLeader && !isClosed ? (id, nick) => void handleKick(id, nick) : undefined}
              onLeave={amMember && !isLeader ? () => void handleLeave() : undefined}
            />
          </Card>

          {/* TODO 심콜(버프콜) 패널 — 다음 이식분 */}

          {isLeader && !isClosed && (
            <Card className="p-4">
              <RecruitApplicationList
                applications={applications}
                isResponding={respondMutation.isPending}
                onRespond={(applicationId, accept) => {
                  respondMutation.mutate({ applicationId, accept });
                }}
              />
            </Card>
          )}
        </div>

        {amMember && !isClosed && myUserId && (
          <Card className="p-4">
            <RecruitChatPanel nickname={myNickname} postId={post.id} userId={myUserId} />
          </Card>
        )}
      </div>
    </div>
  );
}
