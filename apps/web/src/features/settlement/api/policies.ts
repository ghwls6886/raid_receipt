/**
 * 길드 정산 정책 — 기본 설정 · 패널티 · 역할 지원금
 */
import { supabase, throwIfError } from '@/lib/supabase';

// ─── 길드 정산 정책 ─────────────────────────────────────────
export interface GuildSettings {
  ppojiRate: number;
  defaultFeePct: number;
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const { data, error } = await supabase
    .from('guild_settings')
    .select('ppoji_rate, default_fee_pct')
    .eq('guild_id', guildId)
    .maybeSingle();
  throwIfError(error);
  return {
    ppojiRate: data?.ppoji_rate ?? 0,
    defaultFeePct: data?.default_fee_pct ?? 5,
  };
}

// ─── 패널티 정책 ────────────────────────────────────────────
export type PenaltyCalcType = 'percent' | 'fixed';
export const PENALTY_CALC_LABEL: Record<PenaltyCalcType, string> = {
  percent: '%',
  fixed: '메소',
};

export interface PenaltyType {
  id: string;
  guildId: string;
  name: string;
  calcType: PenaltyCalcType;
  value: number;
}

export async function getPenaltyTypes(guildId: string): Promise<PenaltyType[]> {
  const { data, error } = await supabase
    .from('penalty_types')
    .select('*')
    .eq('guild_id', guildId)
    .eq('is_active', true);
  throwIfError(error);
  return (data ?? []).map((p) => ({
    id: p.id,
    guildId: p.guild_id,
    name: p.name,
    calcType: p.calc_type.toLowerCase() as PenaltyCalcType,
    value: p.value,
  }));
}

export interface PenaltyTypeInput {
  name: string;
  calcType: PenaltyCalcType;
  value: number;
}

export async function addPenaltyType(
  guildId: string,
  input: PenaltyTypeInput,
): Promise<PenaltyType> {
  const name = input.name.trim();
  if (!name) throw new Error('패널티명을 입력해 주세요.');

  const { data, error } = await supabase
    .from('penalty_types')
    .insert({
      guild_id: guildId,
      name,
      calc_type: input.calcType.toUpperCase() as 'PERCENT' | 'FIXED',
      value: input.value,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`이미 등록된 패널티입니다: ${name}`);
    throw new Error(error.message);
  }

  return {
    id: data.id,
    guildId: data.guild_id,
    name: data.name,
    calcType: data.calc_type.toLowerCase() as PenaltyCalcType,
    value: data.value,
  };
}

export async function deletePenaltyType(_guildId: string, id: string): Promise<void> {
  // soft delete: is_active = false (확정된 레이드의 penalty_type_id 참조 보존)
  const { error } = await supabase.from('penalty_types').update({ is_active: false }).eq('id', id);
  throwIfError(error);
}

// ─── 역할 지원금 정책 ───────────────────────────────────────
export interface SubsidyType {
  id: string;
  guildId: string;
  name: string;
  /** 자동 프리필 대상 직업. null = 직업 무관(수동으로만 붙임 — 용병 등) */
  job: string | null;
  /** PERCENT: 순수익의 %, FIXED: 메소 정액 */
  calcType: PenaltyCalcType;
  /** calcType 이 PERCENT 면 0~100, FIXED 면 메소 절대액 */
  amount: number;
}

export async function getSubsidyTypes(guildId: string): Promise<SubsidyType[]> {
  const { data, error } = await supabase
    .from('subsidy_types')
    .select('*')
    .eq('guild_id', guildId)
    .eq('is_active', true);
  throwIfError(error);
  return (data ?? []).map((s) => ({
    id: s.id,
    guildId: s.guild_id,
    name: s.name,
    job: s.job,
    calcType: s.calc_type.toLowerCase() as PenaltyCalcType,
    amount: s.amount,
  }));
}

export interface SubsidyTypeInput {
  name: string;
  job: string | null;
  calcType: PenaltyCalcType;
  amount: number;
}

export async function addSubsidyType(
  guildId: string,
  input: SubsidyTypeInput,
): Promise<SubsidyType> {
  const name = input.name.trim();
  if (!name) throw new Error('지원금명을 입력해 주세요.');
  if (input.calcType === 'percent') {
    if (input.amount <= 0 || input.amount > 100) {
      throw new Error('지원금 비율은 1~100% 사이여야 합니다.');
    }
  } else if (input.amount <= 0) {
    throw new Error('지원금은 1 메소 이상이어야 합니다.');
  }

  const { data, error } = await supabase
    .from('subsidy_types')
    .insert({
      guild_id: guildId,
      name,
      job: input.job,
      calc_type: input.calcType.toUpperCase() as 'PERCENT' | 'FIXED',
      amount: input.amount,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`이미 등록된 지원금입니다: ${name}`);
    throw new Error(error.message);
  }

  return {
    id: data.id,
    guildId: data.guild_id,
    name: data.name,
    job: data.job,
    calcType: data.calc_type.toLowerCase() as PenaltyCalcType,
    amount: data.amount,
  };
}

export async function deleteSubsidyType(_guildId: string, id: string): Promise<void> {
  // soft delete: is_active = false (확정된 레이드의 subsidy_type_id 참조 보존)
  const { error } = await supabase.from('subsidy_types').update({ is_active: false }).eq('id', id);
  throwIfError(error);
}

