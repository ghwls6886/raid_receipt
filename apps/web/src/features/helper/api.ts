/**
 * 개인 도구 데이터 레이어 — maple_helper 이식 (MERGE_PLAN §7 2단계)
 *
 * 정산(features/settlement/api)과 달리 길드가 없다. 스코프는 auth 계정이고,
 * 소유 판정은 전부 RLS 가 한다 (0013 의 characters_manage_own 등).
 * 그래서 화면이 user_id 를 넘길 필요가 없다 — 넘겨도 RLS 가 다시 검사한다.
 *
 * settlement 을 import 하지 않는다 (§4.1 원칙 3). 공유가 필요하면 @/lib 를 통한다.
 */
import { supabase, throwIfError } from '@/lib/supabase';
import type { JobCategory } from '@/lib/jobs';

/** INSERT 는 RLS(with check auth.uid() = user_id)를 통과해야 해서 user_id 가 필요하다 */
async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('로그인이 필요합니다.');
  return data.user.id;
}

// ─── 캐릭터 ─────────────────────────────────────────────────
export interface Character {
  id: string;
  userId: string;
  nickname: string;
  jobCategory: JobCategory;
  job: string;
  level: number;
  serverName: string;
  isActive: boolean;
  /** 스탯 공격력(스공). 선택 입력이라 없을 수 있다 */
  statAttack: number | null;
}

function toCharacter(r: {
  id: string;
  user_id: string;
  nickname: string;
  job_category: string;
  job: string;
  level: number;
  server_name: string;
  is_active: boolean;
  stat_attack: number | null;
}): Character {
  return {
    id: r.id,
    userId: r.user_id,
    nickname: r.nickname,
    jobCategory: r.job_category as JobCategory,
    job: r.job,
    level: r.level,
    serverName: r.server_name,
    isActive: r.is_active,
    statAttack: r.stat_attack ?? null,
  };
}

/** 활성 캐릭터만 — 화면 대부분이 쓴다 */
export async function getCharacters(): Promise<Character[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('is_active', true)
    .order('created_at');
  throwIfError(error);
  return (data ?? []).map(toCharacter);
}

/** 비활성 포함 전체 — 되살리기 화면용 */
export async function getAllCharacters(): Promise<Character[]> {
  const { data, error } = await supabase.from('characters').select('*').order('created_at');
  throwIfError(error);
  return (data ?? []).map(toCharacter);
}

export interface CharacterInput {
  nickname: string;
  jobCategory: JobCategory;
  job: string;
  level: number;
  serverName: string;
  statAttack?: number | null;
}

export async function addCharacter(input: CharacterInput): Promise<Character> {
  const nickname = input.nickname.trim();
  if (!nickname) throw new Error('닉네임을 입력해 주세요.');

  const { data, error } = await supabase
    .from('characters')
    .insert({
      user_id: await getUserId(),
      nickname,
      job_category: input.jobCategory,
      job: input.job.trim(),
      level: input.level,
      server_name: input.serverName.trim(),
      stat_attack: input.statAttack ?? null,
    })
    .select()
    .single();
  throwIfError(error);
  return toCharacter(data!);
}

export async function updateCharacter(
  id: string,
  input: Partial<CharacterInput>,
): Promise<Character> {
  // undefined 인 필드는 건드리지 않는다 — 부분 수정을 전체 덮어쓰기로 만들지 않기 위함.
  // Record<string, unknown> 은 Supabase 생성 타입이 인덱스 시그니처를 거부해서 못 쓴다.
  const patch: {
    nickname?: string;
    job_category?: string;
    job?: string;
    level?: number;
    server_name?: string;
    stat_attack?: number | null;
  } = {};
  if (input.nickname !== undefined) patch.nickname = input.nickname.trim();
  if (input.jobCategory !== undefined) patch.job_category = input.jobCategory;
  if (input.job !== undefined) patch.job = input.job.trim();
  if (input.level !== undefined) patch.level = input.level;
  if (input.serverName !== undefined) patch.server_name = input.serverName.trim();
  if (input.statAttack !== undefined) patch.stat_attack = input.statAttack;

  const { data, error } = await supabase
    .from('characters')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  throwIfError(error);
  return toCharacter(data!);
}

/**
 * 지우지 않고 비활성화한다. char_boss_entries · checklist_completions 가
 * character_id 를 on delete cascade 로 물고 있어서(0013), 삭제하면 기록이 통째로 날아간다.
 */
export async function deactivateCharacter(id: string): Promise<void> {
  const { error } = await supabase.from('characters').update({ is_active: false }).eq('id', id);
  throwIfError(error);
}

export async function reactivateCharacter(id: string): Promise<void> {
  const { error } = await supabase.from('characters').update({ is_active: true }).eq('id', id);
  throwIfError(error);
}
