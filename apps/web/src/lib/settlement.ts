/**
 * 정산 계산 (명세서 §3) — 순수 함수. UI/DB 의존 없음 → 단위 테스트 붙이기 좋음.
 *
 *   실수익      = Σ(판매가 - 판매가 × 수수료%)   ← 경매장 수수료 등
 *   순수익      = 실수익 - 공대경비
 *   공대장 뽀찌  = 순수익 × 뽀찌%              (순수익이 양수일 때만)
 *   기본 1인당   = (순수익 - 뽀찌) / 참여인원
 *
 * 용병도 n빵을 치므로 별도 비용 항목이 아니라 참여자로 들어온다. 소모품·입장료 등
 * "쓴 돈"은 공대 경비(expenseTotal) 하나로 합쳐 순수익에서 차감한다.
 *
 * 패널티는 참여자당 여러 개가 붙을 수 있고(예: 2페 이탈 + 지각) 금액은 합산된다.
 * 재분배 자격은 오직 "이탈 페이즈"로만 판정하므로, 벌금 유형이 몇 개든 규칙은 한 줄이다:
 * **그 사람이 낸 벌금 합계는 그 사람보다 오래 남은 사람들이 나눠 갖는다.**
 *
 * 패널티 재분배(§9)는 "이탈 페이즈 계단식"이다. 기여 구간이 겹치는 사람끼리만
 * 벌금을 주고받는다:
 *
 *   - 몰수 대상자(차감 후 기본 몫이 0)는 남의 벌금을 받지 않는다. 노쇼로 100% 몰수당한
 *     사람이 다른 사람 지각비를 나눠 받아 결국 플러스가 되는 걸 막는다.
 *     (본인이 낸 몰수액은 당연히 다른 사람들에게 재분배된다.)
 *   - 중간 이탈자의 패널티 → 그보다 오래 남은 사람에게만 분배.
 *     (2페에서 죽은 사람은 3페에서 죽은 사람의 벌금을 가져갈 수 없다.
 *      같은 페이즈에서 이탈한 사람끼리도 서로 가져갈 수 없다.)
 *   - 완주자의 패널티 → 지각·실수 등 페이즈와 무관한 사유이므로 본인 제외 전원.
 *   - 수령자가 아무도 없으면 leftover 로 흘려 잔돈 정책(길드 기금/공대장/이월)에 맡긴다.
 *
 * 메소는 정수라 floor 처리하고, 나눗셈 잔돈은 모두 leftover 로 모은다.
 */

export interface SettlementDrop {
  /** 실제 판매가 (메소) — 수수료 떼기 전 */
  salePrice: number;
  /** 판매 수수료 % (0~100). 직거래 등 수수료가 없으면 0 */
  feePct?: number;
}

export interface SettlementPenalty {
  calcType: 'percent' | 'fixed';
  /** percent: 0~100, fixed: 메소 절대액 */
  value: number;
}

export interface SettlementParticipant {
  id: string;
  /** 한 사람에게 여러 개가 붙을 수 있다 (예: 2페 이탈 + 지각). 금액은 합산 */
  penalties?: SettlementPenalty[];
  /** 이탈 페이즈 (1부터). null/undefined = 완주 */
  exitPhase?: number | null;
}

export interface SettlementInput {
  drops: SettlementDrop[];
  /** 공대 경비(소모품·입장료·기타) 합계 */
  expenseTotal: number;
  participants: SettlementParticipant[];
  /** 뽀찌율 0~1 */
  ppojiRate: number;
}

export interface ParticipantResult {
  id: string;
  /** 패널티/재분배 전 기본 1인당 */
  base: number;
  /** 차감된 패널티 */
  penalty: number;
  /** 재분배로 추가 수령 */
  redistributed: number;
  /** 최종 수령액 */
  final: number;
  /** 몰수 대상 — 기본 몫을 전부 뺏겨 남의 벌금도 못 받는다 */
  forfeited: boolean;
}

export interface SettlementResult {
  /** 수수료 떼기 전 판매가 합계 */
  grossSales: number;
  /** 판매 수수료 합계 */
  feeTotal: number;
  /** 실수익 — 수수료를 뗀 뒤의 판매금액. 이후 계산은 전부 이 값 기준 */
  totalSales: number;
  /** 공대 경비 합계 */
  expenseTotal: number;
  netProfit: number;
  leaderPpoji: number;
  /** 참여자에게 분배되는 총액 (순수익 - 뽀찌) */
  distributable: number;
  participantCount: number;
  basePerPerson: number;
  /** 패널티로 걷힌 총액 */
  penaltyPool: number;
  /** 수령 자격자가 없어 잔돈 정책으로 흘러간 패널티 */
  orphanedPenalty: number;
  /** 정수 나눗셈 잔돈 + 재분배 나머지 + orphanedPenalty */
  leftover: number;
  participants: ParticipantResult[];
}

/** 완주자의 이탈 서열 — 누구보다도 오래 남았다는 뜻 */
const CLEARED_RANK = Number.POSITIVE_INFINITY;

const sum = (xs: number[]): number =>
  xs.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 이탈 페이즈를 비교 가능한 서열로. 클수록 오래 남은 것 */
const rankOf = (p: SettlementParticipant): number =>
  p.exitPhase == null ? CLEARED_RANK : p.exitPhase;

/** 패널티 하나의 차감액. percent 는 기본 1인당 기준으로 계산한다 */
function penaltyAmount(penalty: SettlementPenalty, basePerPerson: number): number {
  if (penalty.calcType === 'percent') {
    return Math.floor((basePerPerson * clamp(penalty.value, 0, 100)) / 100);
  }
  return Math.max(0, penalty.value);
}

/**
 * 참여자별 패널티 차감액 합계. 기본 1인당이 양수일 때만 걷는다.
 * 여러 벌금이 붙어도 합계가 1인당을 넘지 않게 막는다 — 마이너스 수령을 만들지 않기 위함.
 */
function calcPenalties(participants: SettlementParticipant[], basePerPerson: number): number[] {
  return participants.map((p) => {
    if (!p.penalties?.length || basePerPerson <= 0) return 0;
    const total = p.penalties.reduce((acc, pen) => acc + penaltyAmount(pen, basePerPerson), 0);
    return Math.min(total, basePerPerson);
  });
}

interface RedistributionResult {
  /** 참여자 index 별 재분배 수령액 */
  redistributed: number[];
  /** 정수 나눗셈으로 남은 자투리 */
  remainder: number;
  /** 수령 자격자가 없어 아무에게도 못 간 패널티 */
  orphaned: number;
}

/**
 * 패널티를 낸 사람마다 개별적으로 수령자를 정해 N빵한다.
 * 하나의 pool 로 합치지 않는 이유: 벌금마다 "누가 받을 자격이 있나"가 다르기 때문.
 */
function redistributePenalties(
  participants: SettlementParticipant[],
  penalties: number[],
  forfeited: boolean[],
): RedistributionResult {
  const n = participants.length;
  const ranks = participants.map(rankOf);
  const redistributed = new Array<number>(n).fill(0);
  let remainder = 0;
  let orphaned = 0;

  for (let i = 0; i < n; i += 1) {
    const amount = penalties[i] ?? 0;
    if (amount <= 0) continue;

    const myRank = ranks[i] ?? CLEARED_RANK;
    const recipients: number[] = [];
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      // 몰수 대상자는 자기 몫을 통째로 뺏긴 사람이라 남의 벌금도 받지 않는다.
      if (forfeited[j]) continue;
      // 완주자의 패널티는 페이즈 무관 사유 → 본인 제외 전원.
      // 중간 이탈자의 패널티는 나보다 확실히 오래 남은 사람에게만(동률 제외).
      if (myRank === CLEARED_RANK || (ranks[j] ?? CLEARED_RANK) > myRank) {
        recipients.push(j);
      }
    }

    if (recipients.length === 0) {
      orphaned += amount;
      continue;
    }

    const per = Math.floor(amount / recipients.length);
    for (const j of recipients) redistributed[j] = (redistributed[j] ?? 0) + per;
    remainder += amount - per * recipients.length;
  }

  return { redistributed, remainder, orphaned };
}

export function calcSettlement(input: SettlementInput): SettlementResult {
  const grossSales = sum(input.drops.map((d) => d.salePrice));
  // 수수료는 항목마다 다를 수 있어(경매장 5% / 직거래 0%) 드랍템 단위로 떼고 합친다
  const feeTotal = sum(
    input.drops.map((d) =>
      Math.floor((Math.max(0, d.salePrice || 0) * clamp(d.feePct ?? 0, 0, 100)) / 100),
    ),
  );
  const totalSales = grossSales - feeTotal;
  const expenseTotal = Math.max(0, input.expenseTotal || 0);

  const netProfit = totalSales - expenseTotal;
  const rate = clamp(input.ppojiRate || 0, 0, 1);
  const leaderPpoji = netProfit > 0 ? Math.floor(netProfit * rate) : 0;
  const distributable = netProfit - leaderPpoji;

  const n = input.participants.length;
  const basePerPerson = n > 0 ? Math.floor(distributable / n) : 0;
  const baseRemainder = n > 0 ? distributable - basePerPerson * n : 0;

  const penalties = calcPenalties(input.participants, basePerPerson);
  // 차감 후 기본 몫이 0 → 몰수. 노쇼 100% 든 기본 1인당을 넘는 정액 벌금이든 동일 취급
  const forfeited = penalties.map((amount) => basePerPerson > 0 && amount >= basePerPerson);
  const { redistributed, remainder, orphaned } = redistributePenalties(
    input.participants,
    penalties,
    forfeited,
  );

  const participants: ParticipantResult[] = input.participants.map((p, i) => {
    const penalty = penalties[i] ?? 0;
    const gained = redistributed[i] ?? 0;
    return {
      id: p.id,
      base: basePerPerson,
      penalty,
      redistributed: gained,
      final: basePerPerson - penalty + gained,
      forfeited: forfeited[i] ?? false,
    };
  });

  return {
    grossSales,
    feeTotal,
    totalSales,
    expenseTotal,
    netProfit,
    leaderPpoji,
    distributable,
    participantCount: n,
    basePerPerson,
    penaltyPool: sum(penalties),
    orphanedPenalty: orphaned,
    leftover: baseRemainder + remainder + orphaned,
    participants,
  };
}
