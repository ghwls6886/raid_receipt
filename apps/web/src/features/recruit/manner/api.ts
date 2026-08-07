/**
 * 매너온도 데이터 레이어 — maple_helper lib/api-manner.ts 이식
 *
 * 0015 에서 이름이 바뀐 것들이 있다. 원본을 참고할 때 헷갈리기 쉬우니 적어 둔다:
 *   party_ratings         → recruit_ratings
 *   submit_party_rating   → submit_recruit_rating
 *   party_id / party_title → post_id / post_title
 *
 * 쓰기는 RPC 하나뿐이다. manner_profiles 와 recruit_ratings 는 GRANT 가
 * SELECT 만이라, 온도를 직접 올리거나 평가를 위조할 수 없다.
 */
import { supabase, throwIfError } from '@/lib/supabase';
import { MANNER_TEMP_INITIAL, type RatingTrigger, type RatingValue } from './domain';

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('로그인이 필요합니다.');
  return data.user.id;
}

export interface MannerProfile {
  userId: string;
  temperature: number;
  ratingCount: number;
  likeCount: number;
  neutralCount: number;
  dislikeCount: number;
  stickerCounts: Readonly<Record<string, number>>;
}

export interface RatingTarget {
  userId: string;
  nickname: string;
  job: string;
  level: number;
  temperature: number;
  /** 내가 이 상대를 이미 평가했는지 */
  submitted: boolean;
}

export interface RatingSession {
  id: string;
  postId: string | null;
  postTitle: string;
  category: string;
  trigger: RatingTrigger;
  triggeredByNickname: string;
  createdAt: string;
  expiresAt: string;
  targets: readonly RatingTarget[];
}

export interface SubmitRatingInput {
  sessionId: string;
  targetUserId: string;
  value: RatingValue;
  stickerIds: readonly string[];
}

interface ProfileRow {
  user_id: string;
  temperature: number | string;
  rating_count: number;
  like_count: number;
  neutral_count: number;
  dislike_count: number;
  sticker_counts: unknown;
}

function toStickerCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, number>;
}

function toMannerProfile(row: ProfileRow): MannerProfile {
  return {
    userId: row.user_id,
    // numeric 은 정밀도 보존 때문에 supabase-js 에서 문자열로 올 수 있다.
    temperature: Number(row.temperature ?? MANNER_TEMP_INITIAL),
    ratingCount: row.rating_count ?? 0,
    likeCount: row.like_count ?? 0,
    neutralCount: row.neutral_count ?? 0,
    dislikeCount: row.dislike_count ?? 0,
    stickerCounts: toStickerCounts(row.sticker_counts),
  };
}

/** 프로필 행이 없으면 null — 호출부에서 기본값(30도)으로 취급한다. */
export async function getMannerProfile(userId: string): Promise<MannerProfile | null> {
  const { data, error } = await supabase
    .from('manner_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  throwIfError(error);
  return data ? toMannerProfile(data as ProfileRow) : null;
}

/** 여러 명을 한 번에 — 평가 대상 목록의 온도 배지용 */
export async function getMannerProfiles(userIds: readonly string[]): Promise<MannerProfile[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from('manner_profiles')
    .select('*')
    .in('user_id', [...userIds]);
  throwIfError(error);
  return ((data ?? []) as ProfileRow[]).map(toMannerProfile);
}

interface ParticipantRow {
  user_id: string;
  nickname: string;
  job: string | null;
  level: number | null;
}

interface SessionRow {
  id: string;
  post_id: string | null;
  post_title: string;
  category: string;
  trigger: string;
  triggered_by_nickname: string | null;
  created_at: string;
  expires_at: string;
  rating_session_participants: ParticipantRow[] | null;
}

const SESSION_SELECT = '*, rating_session_participants(user_id, nickname, job, level)';

function toRatingSession(
  row: SessionRow,
  currentUserId: string,
  ratedTargetIds: ReadonlySet<string>,
  temperatures: ReadonlyMap<string, number>,
): RatingSession {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    category: row.category,
    trigger: row.trigger as RatingTrigger,
    triggeredByNickname: row.triggered_by_nickname ?? '',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    // 본인은 평가 대상에서 뺀다. RPC 도 막지만 화면에 띄울 이유가 없다.
    targets: (row.rating_session_participants ?? [])
      .filter((p) => p.user_id !== currentUserId)
      .map((p) => ({
        userId: p.user_id,
        nickname: p.nickname,
        job: p.job ?? '',
        level: p.level ?? 0,
        // 프로필 행이 없으면 아직 평가를 한 번도 안 받은 사람이다 → 기본값
        temperature: temperatures.get(p.user_id) ?? MANNER_TEMP_INITIAL,
        submitted: ratedTargetIds.has(p.user_id),
      })),
  };
}

/**
 * 참가자들의 **현재** 매너온도를 한 번에 읽어 온다.
 *
 * 참가자 스냅샷(rating_session_participants)에는 온도가 없다 — 세션 생성
 * 시점의 캐릭터 정보만 박아 두기 때문이다. 온도는 평가가 쌓일 때마다 변하는
 * 값이라 스냅샷에 넣으면 곧바로 낡는다. 그래서 볼 때마다 현재값을 읽는다.
 *
 * (원본 api-manner 는 여기를 항상 기본값 30도로 두고 있었다. 그러면 평가
 * 화면에서 모든 상대가 30.0°C 로 보여 배지가 아무 정보도 주지 못한다.)
 */
async function loadTemperatures(sessions: readonly SessionRow[]): Promise<Map<string, number>> {
  const userIds = [
    ...new Set(
      sessions.flatMap((s) => (s.rating_session_participants ?? []).map((p) => p.user_id)),
    ),
  ];
  const profiles = await getMannerProfiles(userIds);
  return new Map(profiles.map((p) => [p.userId, p.temperature]));
}

/**
 * 내가 참가자인 평가 세션을 읽는다.
 *
 * RLS(is_rating_participant)가 내가 낀 세션만 돌려주므로 따로 조건을 걸지 않는다.
 * recruit_ratings 정책도 rater_id = auth.uid() 라 아래 조회는 자동으로 "내가 남긴
 * 평가"만 나온다 — 남이 나를 어떻게 평가했는지는 어떤 경로로도 볼 수 없다.
 */
async function loadSessions(onlyPending: boolean): Promise<RatingSession[]> {
  const uid = await getUserId();

  const { data, error } = await supabase
    .from('rating_sessions')
    .select(SESSION_SELECT)
    .order('created_at', { ascending: false });
  throwIfError(error);

  const rows = (data ?? []) as unknown as SessionRow[];
  if (rows.length === 0) return [];

  const { data: myRatings, error: ratingErr } = await supabase
    .from('recruit_ratings')
    .select('session_id, target_id')
    .in(
      'session_id',
      rows.map((r) => r.id),
    );
  throwIfError(ratingErr);

  const ratedBySession = new Map<string, Set<string>>();
  for (const r of myRatings ?? []) {
    const set = ratedBySession.get(r.session_id) ?? new Set<string>();
    set.add(r.target_id);
    ratedBySession.set(r.session_id, set);
  }

  const temperatures = await loadTemperatures(rows);
  const sessions = rows.map((row) =>
    toRatingSession(row, uid, ratedBySession.get(row.id) ?? new Set<string>(), temperatures),
  );

  if (!onlyPending) return sessions;

  // 만료됐거나 이미 다 평가한 세션은 할 일이 없다.
  const now = Date.now();
  return sessions.filter(
    (s) => new Date(s.expiresAt).getTime() > now && s.targets.some((t) => !t.submitted),
  );
}

/** 아직 평가를 마치지 않은, 만료되지 않은 세션 */
export function getPendingRatingSessions(): Promise<RatingSession[]> {
  return loadSessions(true);
}

export function getAllRatingSessions(): Promise<RatingSession[]> {
  return loadSessions(false);
}

/** 세션 하나 — 탈퇴·퇴장·해산 직후 평가 팝업에서 쓴다 */
export async function getRatingSession(sessionId: string): Promise<RatingSession | null> {
  const uid = await getUserId();

  const { data, error } = await supabase
    .from('rating_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;

  const row = data as unknown as SessionRow;

  const { data: myRatings, error: ratingErr } = await supabase
    .from('recruit_ratings')
    .select('target_id')
    .eq('session_id', sessionId);
  throwIfError(ratingErr);

  const rated = new Set((myRatings ?? []).map((r) => r.target_id));
  const temperatures = await loadTemperatures([row]);
  return toRatingSession(row, uid, rated, temperatures);
}

/**
 * 평가 제출.
 *
 * 되돌릴 수 없다 — unique(session_id, rater_id, target_id) 가 재제출을 막는다.
 * 만료·비참가자·본인 평가도 전부 RPC 안에서 막힌다.
 */
export async function submitRating(input: SubmitRatingInput): Promise<void> {
  const { error } = await supabase.rpc('submit_recruit_rating', {
    p_session_id: input.sessionId,
    p_target_id: input.targetUserId,
    p_value: input.value,
    p_sticker_ids: [...input.stickerIds],
  });
  throwIfError(error);
}
