/**
 * 공대 — 고정 조직이자 정산 단위 (MERGE_PLAN 함정 1: helper 의 recruit_posts 와 다름)
 */
import { supabase, throwIfError } from '@/lib/supabase';
import type { RemainderPolicy } from './raids';

// ─── 공대 ───────────────────────────────────────────────────
export interface Party {
  id: string;
  guildId: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  remainderPolicy: RemainderPolicy;
}

export async function getParties(guildId: string): Promise<Party[]> {
  const { data, error } = await supabase
    .from('parties')
    .select('*, party_members(member_id)')
    .eq('guild_id', guildId);
  throwIfError(error);
  return (data ?? []).map((p) => ({
    id: p.id,
    guildId: p.guild_id,
    name: p.name,
    leaderId: p.leader_id ?? '',
    memberIds: (p.party_members as { member_id: string }[]).map((pm) => pm.member_id),
    remainderPolicy: p.remainder_policy.toLowerCase() as RemainderPolicy,
  }));
}

export interface PartyInput {
  name: string;
  leaderId: string;
  memberIds: string[];
  remainderPolicy: RemainderPolicy;
}

function ensureLeader(memberIds: string[], leaderId: string): string[] {
  return memberIds.includes(leaderId) ? memberIds : [leaderId, ...memberIds];
}

export async function createParty(guildId: string, input: PartyInput): Promise<Party> {
  const name = input.name.trim();
  if (!name) throw new Error('공대명을 입력해 주세요.');
  if (!input.leaderId) throw new Error('공대장을 지정해 주세요.');

  const allMembers = ensureLeader(input.memberIds, input.leaderId);

  const { data, error } = await supabase
    .from('parties')
    .insert({
      guild_id: guildId,
      name,
      leader_id: input.leaderId,
      remainder_policy: input.remainderPolicy.toUpperCase() as 'LEADER' | 'FUND' | 'FIRST',
    })
    .select()
    .single();
  throwIfError(error);

  if (allMembers.length > 0) {
    const { error: pmError } = await supabase
      .from('party_members')
      .insert(allMembers.map((mid) => ({ party_id: data!.id, member_id: mid })));
    throwIfError(pmError);
  }

  return {
    id: data!.id,
    guildId: data!.guild_id,
    name: data!.name,
    leaderId: data!.leader_id ?? '',
    memberIds: allMembers,
    remainderPolicy: input.remainderPolicy,
  };
}

export async function updateParty(
  guildId: string,
  partyId: string,
  input: PartyInput,
): Promise<Party> {
  const name = input.name.trim();
  if (!name) throw new Error('공대명을 입력해 주세요.');

  const allMembers = ensureLeader(input.memberIds, input.leaderId);

  const { error } = await supabase
    .from('parties')
    .update({
      name,
      leader_id: input.leaderId || null,
      remainder_policy: input.remainderPolicy.toUpperCase() as 'LEADER' | 'FUND' | 'FIRST',
    })
    .eq('id', partyId);
  throwIfError(error);

  // party_members 교체: 전체 삭제 후 재삽입
  await supabase.from('party_members').delete().eq('party_id', partyId);
  if (allMembers.length > 0) {
    const { error: pmError } = await supabase
      .from('party_members')
      .insert(allMembers.map((mid) => ({ party_id: partyId, member_id: mid })));
    throwIfError(pmError);
  }

  return {
    id: partyId,
    guildId,
    name,
    leaderId: input.leaderId,
    memberIds: allMembers,
    remainderPolicy: input.remainderPolicy,
  };
}

export async function deleteParty(_guildId: string, partyId: string): Promise<void> {
  const { error } = await supabase.from('parties').delete().eq('id', partyId);
  throwIfError(error);
}

