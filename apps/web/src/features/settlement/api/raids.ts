/**
 * 레이드 — 목록 · 상세 · 저장 · 권한
 */
import { supabase, throwIfError } from '@/lib/supabase';
import type { AccountRole } from '@/lib/account';
import { calcSettlement } from '../settlement';

/** 레이드 페이즈 수 기본값 · 상한 */
export const DEFAULT_PHASE_COUNT = 3;
export const MAX_PHASE_COUNT = 20;
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
  /** 마지막 발송이 성공했는지. 재발송이 가능하므로 "보낸 적 있음"과는 다르다 */
  sent: boolean;
  /** 마지막 발송 성공 시각 (ISO). 한 번도 못 보냈으면 null */
  sentAt: string | null;
  /** 누적 발송 횟수 (재발송 포함). 0011 이전 발송 건은 1 로 백필됐다 */
  sendCount: number;
  /** 작성자 계정 id. 0009 이전 레이드는 null(주인 없음) */
  createdBy: string | null;
  /** 작성 시점 이름 스냅샷 — 계정이 삭제돼도 남는다 */
  createdByName: string | null;
}

export async function getRaids(guildId: string): Promise<RaidRow[]> {
  const { data, error } = await supabase
    .from('raids')
    .select(
      'id, date, boss_name, party_name, net_profit, participant_count, per_person, status, sent, sent_at, send_count, created_by, created_by_name',
    )
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
    sentAt: r.sent_at,
    sendCount: r.send_count,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
  }));
}

export async function getRaid(guildId: string, raidId: string): Promise<RaidRow | null> {
  const { data, error } = await supabase
    .from('raids')
    .select(
      'id, date, boss_name, party_name, net_profit, participant_count, per_person, status, sent, sent_at, send_count, created_by, created_by_name',
    )
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
    sentAt: data.sent_at,
    sendCount: data.send_count,
    createdBy: data.created_by,
    createdByName: data.created_by_name,
  };
}

// ─── 레이드 상세 ────────────────────────────────────────────
export interface RaidDrop {
  name: string;
  salePrice: number;
  feePct: number;
  /**
   * 이 아이템을 판 사람. 참여자와 같은 방식으로 가리킨다 (길드원 id 또는 용병 이름).
   * raid_participants 를 참조하지 않는 이유는 save_raid 가 저장할 때마다 참여자 행을
   * 지우고 다시 넣어 id 가 매번 바뀌기 때문이다 (0011 주석).
   */
  sellerMemberId: string | null;
  sellerGuestName: string | null;
  /** 판매 인센티브 % (0~100). 이 행의 실수익(판매가 - 수수료) 기준 */
  incentivePct: number;
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
  /** 이 참여자에게 붙은 역할 지원금 유형 (여러 개 가능, 금액은 합산) */
  subsidyTypeIds: string[];
  exitPhase: number | null;
  /** 공대장 — 인센티브를 받는 사람. 공대당 한 명 */
  isLeader?: boolean;
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

/**
 * 수정 가능 여부 — 임시저장 건만.
 *
 * 확정은 되돌릴 수 없는 최종 상태다. save_raid 가 0005 부터 CONFIRMED 를 무조건
 * 거부해 왔는데, 여기서만 "확정이어도 미발송이면 수정 가능" 으로 판정하는 바람에
 * 편집 화면이 열리고 저장은 400 으로 튕기는 상태였다. 서버 규칙에 맞춘다.
 *
 * 발송은 확정과 별개 축이다. 미발송 확정 건은 고쳐서 다시 보내는 게 아니라
 * 그대로 다시 보내야 한다 (sent 는 마지막 발송 성공 여부일 뿐이다).
 */
export function isRaidEditable(raid: RaidRow): boolean {
  return raid.status === 'draft';
}

/**
 * 정산 소유권 — 0009 save_raid/delete_raid 의 규칙과 같은 판정.
 * 서버가 다시 검사하므로 이건 버튼을 잠그고 이유를 보여주기 위한 것이다.
 *
 * 작성자 본인 또는 관리자만 수정할 수 있다. createdBy 가 null 인 건 0009 이전에
 * 만들어진 레이드로, 주인을 알 수 없어 종전처럼 공대원 누구나 손댈 수 있게 둔다.
 */
export function isRaidMine(raid: RaidRow, userId: string | null, role: AccountRole): boolean {
  if (raid.createdBy === null) return true;
  if (role !== 'MEMBER') return true;
  return raid.createdBy === userId;
}

/** 수정 버튼 노출 조건 — 상태(확정·발송)와 소유권을 모두 만족해야 한다 */
export function canEditRaid(raid: RaidRow, userId: string | null, role: AccountRole): boolean {
  return isRaidEditable(raid) && isRaidMine(raid, userId, role);
}

/**
 * 삭제 버튼 노출 조건 — 0009 delete_raid 규칙에 화면 정책 하나를 더 얹은 것.
 *
 * 서버는 확정 건도 지울 수 있게 열어 두지만, 확정은 이미 디스코드로 영수증이 나간
 * 회계 기록이라 화면에서는 임시저장 건만 지울 수 있게 한다.
 *
 * 소유권은 수정(isRaidMine)보다 엄격하다. createdBy 가 null 인 0009 이전 건은
 * 주인을 알 수 없는데 삭제는 되돌릴 수 없어서, 관리자만 지울 수 있다.
 */
export function canDeleteRaid(raid: RaidRow, userId: string | null, role: AccountRole): boolean {
  if (raid.status !== 'draft') return false;
  if (role !== 'MEMBER') return true;
  return raid.createdBy !== null && raid.createdBy === userId;
}

/**
 * 디스코드 영수증 발송 — 확정 직후와 재발송이 같은 경로를 쓴다.
 *
 * Edge Function 은 실패해도 HTTP 200 + `{ok:false}` 로 돌아오는 경우가 있어
 * (웹훅 URL 미설정, 디스코드 4xx) invoke 의 error 만 보면 실패를 놓친다.
 * 본문의 ok 까지 확인해야 "보냈다고 했는데 안 온" 상황을 잡을 수 있다.
 */
// 필드를 본문에 선언한다 — 생성자 파라미터 프로퍼티는 erasableSyntaxOnly 에서 막힌다.
export class ReceiptSendError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ReceiptSendError';
    this.code = code;
  }
}

/**
 * 웹훅 미설정만 "설정하러 갈까요?" 로 안내한다.
 * 디스코드 4xx·권한 부족은 사용자가 할 수 있는 조치가 달라 같이 묶으면 안 된다.
 */
export function isWebhookMissingError(e: unknown): boolean {
  return e instanceof ReceiptSendError && e.code === 'WEBHOOK_MISSING';
}

interface ReceiptResponse {
  ok?: boolean;
  code?: string;
  error?: string;
}

/**
 * 비-2xx 응답의 본문을 꺼낸다.
 *
 * functions.invoke 는 응답이 2xx 가 아니면 data 를 null 로 두고 FunctionsHttpError 를
 * 준다(FunctionsClient `if (!response.ok) throw new FunctionsHttpError(response)`).
 * 그래서 웹훅 미설정(404)의 code 는 data 가 아니라 error.context 에 들어 있다.
 * data.code 만 보면 영원히 잡히지 않는다.
 */
async function readErrorBody(error: unknown): Promise<ReceiptResponse | null> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    return (await context.clone().json()) as ReceiptResponse;
  } catch {
    // 함수까지 못 갔거나(게이트웨이 오류) 본문이 JSON 이 아닌 경우
    return null;
  }
}

async function sendReceipt(guildId: string, raidId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<ReceiptResponse>('discord-send', {
    body: { guildId, raidId },
  });

  if (error) {
    const body = await readErrorBody(error);
    throw new ReceiptSendError(body?.error ?? error.message, body?.code);
  }
  if (!data?.ok) {
    throw new ReceiptSendError(data?.error ?? '디스코드가 요청을 거절했습니다.', data?.code);
  }
}

/**
 * 확정 건 영수증 재발송 — 정산 내용은 건드리지 않고 메시지만 다시 보낸다.
 *
 * 확정은 수정할 수 없으므로(save_raid 가 거부) 잘못 나간 발송을 고치는 유일한 수단이
 * 재발송이다. 디스코드 메시지를 지웠거나 웹훅을 다른 채널로 바꾼 경우에도 쓴다.
 * 권한은 Edge Function 이 길드 소속 여부로 판정한다.
 */
export async function resendReceipt(guildId: string, raidId: string): Promise<void> {
  await sendReceipt(guildId, raidId);
}

/** 레이드 삭제 — 하위 행(드랍·지출·참여자)은 on delete cascade 로 같이 지워진다 */
export async function deleteRaid(raidId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_raid', { p_raid_id: raidId });
  if (error) throw new Error(error.message);
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
      .select(
        '*, raid_participant_penalties(penalty_type_id), raid_participant_subsidies(subsidy_type_id)',
      )
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
      sellerMemberId: d.seller_member_id,
      sellerGuestName: d.seller_guest_name,
      incentivePct: d.incentive_pct,
    })),
    expenses: (expensesRes.data ?? []).map((e) => ({
      category: e.category.toLowerCase() as ExpenseCategory,
      name: e.name,
      cost: e.cost,
    })),
    participants: (participantsRes.data ?? []).map((p) => ({
      memberId: p.member_id,
      guestName: p.guest_name,
      penaltyTypeIds: (p.raid_participant_penalties as { penalty_type_id: string | null }[])
        .map((pp) => pp.penalty_type_id)
        .filter((id): id is string => id !== null),
      // 유형이 삭제됐으면(subsidy_type_id = null) 칩으로 되살릴 수 없으므로 제외한다.
      // 확정 건은 raid_participant_subsidies 의 name/amount 스냅샷이 영수증을 지킨다.
      subsidyTypeIds: (p.raid_participant_subsidies as { subsidy_type_id: string | null }[])
        .map((ps) => ps.subsidy_type_id)
        .filter((id): id is string => id !== null),
      exitPhase: p.exit_phase,
      isLeader: p.is_leader ?? false,
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
/** save_raid 가 확정된 레이드를 거부할 때의 메시지 (0005 이후 문구 고정) */
const CONFIRMED_RAID_MESSAGE = 'confirmed raid cannot be modified';

/**
 * 이미 확정된 레이드라 저장이 거부됐는지.
 *
 * 편집 화면이 열린 채로 레이드가 확정되면 자동저장이 계속 같은 400 을 맞는다.
 * 호출부가 이걸 보고 자동저장을 아예 멈춰야 한다 — 재시도해도 영원히 성공하지 않는다.
 * P0001 은 save_raid 의 RAISE EXCEPTION 네 개가 공유하므로 코드로는 구분할 수 없고,
 * 메시지가 유일한 판별 수단이다.
 */
export function isConfirmedRaidError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(CONFIRMED_RAID_MESSAGE);
}

export async function saveRaid(guildId: string, input: RaidInput): Promise<RaidRow> {
  // ── 1) 패널티 타입 조회 (스냅샷용) ──
  const penaltyTypeIds = new Set(input.participants.flatMap((p) => p.penaltyTypeIds));
  const penaltyTypeMap: Map<string, { name: string; calc_type: string; value: number }> = new Map();
  if (penaltyTypeIds.size > 0) {
    const { data: ptRows, error: ptError } = await supabase
      .from('penalty_types')
      .select('id, name, calc_type, value')
      .in('id', [...penaltyTypeIds]);
    // 조회가 실패하면 penaltyTypeMap 이 빈 채로 남아 패널티가 전부 누락된 상태로 계산된다.
    // 분배금이 틀린 레이드가 조용히 저장·발송되므로 여기서 반드시 중단해야 한다.
    throwIfError(ptError);

    for (const pt of ptRows ?? []) {
      penaltyTypeMap.set(pt.id, { name: pt.name, calc_type: pt.calc_type, value: pt.value });
    }

    // 요청한 패널티 유형이 하나라도 사라졌다면(삭제·권한) 마찬가지로 금액이 틀어진다
    const missing = [...penaltyTypeIds].filter((id) => !penaltyTypeMap.has(id));
    if (missing.length > 0) {
      throw new Error(
        '적용된 패널티 유형을 찾을 수 없습니다. 길드 설정에서 패널티 정책을 확인해 주세요.',
      );
    }
  }

  // ── 1-b) 지원금 유형 조회 (스냅샷용) ──
  // 패널티와 같은 이유로 실패·누락 시 반드시 중단한다. 지원금이 빠진 채 계산되면
  // n빵 대상액이 커져 전원의 분배금이 틀린 영수증이 조용히 발송된다.
  const subsidyTypeIds = new Set(input.participants.flatMap((p) => p.subsidyTypeIds));
  // penaltyTypeMap 과 같은 규칙 — DB 원본(대문자)을 그대로 담고 쓰는 쪽에서 변환한다
  const subsidyTypeMap: Map<string, { name: string; calc_type: string; amount: number }> =
    new Map();

  if (subsidyTypeIds.size > 0) {
    const { data: stRows, error: stError } = await supabase
      .from('subsidy_types')
      .select('id, name, calc_type, amount')
      .in('id', [...subsidyTypeIds]);
    throwIfError(stError);

    for (const st of stRows ?? []) {
      subsidyTypeMap.set(st.id, {
        name: st.name,
        calc_type: st.calc_type,
        amount: st.amount,
      });
    }

    const missing = [...subsidyTypeIds].filter((id) => !subsidyTypeMap.has(id));
    if (missing.length > 0) {
      throw new Error(
        '적용된 지원금 유형을 찾을 수 없습니다. 길드 설정에서 지원금 정책을 확인해 주세요.',
      );
    }
  }

  // ── 2) 정산 재계산 ──
  const expenseTotal = input.expenses.reduce((sum, e) => sum + e.cost, 0);
  const settlement = calcSettlement({
    drops: input.drops.map((d) => ({
      salePrice: d.salePrice,
      feePct: d.feePct,
      // 참여자 id 와 같은 규칙으로 맞춘다 (아래 participants[].id 참고).
      // 명단에 없는 판매자는 settlement.ts 가 알아서 무시한다.
      sellerId: d.sellerMemberId ?? d.sellerGuestName ?? null,
      incentivePct: d.incentivePct,
    })),
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
      subsidies: p.subsidyTypeIds
        .map((id) => subsidyTypeMap.get(id))
        .filter((st): st is NonNullable<typeof st> => st != null)
        .map((st) => ({
          calcType: st.calc_type.toLowerCase() as 'percent' | 'fixed',
          value: st.amount,
        })),
      exitPhase: p.exitPhase,
      isLeader: p.isLeader ?? false,
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
    sale_incentive_total: settlement.saleIncentiveTotal,
    leader_ppoji: settlement.leaderPpoji,
    subsidy_total: settlement.subsidyTotal,
    leftover: settlement.leftover,
    participant_count: settlement.participantCount,
    // 목록의 "1인당" 열이 작성 화면 헤드라인과 같은 값이어야 한다 (settlement.ts 참고)
    per_person: settlement.representativePerPerson,
    drops: input.drops.map((d, i) => ({
      name: d.name,
      sale_price: d.salePrice,
      fee_pct: d.feePct,
      seller_member_id: d.sellerMemberId,
      seller_guest_name: d.sellerGuestName,
      incentive_pct: d.incentivePct,
      // %가 아니라 계산 결과를 남긴다. 비례 축소가 걸리면 %로 다시 계산한 값과
      // 실제 지급액이 어긋나서, 나중에 영수증을 재현할 때 합계가 안 맞는다.
      incentive_amount: settlement.dropSaleIncentives[i] ?? 0,
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
        subsidy: sr?.subsidy ?? 0,
        penalty: sr?.penalty ?? 0,
        redistributed: sr?.redistributed ?? 0,
        incentive: sr?.incentive ?? 0,
        sale_incentive: sr?.saleIncentive ?? 0,
        leftover_share: sr?.leftoverShare ?? 0,
        is_leader: p.isLeader ?? false,
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
        // 유형 등록 금액을 그대로 스냅샷한다. 비례 축소·몰수로 실제 지급액이
        // 달라지는 것은 participants.subsidy(정산 결과)가 들고 있다.
        subsidies: p.subsidyTypeIds
          .map((stId) => {
            const st = subsidyTypeMap.get(stId);
            if (!st) return null;
            // amount 는 "이번 레이드에서 실제 계산된 메소", value 는 "그때의 규칙 값".
            // percent 는 settlement.ts 와 같은 식(순수익 기준)으로 다시 계산한다.
            const amount =
              st.calc_type === 'PERCENT'
                ? Math.floor((Math.max(0, settlement.netProfit) * st.amount) / 100)
                : st.amount;
            return {
              subsidy_type_id: stId,
              name: st.name,
              amount,
              calc_type: st.calc_type,
              value: st.amount,
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

    // 발송 실패로 확정을 되돌리지는 않는다. 확정은 회계 사실이고 발송은 전달 수단이라
    // 축이 다르다. 대신 삼키지 않는다 — 호출부가 반환된 raid.sent 로 실패를 알 수 있고,
    // 실패한 건은 목록에서 재발송할 수 있다.
    try {
      await sendReceipt(guildId, raidId);
    } catch {
      // sent=false 로 남으므로 아래 5)에서 읽히고, 호출부가 안내를 띄운다
    }
  }

  // ── 5) 저장된 레이드 반환 ──
  const saved = await getRaid(guildId, raidId);
  if (!saved) throw new Error('저장 후 레이드를 찾을 수 없습니다.');
  return saved;
}

