/**
 * 공대원 — 명단 · 직업 그룹 · 권한 · 활성/비활성
 */
import { supabase, throwIfError } from '@/lib/supabase';
import { getParties } from './parties';

// ─── 공대원 ─────────────────────────────────────────────────
export type MemberRole = 'MASTER' | 'MANAGER' | 'MEMBER';

export const ROLE_LABEL: Record<MemberRole, string> = {
  MASTER: '마스터',
  MANAGER: '부마스터',
  MEMBER: '공대원',
};

export interface Member {
  id: string;
  guildId: string;
  nickname: string;
  jobCategory: string;
  job: string;
  level: number;
  role: MemberRole;
  isActive: boolean;
}

export interface JobGroup {
  category: string;
  jobs: string[];
}

export const JOB_GROUPS: JobGroup[] = [
  { category: '전사', jobs: ['히어로', '팔라딘', '다크나이트'] },
  { category: '마법사', jobs: ['아크메이지(불,독)', '아크메이지(썬,콜)', '비숍'] },
  { category: '궁수', jobs: ['보우마스터', '신궁'] },
  { category: '도적', jobs: ['나이트로드', '섀도어'] },
  { category: '해적', jobs: ['바이퍼', '캡틴'] },
];

export const JOB_CATEGORIES: string[] = JOB_GROUPS.map((g) => g.category);

export function jobCategoryOf(job: string): string {
  return JOB_GROUPS.find((g) => g.jobs.includes(job))?.category ?? '기타';
}

export interface JobSection {
  category: string;
  members: Member[];
}

export function groupMembersByJob(members: Member[]): JobSection[] {
  return JOB_GROUPS.map((g) => ({
    category: g.category,
    members: members
      .filter((m) => m.jobCategory === g.category)
      .sort((a, b) => {
        const ja = g.jobs.indexOf(a.job);
        const jb = g.jobs.indexOf(b.job);
        if (ja !== jb) return ja - jb;
        return b.level - a.level;
      }),
  })).filter((section) => section.members.length > 0);
}

function toMember(r: {
  id: string;
  guild_id: string;
  nickname: string;
  job_category: string;
  job: string;
  level: number;
  role: string;
  is_active: boolean;
}): Member {
  return {
    id: r.id,
    guildId: r.guild_id,
    nickname: r.nickname,
    jobCategory: r.job_category,
    job: r.job,
    level: r.level,
    role: r.role as MemberRole,
    isActive: r.is_active,
  };
}

export async function getMembers(guildId: string, includeInactive = false): Promise<Member[]> {
  let query = supabase.from('members').select('*').eq('guild_id', guildId);
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  throwIfError(error);
  return (data ?? []).map(toMember);
}

export interface AddMemberInput {
  nickname: string;
  jobCategory: string;
  job: string;
  level: number;
  role: MemberRole;
}

export async function addMember(guildId: string, input: AddMemberInput): Promise<Member> {
  const nickname = input.nickname.trim();
  if (!nickname) throw new Error('닉네임을 입력해 주세요.');

  const { data, error } = await supabase
    .from('members')
    .insert({
      guild_id: guildId,
      nickname,
      job_category: input.jobCategory || jobCategoryOf(input.job),
      job: input.job,
      level: input.level,
      role: input.role,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // unique violation — 비활성 포함 닉네임 중복
      throw new Error(`이미 등록된 닉네임입니다: ${nickname}`);
    }
    throw new Error(error.message);
  }
  return toMember(data);
}

function masterCount(list: Member[]): number {
  return list.filter((m) => m.role === 'MASTER' && m.isActive).length;
}

export async function updateMemberRole(
  guildId: string,
  memberId: string,
  role: MemberRole,
): Promise<Member> {
  // 마지막 마스터 강등 방지
  if (role !== 'MASTER') {
    const members = await getMembers(guildId);
    const target = members.find((m) => m.id === memberId);
    if (target?.role === 'MASTER' && masterCount(members) <= 1) {
      throw new Error('관리자(마스터)는 최소 1명 필요합니다. 다른 관리자를 먼저 임명하세요.');
    }
  }

  const { data, error } = await supabase
    .from('members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single();
  throwIfError(error);
  return toMember(data!);
}

export interface DeactivateResult {
  member: Member;
  removedFromParties: string[];
  partiesNeedingLeader: string[];
}

export async function deactivateMember(
  guildId: string,
  memberId: string,
): Promise<DeactivateResult> {
  const members = await getMembers(guildId, true);
  const member = members.find((m) => m.id === memberId);
  if (!member) throw new Error('공대원을 찾을 수 없습니다.');
  if (!member.isActive) throw new Error('이미 비활성 상태입니다.');
  if (member.role === 'MASTER' && masterCount(members) <= 1) {
    throw new Error(
      '마지막 관리자(마스터)는 비활성화할 수 없습니다. 다른 관리자를 먼저 임명하세요.',
    );
  }

  // is_active = false
  const { data: updated, error: updateErr } = await supabase
    .from('members')
    .update({ is_active: false })
    .eq('id', memberId)
    .select()
    .single();
  throwIfError(updateErr);

  // 공대에서 제거 + 공대장 비우기
  const parties = await getParties(guildId);
  const removedFromParties: string[] = [];
  const partiesNeedingLeader: string[] = [];

  for (const party of parties) {
    const inParty = party.memberIds.includes(memberId);
    const wasLeader = party.leaderId === memberId;
    if (!inParty && !wasLeader) continue;

    removedFromParties.push(party.name);
    if (wasLeader) partiesNeedingLeader.push(party.name);

    // party_members 에서 삭제
    await supabase
      .from('party_members')
      .delete()
      .eq('party_id', party.id)
      .eq('member_id', memberId);
    // 공대장이었으면 비우기
    if (wasLeader) {
      await supabase.from('parties').update({ leader_id: null }).eq('id', party.id);
    }
  }

  return { member: toMember(updated!), removedFromParties, partiesNeedingLeader };
}

export async function reactivateMember(guildId: string, memberId: string): Promise<Member> {
  const { data, error } = await supabase
    .from('members')
    .update({ is_active: true })
    .eq('id', memberId)
    .eq('guild_id', guildId)
    .select()
    .single();
  throwIfError(error);
  return toMember(data!);
}

