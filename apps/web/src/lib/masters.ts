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
export interface Boss {
  id: string;
  name: string;
  cooldownHours: number;
}

export async function getBosses(): Promise<Boss[]> {
  const { data, error } = await supabase
    .from('bosses')
    .select('id, name, cooldown_hours')
    .order('name');
  throwIfError(error);
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    cooldownHours: b.cooldown_hours,
  }));
}

export const MAX_COOLDOWN_HOURS = 720;

function cooldownError(hours: number): string | null {
  if (!Number.isInteger(hours) || hours < 1) return '쿨타임은 1시간 이상의 정수여야 합니다.';
  if (hours > MAX_COOLDOWN_HOURS)
    return `쿨타임은 ${MAX_COOLDOWN_HOURS}시간(30일) 이하여야 합니다.`;
  return null;
}

/** SYS 관리자 전용 — 일반 authenticated 는 GRANT 없음 */
export async function addBoss(name: string, cooldownHours = DEFAULT_COOLDOWN_HOURS): Promise<Boss> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('보스 이름을 입력해 주세요.');
  const invalid = cooldownError(cooldownHours);
  if (invalid) throw new Error(invalid);
  throw new Error('보스 추가는 시스템 관리자 전용입니다.');
}

export async function updateBossCooldown(_id: string, cooldownHours: number): Promise<Boss> {
  const invalid = cooldownError(cooldownHours);
  if (invalid) throw new Error(invalid);
  throw new Error('쿨타임 변경은 시스템 관리자 전용입니다.');
}

export async function deleteBoss(_id: string): Promise<void> {
  throw new Error('보스 삭제는 시스템 관리자 전용입니다.');
}

// ─── 서버 마스터 ────────────────────────────────────────────
export interface GameServer {
  id: string;
  name: string;
}

export async function getServers(): Promise<GameServer[]> {
  const { data, error } = await supabase.from('game_servers').select('id, name').order('name');
  throwIfError(error);
  return data ?? [];
}

export async function addServer(_name: string): Promise<GameServer> {
  throw new Error('서버 추가는 시스템 관리자 전용입니다.');
}

export async function deleteServer(_id: string): Promise<void> {
  throw new Error('서버 삭제는 시스템 관리자 전용입니다.');
}

