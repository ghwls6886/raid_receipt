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

// ─── 개인 보스 입장 기록 ────────────────────────────────────
// 테이블은 char_boss_entries — 정산의 boss_entries 와 이름이 겹쳐 개명한 것이다.
// 정산은 공대 단위(guild_id, party_id), 여기는 캐릭터 단위(user_id, character_id)+note.
// 축이 달라 합칠 수 없다 (MERGE_PLAN 함정 2).

export interface CharBossEntry {
  id: string;
  userId: string;
  characterId: string;
  bossId: string;
  /** 마스터에서 보스가 사라져도 화면이 이름을 잃지 않도록 남기는 스냅샷 */
  bossName: string;
  enteredAt: string;
  note: string;
}

export interface UserBossTracking {
  userId: string;
  bossId: string;
  characterId: string;
  notifyEnabled: boolean;
}

function toCharBossEntry(r: {
  id: string;
  user_id: string;
  character_id: string;
  boss_id: string;
  boss_name: string;
  entered_at: string;
  note: string;
}): CharBossEntry {
  return {
    id: r.id,
    userId: r.user_id,
    characterId: r.character_id,
    bossId: r.boss_id,
    bossName: r.boss_name,
    enteredAt: r.entered_at,
    note: r.note,
  };
}

function toTracking(r: {
  user_id: string;
  boss_id: string;
  character_id: string;
  notify_enabled: boolean;
}): UserBossTracking {
  return {
    userId: r.user_id,
    bossId: r.boss_id,
    characterId: r.character_id,
    notifyEnabled: r.notify_enabled,
  };
}

/** characterId 를 주면 그 캐릭터만, 없으면 내 전체 기록 (최신순) */
export async function getCharBossEntries(characterId?: string): Promise<CharBossEntry[]> {
  let query = supabase
    .from('char_boss_entries')
    .select('*')
    .order('entered_at', { ascending: false });
  if (characterId) query = query.eq('character_id', characterId);

  const { data, error } = await query;
  throwIfError(error);
  return (data ?? []).map(toCharBossEntry);
}

export async function addCharBossEntry(input: {
  characterId: string;
  bossId: string;
  bossName: string;
  note?: string;
  /** 생략하면 지금. "입장하고 늦게 눌렀을 때" 사용자가 보정할 수 있다 */
  enteredAt?: string;
}): Promise<CharBossEntry> {
  const { data, error } = await supabase
    .from('char_boss_entries')
    .insert({
      user_id: await getUserId(),
      character_id: input.characterId,
      boss_id: input.bossId,
      boss_name: input.bossName,
      note: input.note ?? '',
      entered_at: input.enteredAt ?? new Date().toISOString(),
    })
    .select()
    .single();
  throwIfError(error);
  return toCharBossEntry(data!);
}

/**
 * 한 달치 입장 기록 — 달력 화면용.
 *
 * 경계는 [해당 월 1일, 다음 달 1일) 이다. 월말 계산을 직접 하지 않으려고 마지막 날 대신
 * 다음 달 1일을 lt 로 잡는다 — 28/29/30/31 분기가 통째로 사라진다.
 *
 * 문자열 경계라 Postgres 가 서버 타임존(Supabase 기본 UTC)으로 해석한다. 달력은 로컬
 * 날짜로 칸을 나누므로 월 경계 몇 시간이 어긋날 수 있지만, "지난달 말일 밤 기록이 이번 달
 * 1일 칸에 보이는" 정도라 실사용에 문제가 없다.
 */
export async function getCharBossEntriesByMonth(
  characterId: string,
  year: number,
  month: number,
): Promise<CharBossEntry[]> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${String(year)}-${pad(month)}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${String(nextYear)}-${pad(nextMonth)}-01`;

  const { data, error } = await supabase
    .from('char_boss_entries')
    .select('*')
    .eq('character_id', characterId)
    .gte('entered_at', start)
    .lt('entered_at', end)
    .order('entered_at', { ascending: false });
  throwIfError(error);
  return (data ?? []).map(toCharBossEntry);
}

export async function deleteCharBossEntry(id: string): Promise<void> {
  const { error } = await supabase.from('char_boss_entries').delete().eq('id', id);
  throwIfError(error);
}

export async function updateCharBossEntryTime(
  id: string,
  enteredAt: string,
): Promise<CharBossEntry> {
  const { data, error } = await supabase
    .from('char_boss_entries')
    .update({ entered_at: enteredAt })
    .eq('id', id)
    .select()
    .single();
  throwIfError(error);
  return toCharBossEntry(data!);
}

// ─── 보스 추적 등록 ─────────────────────────────────────────
export async function getBossTrackings(characterId: string): Promise<UserBossTracking[]> {
  const { data, error } = await supabase
    .from('user_boss_tracking')
    .select('*')
    .eq('character_id', characterId);
  throwIfError(error);
  return (data ?? []).map(toTracking);
}

/** 등록 토글 — 없으면 켜서 만들고, 있으면 notify_enabled 를 뒤집는다 */
export async function toggleBossTracking(
  characterId: string,
  bossId: string,
): Promise<UserBossTracking> {
  const userId = await getUserId();

  // 미등록이 정상 경로다. single 이면 그때마다 에러가 나므로 maybeSingle 을 쓴다.
  const { data: existing, error: findError } = await supabase
    .from('user_boss_tracking')
    .select('*')
    .eq('character_id', characterId)
    .eq('boss_id', bossId)
    .maybeSingle();
  throwIfError(findError);

  if (existing) {
    const { data, error } = await supabase
      .from('user_boss_tracking')
      .update({ notify_enabled: !existing.notify_enabled })
      .eq('user_id', userId)
      .eq('boss_id', bossId)
      .eq('character_id', characterId)
      .select()
      .single();
    throwIfError(error);
    return toTracking(data!);
  }

  const { data, error } = await supabase
    .from('user_boss_tracking')
    .insert({ user_id: userId, boss_id: bossId, character_id: characterId, notify_enabled: true })
    .select()
    .single();
  throwIfError(error);
  return toTracking(data!);
}

// ─── 숙제 체크리스트 ────────────────────────────────────────
// 항목 정의(템플릿)는 **계정 단위**, 완료 기록은 **캐릭터 × 기간** 단위다.
// 그래서 캐릭터를 여럿 키우면 같은 "자쿰" 항목이 캐릭터마다 따로 체크된다.

/** DB 의 boss_cycle enum 과 같은 값 (0012 에서 만들고 0013 이 재사용) */
export type ChecklistCycle = 'DAILY' | 'WEEKLY';

export interface ChecklistTemplate {
  id: string;
  userId: string;
  name: string;
  cycle: ChecklistCycle;
  sortOrder: number;
  isActive: boolean;
}

export interface ChecklistCompletion {
  id: string;
  templateId: string;
  characterId: string;
  /** 기간 키 "YYYY-MM-DD" — 일간은 그날, 주간은 그 주 월요일 (@/lib/date) */
  periodDate: string;
  completedAt: string;
}

function toTemplate(r: {
  id: string;
  user_id: string;
  name: string;
  cycle: string;
  sort_order: number;
  is_active: boolean;
}): ChecklistTemplate {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    cycle: r.cycle as ChecklistCycle,
    sortOrder: r.sort_order,
    isActive: r.is_active,
  };
}

function toCompletion(r: {
  id: string;
  template_id: string;
  character_id: string;
  period_date: string;
  completed_at: string;
}): ChecklistCompletion {
  return {
    id: r.id,
    templateId: r.template_id,
    characterId: r.character_id,
    periodDate: r.period_date,
    completedAt: r.completed_at,
  };
}

export async function getChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  throwIfError(error);
  return (data ?? []).map(toTemplate);
}

export async function addChecklistTemplate(input: {
  name: string;
  cycle: ChecklistCycle;
}): Promise<ChecklistTemplate> {
  const name = input.name.trim();
  if (!name) throw new Error('항목 이름을 입력해 주세요.');

  const userId = await getUserId();

  // 새 항목은 맨 아래에 붙인다. maybeSingle 이어야 한다 — single 은 첫 항목일 때
  // 0행이라 에러를 내고, 그러면 에러를 삼켜야만 동작하는 코드가 된다.
  const { data: last, error: lastError } = await supabase
    .from('checklist_templates')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(lastError);

  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({ user_id: userId, name, cycle: input.cycle, sort_order: (last?.sort_order ?? 0) + 1 })
    .select()
    .single();
  throwIfError(error);
  return toTemplate(data!);
}

/**
 * 지우지 않고 비활성화한다. checklist_completions 가 template_id 를
 * on delete cascade 로 물고 있어(0013), 삭제하면 지난 완료 기록이 통째로 날아간다.
 */
export async function removeChecklistTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('checklist_templates')
    .update({ is_active: false })
    .eq('id', id);
  throwIfError(error);
}

export async function getChecklistCompletions(
  characterId: string,
  periodDate: string,
): Promise<ChecklistCompletion[]> {
  const { data, error } = await supabase
    .from('checklist_completions')
    .select('*')
    .eq('character_id', characterId)
    .eq('period_date', periodDate);
  throwIfError(error);
  return (data ?? []).map(toCompletion);
}

/** 체크 토글 — 반환값은 토글 후의 완료 여부 */
export async function toggleChecklistCompletion(
  templateId: string,
  characterId: string,
  periodDate: string,
): Promise<boolean> {
  // 미완료가 정상 경로다. single 이면 체크할 때마다 에러가 나므로 maybeSingle 을 쓴다.
  const { data: existing, error: findError } = await supabase
    .from('checklist_completions')
    .select('id')
    .eq('template_id', templateId)
    .eq('character_id', characterId)
    .eq('period_date', periodDate)
    .maybeSingle();
  throwIfError(findError);

  if (existing) {
    const { error } = await supabase.from('checklist_completions').delete().eq('id', existing.id);
    throwIfError(error);
    return false;
  }

  const { error } = await supabase
    .from('checklist_completions')
    .insert({ template_id: templateId, character_id: characterId, period_date: periodDate });
  throwIfError(error);
  return true;
}
