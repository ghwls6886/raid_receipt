/**
 * 데이터 레이어 — Supabase 연동 (P4)
 *
 * 화면은 오직 이 레이어를 통해 데이터를 읽는다.
 * 인터페이스·함수 시그니처는 목업 시절과 동일 → 화면 무수정.
 *
 * enum 변환: DB 대문자(DRAFT) ↔ FE 소문자(draft)
 * 컬럼명 변환: DB snake_case ↔ FE camelCase
 */
import { supabase } from '@/lib/supabase';
import { useGuildStore } from '@/stores/useGuildStore';
import { DEFAULT_COOLDOWN_HOURS } from '@/lib/bossTimer';
import { calcSettlement } from '@/lib/settlement';

// ─── 공통 헬퍼 ──────────────────────────────────────────────
function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ─── 레이드 ─────────────────────────────────────────────────
export type RaidStatus = 'draft' | 'confirmed';

export interface RaidRow {
  id: string;
  date: string;
  bossName: string;
  partyName: string | null;
  netProfit: number;
  participantCount: number;
  perPerson: number;
  status: RaidStatus;
  sent: boolean;
}

export interface DashboardStats {
  totalNetProfit: number;
  monthNetProfit: number;
  raidCount: number;
  topContributor: { name: string; raidCount: number } | null;
}

export function currentGuildId(): string {
  return useGuildStore.getState().currentGuildId;
}

export async function getRaids(guildId: string): Promise<RaidRow[]> {
  const { data, error } = await supabase
    .from('raids')
    .select('id, date, boss_name, party_name, net_profit, participant_count, per_person, status, sent')
    .eq('guild_id', guildId)
    .order('date', { ascending: false });
  throwIfError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    bossName: r.boss_name,
    partyName: r.party_name,
    netProfit: r.net_profit,
    participantCount: r.participant_count,
    perPerson: r.per_person,
    status: r.status.toLowerCase() as RaidStatus,
    sent: r.sent,
  }));
}

export async function getRaid(guildId: string, raidId: string): Promise<RaidRow | null> {
  const { data, error } = await supabase
    .from('raids')
    .select('id, date, boss_name, party_name, net_profit, participant_count, per_person, status, sent')
    .eq('guild_id', guildId)
    .eq('id', raidId)
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  return {
    id: data.id,
    date: data.date,
    bossName: data.boss_name,
    partyName: data.party_name,
    netProfit: data.net_profit,
    participantCount: data.participant_count,
    perPerson: data.per_person,
    status: data.status.toLowerCase() as RaidStatus,
    sent: data.sent,
  };
}

export async function getDashboardStats(guildId: string): Promise<DashboardStats> {
  const rows = await getRaids(guildId);
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const totalNetProfit = confirmed.reduce((sum, r) => sum + r.netProfit, 0);

  const latestMonth = rows.reduce((max, r) => (r.date > max ? r.date : max), '').slice(0, 7);
  const monthNetProfit = confirmed
    .filter((r) => r.date.startsWith(latestMonth))
    .reduce((sum, r) => sum + r.netProfit, 0);

  // topContributor: 참여 횟수가 가장 많은 길드원
  let topContributor: DashboardStats['topContributor'] = null;
  try {
    const stats = await getMemberStats(guildId);
    const top = stats[0];
    if (top) {
      topContributor = { name: top.nickname, raidCount: top.raidCount };
    }
  } catch {
    // 집계 실패 시 null 유지
  }

  return {
    totalNetProfit,
    monthNetProfit,
    raidCount: confirmed.length,
    topContributor,
  };
}

// ─── 길드원 ─────────────────────────────────────────────────
export type MemberRole = 'MASTER' | 'MANAGER' | 'MEMBER';

export const ROLE_LABEL: Record<MemberRole, string> = {
  MASTER: '마스터',
  MANAGER: '부마스터',
  MEMBER: '길드원',
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
  let query = supabase
    .from('members')
    .select('*')
    .eq('guild_id', guildId);
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
  if (!member) throw new Error('길드원을 찾을 수 없습니다.');
  if (!member.isActive) throw new Error('이미 비활성 상태입니다.');
  if (member.role === 'MASTER' && masterCount(members) <= 1) {
    throw new Error('마지막 관리자(마스터)는 비활성화할 수 없습니다. 다른 관리자를 먼저 임명하세요.');
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
    await supabase.from('party_members').delete().eq('party_id', party.id).eq('member_id', memberId);
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

// ─── 보스 마스터 ────────────────────────────────────────────
export const DEFAULT_PHASE_COUNT = 3;
export const MAX_PHASE_COUNT = 20;

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
  if (hours > MAX_COOLDOWN_HOURS) return `쿨타임은 ${MAX_COOLDOWN_HOURS}시간(30일) 이하여야 합니다.`;
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
  const { data, error } = await supabase
    .from('game_servers')
    .select('id, name')
    .order('name');
  throwIfError(error);
  return data ?? [];
}

export async function addServer(_name: string): Promise<GameServer> {
  throw new Error('서버 추가는 시스템 관리자 전용입니다.');
}

export async function deleteServer(_id: string): Promise<void> {
  throw new Error('서버 삭제는 시스템 관리자 전용입니다.');
}

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

// ─── 레이드 상세 ────────────────────────────────────────────
export interface RaidDrop {
  name: string;
  salePrice: number;
  feePct: number;
}

export type ExpenseCategory = 'consumable' | 'entry' | 'etc';
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['consumable', 'entry', 'etc'];
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  consumable: '소모품',
  entry: '입장료',
  etc: '기타',
};
export const EXPENSE_CATEGORY_PLACEHOLDER: Record<ExpenseCategory, string> = {
  consumable: '예: 엘릭서 100개',
  entry: '예: 입장권 6장',
  etc: '예: 물약 셔틀 수고비',
};

export interface RaidExpense {
  category: ExpenseCategory;
  name: string;
  cost: number;
}

export interface RaidParticipant {
  memberId: string | null;
  guestName: string | null;
  penaltyTypeIds: string[];
  exitPhase: number | null;
}

export type RemainderPolicy = 'leader' | 'fund' | 'first';
export const REMAINDER_POLICY_LABEL: Record<RemainderPolicy, string> = {
  leader: '공대장 몫',
  fund: '기금 적립',
  first: '첫 참여자',
};
export const REMAINDER_POLICIES: RemainderPolicy[] = ['fund', 'leader', 'first'];

export interface RaidDetail {
  id: string;
  guildId: string;
  bossName: string;
  partyName: string | null;
  ppojiPct: number;
  remainderPolicy: RemainderPolicy;
  phaseCount: number;
  drops: RaidDrop[];
  expenses: RaidExpense[];
  participants: RaidParticipant[];
}

export function isRaidEditable(raid: RaidRow): boolean {
  return raid.status === 'draft' || !raid.sent;
}

export async function getRaidDetail(raidId: string): Promise<RaidDetail | null> {
  const { data: raid, error } = await supabase
    .from('raids')
    .select('*')
    .eq('id', raidId)
    .maybeSingle();
  throwIfError(error);
  if (!raid) return null;

  const [dropsRes, expensesRes, participantsRes] = await Promise.all([
    supabase.from('raid_drops').select('*').eq('raid_id', raidId).order('sort_order'),
    supabase.from('raid_expenses').select('*').eq('raid_id', raidId).order('sort_order'),
    supabase
      .from('raid_participants')
      .select('*, raid_participant_penalties(penalty_type_id)')
      .eq('raid_id', raidId)
      .order('sort_order'),
  ]);

  return {
    id: raid.id,
    guildId: raid.guild_id,
    bossName: raid.boss_name,
    partyName: raid.party_name,
    ppojiPct: raid.ppoji_pct,
    remainderPolicy: raid.remainder_policy.toLowerCase() as RemainderPolicy,
    phaseCount: raid.phase_count,
    drops: (dropsRes.data ?? []).map((d) => ({
      name: d.name,
      salePrice: d.sale_price,
      feePct: d.fee_pct,
    })),
    expenses: (expensesRes.data ?? []).map((e) => ({
      category: e.category.toLowerCase() as ExpenseCategory,
      name: e.name,
      cost: e.cost,
    })),
    participants: (participantsRes.data ?? []).map((p) => ({
      memberId: p.member_id,
      guestName: p.guest_name,
      penaltyTypeIds: (
        p.raid_participant_penalties as { penalty_type_id: string | null }[]
      )
        .map((pp) => pp.penalty_type_id)
        .filter((id): id is string => id !== null),
      exitPhase: p.exit_phase,
    })),
  };
}

export interface RaidInput {
  id?: string;
  bossName: string;
  partyName: string | null;
  ppojiPct: number;
  remainderPolicy: RemainderPolicy;
  phaseCount: number;
  drops: RaidDrop[];
  expenses: RaidExpense[];
  participants: RaidParticipant[];
  netProfit: number;
  participantCount: number;
  perPerson: number;
  status: RaidStatus;
}

/**
 * 레이드 저장 (draft 또는 confirmed).
 * 1) FE 에서 정산 재계산 → save_raid RPC (SECURITY DEFINER) 로 트랜잭션 저장
 * 2) status='confirmed' 이면 confirm_settlement RPC → 디스코드 발송
 */
export async function saveRaid(guildId: string, input: RaidInput): Promise<RaidRow> {
  // ── 1) 패널티 타입 조회 (스냅샷용) ──
  const penaltyTypeIds = new Set(input.participants.flatMap((p) => p.penaltyTypeIds));
  const penaltyTypeMap: Map<string, { name: string; calc_type: string; value: number }> = new Map();
  if (penaltyTypeIds.size > 0) {
    const { data: ptRows } = await supabase
      .from('penalty_types')
      .select('id, name, calc_type, value')
      .in('id', [...penaltyTypeIds]);
    for (const pt of ptRows ?? []) {
      penaltyTypeMap.set(pt.id, { name: pt.name, calc_type: pt.calc_type, value: pt.value });
    }
  }

  // ── 2) 정산 재계산 ──
  const expenseTotal = input.expenses.reduce((sum, e) => sum + e.cost, 0);
  const settlement = calcSettlement({
    drops: input.drops.map((d) => ({ salePrice: d.salePrice, feePct: d.feePct })),
    expenseTotal,
    participants: input.participants.map((p) => ({
      id: p.memberId ?? p.guestName ?? '',
      penalties: p.penaltyTypeIds
        .map((id) => penaltyTypeMap.get(id))
        .filter((pt): pt is { name: string; calc_type: string; value: number } => pt != null)
        .map((pt) => ({
          calcType: pt.calc_type.toLowerCase() as 'percent' | 'fixed',
          value: pt.value,
        })),
      exitPhase: p.exitPhase,
    })),
    ppojiRate: (input.ppojiPct || 0) / 100,
  });

  // ── 3) save_raid RPC 호출 (SECURITY DEFINER — OWNER/ADMIN 전용) ──
  const rpcInput = {
    id: input.id ?? null,
    guild_id: guildId,
    boss_name: input.bossName,
    party_name: input.partyName,
    ppoji_pct: input.ppojiPct,
    remainder_policy: input.remainderPolicy.toUpperCase(),
    phase_count: input.phaseCount,
    fee_total: settlement.feeTotal,
    total_sales: settlement.totalSales,
    expense_total: settlement.expenseTotal,
    net_profit: settlement.netProfit,
    leader_ppoji: settlement.leaderPpoji,
    leftover: settlement.leftover,
    participant_count: settlement.participantCount,
    per_person: settlement.basePerPerson,
    drops: input.drops.map((d) => ({
      name: d.name,
      sale_price: d.salePrice,
      fee_pct: d.feePct,
    })),
    expenses: input.expenses.map((e) => ({
      category: e.category.toUpperCase(),
      name: e.name,
      cost: e.cost,
    })),
    participants: input.participants.map((p, i) => {
      const sr = settlement.participants[i];
      return {
        member_id: p.memberId,
        guest_name: p.guestName,
        exit_phase: p.exitPhase,
        base: sr?.base ?? 0,
        penalty: sr?.penalty ?? 0,
        redistributed: sr?.redistributed ?? 0,
        final_amount: sr?.final ?? 0,
        forfeited: sr?.forfeited ?? false,
        penalties: p.penaltyTypeIds
          .map((ptId) => {
            const pt = penaltyTypeMap.get(ptId);
            if (!pt) return null;
            return {
              penalty_type_id: ptId,
              name: pt.name,
              calc_type: pt.calc_type.toUpperCase(),
              value: pt.value,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r != null),
      };
    }),
  };

  const { data: raidRow, error: saveErr } = await supabase.rpc('save_raid', {
    p_input: rpcInput,
  });
  if (saveErr) throw new Error(saveErr.message);

  const raidId: string = (raidRow as unknown as { id: string }).id;

  // ── 4) 확정 요청이면 confirm_settlement RPC → 디스코드 발송 ──
  if (input.status === 'confirmed') {
    const { error } = await supabase.rpc('confirm_settlement', { p_raid_id: raidId });
    if (error) throw new Error(error.message);

    // 디스코드 영수증 발송 (실패해도 확정은 유지 — sent=false 로 남음)
    try {
      await supabase.functions.invoke('discord-send', {
        body: { guildId, raidId },
      });
    } catch {
      // 발송 실패는 무시 — 웹훅 미설정이거나 네트워크 오류
    }
  }

  // ── 5) 저장된 레이드 반환 ──
  const saved = await getRaid(guildId, raidId);
  if (!saved) throw new Error('저장 후 레이드를 찾을 수 없습니다.');
  return saved;
}

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

// ─── 보스 입장 기록 ─────────────────────────────────────────
export interface BossEntry {
  id: string;
  guildId: string;
  partyId: string;
  bossId: string;
  bossName: string;
  enteredAt: string;
}

export async function getBossEntries(guildId: string): Promise<BossEntry[]> {
  // (party_id, boss_id) 별 최신 1건 — distinct on 으로 처리
  const { data, error } = await supabase
    .from('boss_entries')
    .select('*')
    .eq('guild_id', guildId)
    .order('party_id')
    .order('boss_id')
    .order('entered_at', { ascending: false });
  throwIfError(error);

  // 클라이언트에서 (party_id, boss_id) 별 최신 1건 필터
  const rows = data ?? [];
  const latest = new Map<string, (typeof rows)[0]>();
  for (const entry of rows) {
    const key = `${entry.party_id}:${entry.boss_id}`;
    if (!latest.has(key)) latest.set(key, entry);
  }

  return [...latest.values()].map((e) => ({
    id: e.id,
    guildId: e.guild_id,
    partyId: e.party_id,
    bossId: e.boss_id ?? '',
    bossName: e.boss_name,
    enteredAt: e.entered_at,
  }));
}

export async function recordBossEntry(
  guildId: string,
  partyId: string,
  bossId: string,
): Promise<BossEntry> {
  const bosses = await getBosses();
  const boss = bosses.find((b) => b.id === bossId);
  if (!boss) throw new Error('보스를 찾을 수 없습니다.');

  const { data, error } = await supabase
    .from('boss_entries')
    .insert({
      guild_id: guildId,
      party_id: partyId,
      boss_id: bossId,
      boss_name: boss.name,
    })
    .select()
    .single();
  throwIfError(error);

  return {
    id: data!.id,
    guildId: data!.guild_id,
    partyId: data!.party_id,
    bossId: data!.boss_id ?? '',
    bossName: data!.boss_name,
    enteredAt: data!.entered_at,
  };
}

export async function updateBossEntry(
  _guildId: string,
  entryId: string,
  enteredAt: string,
): Promise<BossEntry> {
  const ms = new Date(enteredAt).getTime();
  if (Number.isNaN(ms)) throw new Error('시각 형식이 올바르지 않습니다.');
  if (ms > Date.now()) throw new Error('입장 시각은 미래일 수 없습니다.');

  const { data, error } = await supabase
    .from('boss_entries')
    .update({ entered_at: new Date(ms).toISOString() })
    .eq('id', entryId)
    .select()
    .single();
  throwIfError(error);

  return {
    id: data!.id,
    guildId: data!.guild_id,
    partyId: data!.party_id,
    bossId: data!.boss_id ?? '',
    bossName: data!.boss_name,
    enteredAt: data!.entered_at,
  };
}

export async function deleteBossEntry(_guildId: string, entryId: string): Promise<void> {
  const { error } = await supabase.from('boss_entries').delete().eq('id', entryId);
  throwIfError(error);
}

// ─── HTTP 에러 로그 ─────────────────────────────────────────
export interface ErrorLog {
  id: string;
  at: string;
  method: string;
  path: string;
  status: number;
  message: string;
}

export async function getErrorLogs(): Promise<ErrorLog[]> {
  const { data, error } = await supabase
    .from('error_logs')
    .select('*')
    .order('at', { ascending: false })
    .limit(100);
  throwIfError(error);
  return (data ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    method: e.method,
    path: e.path,
    status: e.status,
    message: e.message,
  }));
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
  const { error } = await supabase
    .from('penalty_types')
    .update({ is_active: false })
    .eq('id', id);
  throwIfError(error);
}

// ─── 대시보드 집계 ──────────────────────────────────────────
export interface BossAverage {
  bossName: string;
  avgPerPerson: number;
  raidCount: number;
}

/** P7 에서 view/RPC 집계로 교체 예정 — 지금은 클라이언트 집계 */
export async function getBossAverages(guildId: string): Promise<BossAverage[]> {
  const rows = await getRaids(guildId);
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of confirmed) {
    const cur = map.get(r.bossName) ?? { sum: 0, count: 0 };
    cur.sum += r.perPerson;
    cur.count += 1;
    map.set(r.bossName, cur);
  }
  return [...map.entries()]
    .map(([bossName, v]) => ({
      bossName,
      avgPerPerson: Math.round(v.sum / v.count),
      raidCount: v.count,
    }))
    .sort((a, b) => b.avgPerPerson - a.avgPerPerson);
}

export interface MemberStat {
  memberId: string;
  nickname: string;
  job: string;
  raidCount: number;
  totalReceived: number;
}

/** P7 에서 view/RPC 집계로 교체 예정 — 지금은 클라이언트 집계 */
export async function getMemberStats(guildId: string): Promise<MemberStat[]> {
  const { data, error } = await supabase
    .from('raid_participants')
    .select('member_id, final_amount, members(nickname, job)')
    .not('member_id', 'is', null)
    .in(
      'raid_id',
      (
        await supabase
          .from('raids')
          .select('id')
          .eq('guild_id', guildId)
          .eq('status', 'CONFIRMED')
      ).data?.map((r) => r.id) ?? [],
    );
  throwIfError(error);

  const map = new Map<string, MemberStat>();
  for (const p of data ?? []) {
    if (!p.member_id) continue;
    const m = p.members as unknown as { nickname: string; job: string } | null;
    const existing = map.get(p.member_id) ?? {
      memberId: p.member_id,
      nickname: m?.nickname ?? '알수없음',
      job: m?.job ?? '',
      raidCount: 0,
      totalReceived: 0,
    };
    existing.raidCount += 1;
    existing.totalReceived += p.final_amount;
    map.set(p.member_id, existing);
  }

  return [...map.values()].sort((a, b) => b.raidCount - a.raidCount);
}

// ─── 길드 초대 ──────────────────────────────────────────────
export interface Invite {
  code: string;
  guildId: string;
  role: AccountRole;
}

function genInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return `MW-${s}`;
}

export async function createInvite(guildId: string, role: AccountRole): Promise<Invite> {
  const code = genInviteCode();
  const { data, error } = await supabase.rpc('create_invite', {
    p_guild_id: guildId,
    p_role: role,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  return {
    code: (data as unknown as { code: string }).code,
    guildId,
    role,
  };
}

/** 초대 코드 확인 — redeem_invite RPC 로 처리 (OnboardingPage 에서 직접 호출) */
export async function redeemInvite(code: string): Promise<Invite | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from('invites')
    .select('code, guild_id, role')
    .eq('code', normalized)
    .is('used_by', null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    code: data.code,
    guildId: data.guild_id,
    role: data.role as AccountRole,
  };
}

// ─── audit (변경 이력) ──────────────────────────────────────
export interface AuditLog {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  detail: string;
}

export async function getAuditLogs(guildId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, created_at, actor, action, detail')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(100);
  throwIfError(error);
  return (data ?? []).map((l) => ({
    id: l.id,
    at: l.created_at,
    actor: l.actor,
    action: l.action,
    detail: l.detail,
  }));
}

/** audit_logs INSERT — RPC 에서도 기록하지만 FE 직접 기록 지점용 */
export async function logAudit(guildId: string, action: string, detail: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  await supabase.from('audit_logs').insert({
    guild_id: guildId,
    actor: user?.email ?? null,
    action,
    detail,
  });
}

// ─── 길드 계정 권한 ─────────────────────────────────────────
export type AccountRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = {
  OWNER: '관리자',
  ADMIN: '부관리자',
  MEMBER: '멤버',
};

export interface GuildAccount {
  id: string;
  guildId: string;
  email: string;
  name: string;
  role: AccountRole;
}

export async function getAccounts(guildId: string): Promise<GuildAccount[]> {
  const { data, error } = await supabase
    .from('guild_accounts')
    .select('id, guild_id, email, name, role')
    .eq('guild_id', guildId);
  throwIfError(error);
  return (data ?? []).map((a) => ({
    id: a.id,
    guildId: a.guild_id,
    email: a.email,
    name: a.name,
    role: a.role as AccountRole,
  }));
}

export async function updateAccountRole(
  _guildId: string,
  accountId: string,
  role: AccountRole,
): Promise<GuildAccount> {
  const { data, error } = await supabase.rpc('update_account_role', {
    p_account_id: accountId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    guildId: data.guild_id,
    email: data.email,
    name: data.name,
    role: data.role as AccountRole,
  };
}

export async function removeAccount(_guildId: string, accountId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_account', { p_account_id: accountId });
  if (error) throw new Error(error.message);
}
