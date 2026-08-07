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
  /** 심콜 스킬 구성 — 파티장이 정하고 파티원 전원이 공유한다 */
  buffSkills: RecruitBuffSkill[];
  /** 심콜 실행 기준 시각 (ISO). null 이면 정지 상태 */
  buffStartedAt: string | null;
}

/** recruit_posts.buff_skills 원소 (stores/useBuffCallStore 의 BuffSkill 과 같은 형태) */
export interface RecruitBuffSkill {
  id: string;
  name: string;
  intervalSec: number;
  alertText: string;
  enabled: boolean;
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
  buff_skills: unknown;
  buff_started_at: string | null;
  characters: { nickname: string; job: string; level: number } | null;
  recruit_post_members: { count: number }[];
}

/**
 * jsonb 는 무엇이든 들어올 수 있다 — 컬럼 제약은 "배열"까지만 보장한다.
 * 형태가 어긋난 원소는 통째로 버린다. 하나 깨졌다고 심콜 전체가 죽는 것보다
 * 그 스킬만 사라지는 편이 낫다.
 */
function toBuffSkills(raw: unknown): RecruitBuffSkill[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const s = item as Record<string, unknown>;
    if (typeof s.id !== 'string' || typeof s.name !== 'string') return [];
    if (typeof s.intervalSec !== 'number' || s.intervalSec <= 0) return [];
    return [
      {
        id: s.id,
        name: s.name,
        intervalSec: s.intervalSec,
        alertText: typeof s.alertText === 'string' ? s.alertText : s.name,
        enabled: s.enabled !== false,
      },
    ];
  });
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
    buffSkills: toBuffSkills(r.buff_skills),
    buffStartedAt: r.buff_started_at,
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

// ─── 파티원 ─────────────────────────────────────────────────
export interface RecruitMember {
  id: string;
  userId: string;
  characterId: string;
  role: 'LEADER' | 'MEMBER';
  joinedAt: string;
  nickname: string | null;
  job: string | null;
  level: number | null;
  statAttack: number | null;
}

interface MemberRow {
  id: string;
  user_id: string;
  character_id: string;
  role: string;
  joined_at: string;
  characters: { nickname: string; job: string; level: number; stat_attack: number | null } | null;
}

export async function getRecruitMembers(postId: string): Promise<RecruitMember[]> {
  const { data, error } = await supabase
    .from('recruit_post_members')
    .select('*, characters(nickname, job, level, stat_attack)')
    .eq('post_id', postId)
    // 파티장이 항상 위로
    .order('role')
    .order('joined_at');
  throwIfError(error);
  return ((data as unknown as MemberRow[] | null) ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    characterId: r.character_id,
    role: r.role as RecruitMember['role'],
    joinedAt: r.joined_at,
    nickname: r.characters?.nickname ?? null,
    job: r.characters?.job ?? null,
    level: r.characters?.level ?? null,
    statAttack: r.characters?.stat_attack ?? null,
  }));
}

// ─── 지원 ───────────────────────────────────────────────────
export interface RecruitApplication {
  id: string;
  postId: string;
  userId: string;
  characterId: string;
  statAttack: number | null;
  specText: string | null;
  message: string | null;
  createdAt: string;
  nickname: string | null;
  job: string | null;
  level: number | null;
}

interface ApplicationRow {
  id: string;
  post_id: string;
  user_id: string;
  character_id: string;
  stat_attack: number | null;
  spec_text: string | null;
  message: string | null;
  created_at: string;
  characters: { nickname: string; job: string; level: number } | null;
}

/** 대기 중인 신청만. 처리된 건 목록에 남을 이유가 없다 */
export async function getRecruitApplications(postId: string): Promise<RecruitApplication[]> {
  const { data, error } = await supabase
    .from('recruit_applications')
    .select('*, characters(nickname, job, level)')
    .eq('post_id', postId)
    .eq('status', 'PENDING')
    .order('created_at');
  throwIfError(error);
  return ((data as unknown as ApplicationRow[] | null) ?? []).map((r) => ({
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    characterId: r.character_id,
    statAttack: r.stat_attack,
    specText: r.spec_text,
    message: r.message,
    createdAt: r.created_at,
    nickname: r.characters?.nickname ?? null,
    job: r.characters?.job ?? null,
    level: r.characters?.level ?? null,
  }));
}

export interface ApplyInput {
  postId: string;
  characterId: string;
  statAttack?: number | null;
  specText?: string | null;
  message?: string | null;
}

export async function applyToRecruit(input: ApplyInput): Promise<void> {
  const { error } = await supabase.from('recruit_applications').insert({
    post_id: input.postId,
    user_id: await getUserId(),
    character_id: input.characterId,
    stat_attack: input.statAttack ?? null,
    spec_text: input.specText ?? null,
    message: input.message ?? null,
  });
  throwIfError(error);
}

/**
 * 신청 수락/거절.
 *
 * 수락은 RPC 다 — 신청 상태 변경·멤버 추가·정원 확인이 한 트랜잭션이어야 한다.
 * 거절은 상태만 바꾸면 되므로 직접 UPDATE (RLS 가 파티장인지 검사한다).
 */
export async function respondToApplication(applicationId: string, accept: boolean): Promise<void> {
  if (accept) {
    const { error } = await supabase.rpc('accept_recruit_application', {
      p_application_id: applicationId,
    });
    throwIfError(error);
    return;
  }
  const { error } = await supabase
    .from('recruit_applications')
    .update({ status: 'REJECTED' })
    .eq('id', applicationId);
  throwIfError(error);
}

// ─── 탈퇴 · 퇴장 ────────────────────────────────────────────
// 셋 다 반환값이 평가 세션 id 다. 참가자가 2명 미만이면 세션이 안 만들어져 null.

export async function leaveRecruitPost(postId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('leave_recruit_post', { p_post_id: postId });
  throwIfError(error);
  return (data as unknown as string | null) ?? null;
}

export async function kickRecruitMember(postId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('kick_recruit_member', {
    p_post_id: postId,
    p_user_id: userId,
  });
  throwIfError(error);
  return (data as unknown as string | null) ?? null;
}

/** 해산 — 파티장 전용. 반환값은 평가 세션 id (참가자 2명 미만이면 null) */
export async function closeRecruitPost(postId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('close_recruit_post', { p_post_id: postId });
  throwIfError(error);
  return (data as unknown as string | null) ?? null;
}

// ─── 채팅 ───────────────────────────────────────────────────
// 해산하면 close_recruit_post 가 즉시 지운다. 조회 RLS 도 CLOSED 를 걸러내므로
// 삭제가 누락돼도 노출되지 않는다 (§8 용량 정책).

export interface RecruitMessage {
  id: string;
  postId: string;
  userId: string;
  nickname: string;
  message: string;
  createdAt: string;
}

/** 한 번에 불러오는 최근 메시지 수 */
export const CHAT_PAGE_SIZE = 100;
/** 본문 길이 상한 — 0015 의 CHECK(1~500)와 맞춘다 */
export const CHAT_MAX_LENGTH = 500;

export function toRecruitMessage(row: Record<string, unknown>): RecruitMessage {
  return {
    id: row.id as string,
    postId: row.post_id as string,
    userId: row.user_id as string,
    nickname: row.nickname as string,
    message: row.message as string,
    createdAt: row.created_at as string,
  };
}

/** 최근 CHAT_PAGE_SIZE 건을 오래된 순으로 반환한다 */
export async function getRecruitMessages(postId: string): Promise<RecruitMessage[]> {
  const { data, error } = await supabase
    .from('recruit_messages')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  throwIfError(error);
  // 최신순으로 가져온 뒤 화면 표시용으로 뒤집는다
  return (data ?? [])
    .map((r) => toRecruitMessage(r as unknown as Record<string, unknown>))
    .reverse();
}

export async function sendRecruitMessage(input: {
  postId: string;
  nickname: string;
  message: string;
}): Promise<RecruitMessage> {
  const message = input.message.trim().slice(0, CHAT_MAX_LENGTH);
  if (!message) throw new Error('메시지를 입력해주세요.');

  const { data, error } = await supabase
    .from('recruit_messages')
    .insert({
      post_id: input.postId,
      user_id: await getUserId(),
      nickname: input.nickname,
      message,
    })
    .select()
    .single();
  throwIfError(error);
  return toRecruitMessage(data as unknown as Record<string, unknown>);
}

// ─── 심콜(버프콜) ───────────────────────────────────────────────
/**
 * 스킬 구성과 실행 시각은 **글에 있고 파티장만 쓴다.**
 *
 * 개인 설정이 아니라 파티 설정인 이유: 전원이 같은 기준 시각을 봐야 주기가
 * 정렬돼 동시에 울린다. 각자 시작하면 몇 초씩 어긋나서 콜이 겹친다.
 *
 * RPC 가 아니라 직접 UPDATE 인 것은 recruit_posts_update_leader 정책이
 * 이미 파티장만 통과시키기 때문이다 — 여기서 더 막을 게 없다.
 */
export async function updateBuffSkills(
  postId: string,
  skills: readonly RecruitBuffSkill[],
): Promise<void> {
  const { error } = await supabase
    .from('recruit_posts')
    .update({ buff_skills: skills as unknown as never })
    .eq('id', postId);
  throwIfError(error);
}

/** startedAt 이 null 이면 정지 */
export async function updateBuffTimer(postId: string, startedAt: string | null): Promise<void> {
  const { error } = await supabase
    .from('recruit_posts')
    .update({ buff_started_at: startedAt })
    .eq('id', postId);
  throwIfError(error);
}
