/**
 * 구인 데이터 레이어 — maple_helper 이식 (MERGE_PLAN §7 4단계)
 *
 * 테이블은 0015 가 만든 recruit_* 다. maple_helper 의 parties 를 개명한 것으로,
 * 정산의 parties(고정 공대)와는 완전히 다른 개념이다 (함정 1).
 *
 * **쓰기는 대부분 RPC 를 거친다.** 0015 가 GRANT 를 좁혀놨기 때문인데 이유가 있다:
 * recruit_post_members 에 직접 INSERT 를 열면 승인 없이 아무 파티에나 자기를
 * 밀어 넣을 수 있다(원본의 구멍). 참가·탈퇴·퇴장·해산은 전부 RPC 다.
 *
 * settlement / helper 를 import 하지 않는다 (§4.1 원칙 3).
 */
import { supabase, throwIfError } from '@/lib/supabase';

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('로그인이 필요합니다.');
  return data.user.id;
}

/**
 * 구인 글을 쓸 때 고르는 내 캐릭터 — 필요한 필드만.
 *
 * characters 는 helper 가 만든 테이블이지만 **두 feature 가 공유하는 데이터**다
 * (0015 의 characters_read_recruit_participants 정책이 그걸 전제로 열어 준다).
 * features/helper/api 를 import 하면 §4.1 원칙 3 위반이라 여기서 직접 읽는다.
 *
 * TODO 공유 범위가 더 늘면 lib/masters.ts 처럼 lib 으로 승격할 것.
 * 지금은 select 한 줄이라 중복 비용이 승격 비용보다 싸다.
 */
export interface RecruitCharacter {
  id: string;
  nickname: string;
  job: string;
  level: number;
  statAttack: number | null;
  serverName: string;
}

export async function getMyRecruitCharacters(): Promise<RecruitCharacter[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('id, nickname, job, level, stat_attack, server_name')
    .eq('is_active', true)
    .order('created_at');
  throwIfError(error);
  return (data ?? []).map((c) => ({
    id: c.id,
    nickname: c.nickname,
    job: c.job,
    level: c.level,
    statAttack: c.stat_attack,
    serverName: c.server_name,
  }));
}

export type RecruitStatus = 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'CLOSED';

/** 목록에서 살아 있는 글로 치는 상태 — CLOSED 만 제외한다 */
const ACTIVE_STATUSES: RecruitStatus[] = ['OPEN', 'FULL', 'IN_PROGRESS'];

export interface RecruitPost {
  id: string;
  leaderId: string;
  characterId: string;
  title: string;
  category: string;
  requiredStatAttack: number | null;
  specDescription: string | null;
  leaderStatAttack: number | null;
  leaderSpec: string | null;
  maxMembers: number;
  status: RecruitStatus;
  serverName: string;
  createdAt: string;
  /** 조인 결과 — 파티장 캐릭터. 0015 의 characters 조회 정책이 열어 준다 */
  leaderNickname: string | null;
  leaderJob: string | null;
  leaderLevel: number | null;
  /** 현재 인원 (파티장 포함) */
  memberCount: number;
}

/** PostgREST 조인 결과의 형태 — 관계 컬럼은 객체 또는 배열로 온다 */
interface PostRow {
  id: string;
  leader_id: string;
  character_id: string;
  title: string;
  category: string;
  required_stat_attack: number | null;
  spec_description: string | null;
  leader_stat_attack: number | null;
  leader_spec: string | null;
  max_members: number;
  status: string;
  server_name: string;
  created_at: string;
  characters: { nickname: string; job: string; level: number } | null;
  recruit_post_members: { count: number }[];
}

const SELECT_WITH_JOINS = '*, characters(nickname, job, level), recruit_post_members(count)';

function toPost(r: PostRow): RecruitPost {
  return {
    id: r.id,
    leaderId: r.leader_id,
    characterId: r.character_id,
    title: r.title,
    category: r.category,
    requiredStatAttack: r.required_stat_attack,
    specDescription: r.spec_description,
    leaderStatAttack: r.leader_stat_attack,
    leaderSpec: r.leader_spec,
    maxMembers: r.max_members,
    status: r.status as RecruitStatus,
    serverName: r.server_name,
    createdAt: r.created_at,
    leaderNickname: r.characters?.nickname ?? null,
    leaderJob: r.characters?.job ?? null,
    leaderLevel: r.characters?.level ?? null,
    // 집계는 [{ count: n }] 로 온다. 0건이면 배열이 비어 있다.
    memberCount: r.recruit_post_members[0]?.count ?? 0,
  };
}

/**
 * 구인 글 목록. CLOSED 는 빼고 최신순.
 *
 * **서버로만 거른다.** 카테고리는 화면이 클라이언트에서 거른다 — 사이드바의
 * 카테고리별 카운트 배지를 그리려면 어차피 카테고리 필터가 걸리지 않은
 * 전체 목록이 필요하기 때문이다.
 *
 * 서버는 반대로 DB 에서 거른다. 다른 서버 글은 애초에 볼 이유가 없어서
 * 받아오면 egress 만 나간다 (§8).
 */
export async function getRecruitPosts(opts?: { serverName?: string }): Promise<RecruitPost[]> {
  let query = supabase
    .from('recruit_posts')
    .select(SELECT_WITH_JOINS)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false });

  if (opts?.serverName) query = query.eq('server_name', opts.serverName);

  const { data, error } = await query;
  throwIfError(error);
  return ((data as unknown as PostRow[] | null) ?? []).map(toPost);
}

export async function getRecruitPost(id: string): Promise<RecruitPost | null> {
  const { data, error } = await supabase
    .from('recruit_posts')
    .select(SELECT_WITH_JOINS)
    .eq('id', id)
    .maybeSingle();
  throwIfError(error);
  return data ? toPost(data as unknown as PostRow) : null;
}

/**
 * 내가 지금 속한 파티 — 없으면 null.
 *
 * 한 사람은 동시에 한 파티에만 속한다(0015 의 single-active 트리거). 그래서 결과가
 * 0개 아니면 1개다. 이 값으로 "글 올리기" 버튼과 참여 배너를 가른다.
 */
export async function getMyRecruitMembership(): Promise<RecruitPost | null> {
  const { data, error } = await supabase
    .from('recruit_post_members')
    .select('post_id, recruit_posts!inner(status)')
    .eq('user_id', await getUserId())
    .in('recruit_posts.status', ACTIVE_STATUSES)
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  return getRecruitPost((data as unknown as { post_id: string }).post_id);
}

export interface RecruitPostInput {
  characterId: string;
  title: string;
  category: string;
  maxMembers: number;
  serverName: string;
  requiredStatAttack?: number | null;
  specDescription?: string | null;
  leaderStatAttack?: number | null;
  leaderSpec?: string | null;
}

/**
 * 구인 글 작성.
 *
 * RPC 를 쓴다 — 글 생성과 파티장 멤버 등록이 한 트랜잭션이어야 한다.
 * 나눠 부르면 두 번째가 실패했을 때 멤버 0명짜리 유령 글이 남는다.
 */
export async function createRecruitPost(input: RecruitPostInput): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error('제목을 입력해 주세요.');

  const { data, error } = await supabase.rpc('create_recruit_post', {
    p_character_id: input.characterId,
    p_title: title,
    p_category: input.category,
    p_max_members: input.maxMembers,
    p_server_name: input.serverName,
    // 생성된 타입이 DEFAULT NULL 파라미터를 optional 로 낸다. 키를 생략하면
    // Postgres 가 DEFAULT NULL 을 쓰므로 결과는 null 을 넘긴 것과 같다.
    p_required_stat_attack: input.requiredStatAttack ?? undefined,
    p_spec_description: input.specDescription?.trim() || undefined,
    p_leader_stat_attack: input.leaderStatAttack ?? undefined,
    p_leader_spec: input.leaderSpec?.trim() || undefined,
  });
  throwIfError(error);
  return data as unknown as string;
}

/** 해산 — 파티장 전용. 반환값은 평가 세션 id (참가자 2명 미만이면 null) */
export async function closeRecruitPost(postId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('close_recruit_post', { p_post_id: postId });
  throwIfError(error);
  return (data as unknown as string | null) ?? null;
}
