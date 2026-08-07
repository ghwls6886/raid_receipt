/**
 * 공용 마스터 데이터 — 보스 · 게임 서버 (MERGE_PLAN §3.2)
 *
 * 정산과 helper 가 같이 쓰는 마스터라 접두어 없이 lib 에 둔다.
 * 0012_helper_masters.sql 에서 bosses 는 maple_helper 스키마로 교체되고
 * servers 는 game_servers 로 흡수된다.
 */
import { supabase, throwIfError } from '@/lib/supabase';

/** 보스 마스터에 쿨타임이 없을 때 쓰는 기본값 (시간) */
export const DEFAULT_COOLDOWN_HOURS = 24;

// ─── 보스 마스터 ────────────────────────────────────────────
/** 0012 이후 컬럼 전체. 정산은 name·cooldownHours 만 쓰지만 helper 보스추적이 나머지를 쓴다 */
export interface Boss {
  id: string;
  name: string;
  cycle: 'DAILY' | 'WEEKLY';
  cooldownHours: number;
  /** KST 기준 초기화 시각 (0 = 자정) */
  resetHourKst: number;
  difficulty: string;
  sortOrder: number;
  /** 쿨타임 안에 몇 번까지 들어갈 수 있는가 */
  maxEntries: number;
}

function toBoss(r: {
  id: string;
  name: string;
  cycle: string;
  cooldown_hours: number;
  reset_hour_kst: number;
  difficulty: string;
  sort_order: number;
  max_entries: number;
}): Boss {
  return {
    id: r.id,
    name: r.name,
    cycle: r.cycle as Boss['cycle'],
    cooldownHours: r.cooldown_hours,
    resetHourKst: r.reset_hour_kst,
    difficulty: r.difficulty,
    sortOrder: r.sort_order,
    maxEntries: r.max_entries,
  };
}

/** 정렬은 이름이 아니라 마스터가 정한 sort_order 다 (0012 가 1~8 로 매겼다) */
export async function getBosses(): Promise<Boss[]> {
  const { data, error } = await supabase.from('bosses').select('*').order('sort_order');
  throwIfError(error);
  return (data ?? []).map(toBoss);
}

export const MAX_COOLDOWN_HOURS = 720;

function cooldownError(hours: number): string | null {
  if (!Number.isInteger(hours) || hours < 1) return '쿨타임은 1시간 이상의 정수여야 합니다.';
  if (hours > MAX_COOLDOWN_HOURS)
    return `쿨타임은 ${MAX_COOLDOWN_HOURS}시간(30일) 이하여야 합니다.`;
  return null;
}

/**
 * 마스터 id 생성 — bosses·game_servers 는 text PK 라 DB 기본값이 없다 (0012).
 *
 * 0012 가 넣은 큐레이션 마스터는 'zakum' 같은 읽기 좋은 슬러그를 쓰지만, 한글 이름에서
 * 슬러그를 자동으로 뽑을 방법이 마땅치 않다. 화면에 노출되는 값도 아니므로 관리자가
 * 추가한 행은 생성 id 를 쓴다. 접두어로 출처가 구분된다.
 */
function makeMasterId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * 시스템 관리자 전용 (0014). admins 에 없는 계정은 RLS 가 막아 42501 이 온다.
 * cycle·difficulty·sort_order·max_entries 는 DB 기본값(DAILY·normal·0·2)을 따른다.
 */
export async function addBoss(name: string, cooldownHours = DEFAULT_COOLDOWN_HOURS): Promise<Boss> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('보스 이름을 입력해 주세요.');
  const invalid = cooldownError(cooldownHours);
  if (invalid) throw new Error(invalid);

  const { data, error } = await supabase
    .from('bosses')
    .insert({ id: makeMasterId('boss'), name: trimmed, cooldown_hours: cooldownHours })
    .select('*')
    .single();
  throwIfError(error);
  return toBoss(data!);
}

export async function updateBossCooldown(id: string, cooldownHours: number): Promise<Boss> {
  const invalid = cooldownError(cooldownHours);
  if (invalid) throw new Error(invalid);

  const { data, error } = await supabase
    .from('bosses')
    .update({ cooldown_hours: cooldownHours })
    .eq('id', id)
    .select('*')
    .single();
  throwIfError(error);
  return toBoss(data!);
}

/**
 * 보스를 지우면 개인 추적·기록도 같이 사라진다 (user_boss_tracking·char_boss_entries 는
 * on delete cascade). 정산 쪽 boss_entries 는 set null + boss_name 스냅샷이라 남는다.
 */
export async function deleteBoss(id: string): Promise<void> {
  const { error } = await supabase.from('bosses').delete().eq('id', id);
  throwIfError(error);
}

// ─── 서버 마스터 ────────────────────────────────────────────
export interface GameServer {
  id: string;
  name: string;
}

/** 관리 화면용 — 비활성 포함 전체 */
export async function getServers(): Promise<GameServer[]> {
  const { data, error } = await supabase.from('game_servers').select('id, name').order('name');
  throwIfError(error);
  return data ?? [];
}

/**
 * 사용자 화면용 — 활성 서버만, 마스터가 정한 순서대로.
 * 캐릭터 등록 폼(helper)이 쓴다. is_active·sort_order 는 0012 에서 들어왔다.
 */
export async function getActiveServers(): Promise<GameServer[]> {
  const { data, error } = await supabase
    .from('game_servers')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order');
  throwIfError(error);
  return data ?? [];
}

/** 시스템 관리자 전용 (0014) */
export async function addServer(name: string): Promise<GameServer> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('서버 이름을 입력해 주세요.');

  const { data, error } = await supabase
    .from('game_servers')
    .insert({ id: makeMasterId('server'), name: trimmed })
    .select('id, name')
    .single();
  throwIfError(error);
  return data!;
}

export async function deleteServer(id: string): Promise<void> {
  const { error } = await supabase.from('game_servers').delete().eq('id', id);
  throwIfError(error);
}
