/**
 * 정산 계산 (명세서 §3) — 순수 함수. UI/DB 의존 없음 → 단위 테스트 붙이기 좋음.
 *
 *   순수익      = 총판매금액 - 용병비 - 재료비
 *   공대장 뽀찌  = 순수익 × 뽀찌%              (순수익이 양수일 때만)
 *   기본 1인당   = (순수익 - 뽀찌) / 참여인원
 *
 * 패널티(§9): 참여자별로 기본 1인당에서 차감. 차감액(penaltyPool)은
 * 패널티 없는 나머지 인원에게 다시 N빵된다("까진 금액은 순수익으로 가서 재분배").
 * 메소는 정수라 floor 처리하고, 나눗셈 잔돈 + 재분배 나머지는 leftover 로 모은다.
 */

export interface SettlementDrop {
  /** 드랍템 판매가 (메소) */
  salePrice: number;
}

export interface SettlementMerc {
  /** 용병 고정 수당 (메소) */
  fee: number;
}

export interface SettlementPenalty {
  calcType: 'percent' | 'fixed';
  /** percent: 0~100, fixed: 메소 절대액 */
  value: number;
}

export interface SettlementParticipant {
  id: string;
  penalty?: SettlementPenalty;
}

export interface SettlementInput {
  drops: SettlementDrop[];
  mercenaries: SettlementMerc[];
  /** 재료비(소모품지원금) 합계 */
  materialCost: number;
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
}

export interface SettlementResult {
  totalSales: number;
  mercCost: number;
  materialCost: number;
  netProfit: number;
  leaderPpoji: number;
  /** 참여자에게 분배되는 총액 (순수익 - 뽀찌) */
  distributable: number;
  participantCount: number;
  basePerPerson: number;
  /** 패널티로 걷힌 총액 */
  penaltyPool: number;
  /** 정수 나눗셈 잔돈 + 재분배 나머지 */
  leftover: number;
  participants: ParticipantResult[];
}

const sum = (xs: number[]): number =>
  xs.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function calcSettlement(input: SettlementInput): SettlementResult {
  const totalSales = sum(input.drops.map((d) => d.salePrice));
  const mercCost = sum(input.mercenaries.map((m) => m.fee));
  const materialCost = Math.max(0, input.materialCost || 0);

  const netProfit = totalSales - mercCost - materialCost;
  const rate = clamp(input.ppojiRate || 0, 0, 1);
  const leaderPpoji = netProfit > 0 ? Math.floor(netProfit * rate) : 0;
  const distributable = netProfit - leaderPpoji;

  const n = input.participants.length;
  const basePerPerson = n > 0 ? Math.floor(distributable / n) : 0;
  const baseRemainder = n > 0 ? distributable - basePerPerson * n : 0;

  // 1) 참여자별 패널티 차감액 (기본 1인당이 양수일 때만)
  const penalties = input.participants.map((p) => {
    if (!p.penalty || basePerPerson <= 0) return 0;
    if (p.penalty.calcType === 'percent') {
      return Math.floor((basePerPerson * clamp(p.penalty.value, 0, 100)) / 100);
    }
    return Math.min(Math.max(0, p.penalty.value), basePerPerson);
  });
  const penaltyPool = sum(penalties);

  // 2) 걷힌 차감액을 패널티 없는(=다른) 인원에게 N빵
  const nonPenalizedCount = penalties.filter((v) => v === 0).length;
  const redistribPer = nonPenalizedCount > 0 ? Math.floor(penaltyPool / nonPenalizedCount) : 0;
  const redistribRemainder =
    nonPenalizedCount > 0 ? penaltyPool - redistribPer * nonPenalizedCount : penaltyPool;

  const participants: ParticipantResult[] = input.participants.map((p, i) => {
    const penalty = penalties[i] ?? 0;
    const redistributed = penalty === 0 ? redistribPer : 0;
    return {
      id: p.id,
      base: basePerPerson,
      penalty,
      redistributed,
      final: basePerPerson - penalty + redistributed,
    };
  });

  return {
    totalSales,
    mercCost,
    materialCost,
    netProfit,
    leaderPpoji,
    distributable,
    participantCount: n,
    basePerPerson,
    penaltyPool,
    leftover: baseRemainder + redistribRemainder,
    participants,
  };
}
