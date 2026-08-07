import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, UsersRound, ArrowRight } from 'lucide-react';
import {
  getMyRecruitCharacters,
  getMyRecruitMembership,
  getRecruitPosts,
  type RecruitPost,
} from '@/features/recruit/api';
import { CATEGORY_ALL, categoryLabel } from '@/features/recruit/constants';
import { getActiveServers } from '@/lib/masters';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRecruitStore } from '@/stores/useRecruitStore';
import { toast } from '@/stores/useToastStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { RecruitCategorySidebar } from '@/features/recruit/components/RecruitCategorySidebar';
import { RecruitCard } from '@/features/recruit/components/RecruitCard';
import { RecruitCreateModal } from '@/features/recruit/components/RecruitCreateModal';

/** 파티 구인 목록 (MERGE_PLAN §7 4단계) */
export function RecruitPage() {
  const session = useAuthStore((s) => s.session);
  const myUserId = session?.user.id ?? null;

  const selectedCategory = useRecruitStore((s) => s.selectedCategory);
  const selectedServer = useRecruitStore((s) => s.selectedServer);
  const selectedCharacterId = useRecruitStore((s) => s.selectedCharacterId);
  const setSelectedCategory = useRecruitStore((s) => s.setSelectedCategory);
  const setSelectedServer = useRecruitStore((s) => s.setSelectedServer);
  const setSelectedCharacterId = useRecruitStore((s) => s.setSelectedCharacterId);

  const [showCreate, setShowCreate] = useState(false);

  // 카테고리는 클라이언트에서 거른다 — 사이드바 카운트 배지를 그리려면
  // 어차피 카테고리 필터가 걸리지 않은 전체 목록이 필요하기 때문이다.
  const { data: allPosts = [], isLoading } = useQuery({
    queryKey: ['recruitPosts', selectedServer],
    queryFn: () => getRecruitPosts({ serverName: selectedServer || undefined }),
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'active'],
    queryFn: getActiveServers,
    staleTime: 5 * 60 * 1000,
  });

  const { data: characters = [] } = useQuery({
    queryKey: ['recruitCharacters'],
    queryFn: getMyRecruitCharacters,
  });

  const { data: myMembership } = useQuery({
    queryKey: ['myRecruitMembership'],
    queryFn: getMyRecruitMembership,
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { [CATEGORY_ALL]: allPosts.length };
    for (const post of allPosts) counts[post.category] = (counts[post.category] ?? 0) + 1;
    return counts;
  }, [allPosts]);

  const posts = useMemo(
    () =>
      selectedCategory === CATEGORY_ALL
        ? allPosts
        : allPosts.filter((p) => p.category === selectedCategory),
    [allPosts, selectedCategory],
  );

  // 서버는 반드시 하나 선택돼 있어야 한다. 비어 있으면 첫 서버로 채운다.
  useEffect(() => {
    if (selectedServer || servers.length === 0) return;
    setSelectedServer(servers[0]!.name);
  }, [selectedServer, servers, setSelectedServer]);

  // 서버가 없는 캐릭터는 파티에 쓸 수 없다.
  // 매 렌더마다 새 배열이 되면 아래 effect 가 계속 다시 돌아서 메모이즈한다.
  const usableCharacters = useMemo(
    () => characters.filter((c) => Boolean(c.serverName)),
    [characters],
  );
  const selectedCharacter = usableCharacters.find((c) => c.id === selectedCharacterId) ?? null;

  // 선택된 캐릭터가 현재 서버와 어긋나면 그 서버의 캐릭터로 맞춘다.
  useEffect(() => {
    if (!selectedServer || usableCharacters.length === 0) return;
    if (selectedCharacter?.serverName === selectedServer) return;
    const match = usableCharacters.find((c) => c.serverName === selectedServer);
    setSelectedCharacterId(match?.id ?? '');
  }, [selectedServer, usableCharacters, selectedCharacter, setSelectedCharacterId]);

  /** 캐릭터를 고르면 그 캐릭터의 서버가 활성화된다 */
  const handleCharacterChange = (characterId: string) => {
    setSelectedCharacterId(characterId);
    const character = characters.find((c) => c.id === characterId);
    if (character?.serverName) setSelectedServer(character.serverName);
  };

  const isLeaderOfActive = myMembership?.leaderId === myUserId;

  const handleCreateClick = () => {
    if (characters.length === 0) {
      toast.warning('먼저 캐릭터를 등록해주세요.');
      return;
    }
    if (myMembership) {
      toast.warning('이미 참여 중인 파티가 있습니다.');
      return;
    }
    setShowCreate(true);
  };

  // 조건을 카드에 숨기지 않고 눌렀을 때 이유를 말해 준다 (원본 동작)
  const handleApplyClick = (post: RecruitPost) => {
    if (characters.length === 0) {
      toast.warning('먼저 캐릭터를 등록해주세요.');
      return;
    }
    if (post.leaderId === myUserId) {
      toast.warning('본인의 파티에는 신청할 수 없습니다.');
      return;
    }
    if (myMembership) {
      toast.warning('이미 다른 파티에 소속되어 있습니다.');
      return;
    }
    // TODO 신청 모달은 다음 이식분
    toast.info('신청 화면은 준비 중입니다.');
  };

  // TODO 파티 상세(파티방)는 다음 이식분
  const handleView = (post: RecruitPost) => {
    toast.info(`«${post.title}» 파티방은 준비 중입니다.`);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-text-primary text-xl font-bold">파티 찾기</h1>
        {!myMembership && (
          <Button onClick={handleCreateClick}>
            <Plus className="h-4 w-4" />
            파티 만들기
          </Button>
        )}
      </div>

      {/* 참여 중인 파티 바로가기 */}
      {myMembership && (
        <Card className="border-brand-200 bg-brand-50/40 mb-4 flex flex-wrap items-center gap-3 border p-4">
          <span className="bg-brand-500 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
            <UsersRound className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-text-tertiary text-xs">
              {isLeaderOfActive ? '내가 만든 파티' : '참여 중인 파티'}
            </p>
            <p className="text-text-primary truncate text-sm font-semibold">{myMembership.title}</p>
            <p className="text-text-tertiary text-xs">
              {myMembership.serverName} · {myMembership.memberCount}/{myMembership.maxMembers}명
            </p>
          </div>

          <Button className="shrink-0" onClick={() => handleView(myMembership)} size="sm">
            파티로 이동 <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      )}

      {/* 서버 · 캐릭터 선택 */}
      <Card className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
        <label className="flex items-center gap-2">
          <span className="text-text-secondary shrink-0 text-sm font-medium">서버</span>
          <Select
            className="min-w-36"
            onChange={(e) => setSelectedServer(e.target.value)}
            value={selectedServer}
          >
            {servers.map((server) => (
              <option key={server.id} value={server.name}>
                {server.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-text-secondary shrink-0 text-sm font-medium">캐릭터</span>
          <Select
            className="min-w-52"
            disabled={characters.length === 0}
            onChange={(e) => handleCharacterChange(e.target.value)}
            value={selectedCharacterId}
          >
            {characters.length === 0 ? (
              <option value="">등록된 캐릭터가 없습니다</option>
            ) : (
              <>
                {!selectedCharacterId && <option value="">캐릭터를 선택하세요</option>}
                {characters.map((c) => (
                  // 서버가 지정되지 않은 캐릭터는 파티에 쓸 수 없다
                  <option key={c.id} disabled={!c.serverName} value={c.id}>
                    {c.nickname} (Lv.{c.level} {c.job})
                    {c.serverName ? ` · ${c.serverName}` : ' · 서버 미지정'}
                  </option>
                ))}
              </>
            )}
          </Select>
        </label>

        {characters.length > 0 && usableCharacters.length === 0 && (
          <span className="text-text-tertiary text-xs">
            캐릭터에 서버를 지정해야 파티를 이용할 수 있습니다.
          </span>
        )}
      </Card>

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <RecruitCategorySidebar
          counts={categoryCounts}
          onSelect={setSelectedCategory}
          selected={selectedCategory}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-text-primary text-base font-semibold">
              {categoryLabel(selectedCategory)}
            </h2>
            <span className="text-text-tertiary text-sm tabular-nums">{posts.length}개</span>
          </div>

          {isLoading ? (
            <Card className="p-12">
              <p className="text-text-tertiary text-center text-sm">불러오는 중...</p>
            </Card>
          ) : posts.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                Icon={UsersRound}
                description="첫 번째 파티를 만들어보세요!"
                title="파티가 없습니다"
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {posts.map((post) => (
                <RecruitCard
                  key={post.id}
                  onApply={handleApplyClick}
                  onView={handleView}
                  post={post}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <RecruitCreateModal
        defaultCharacterId={selectedCharacterId}
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
