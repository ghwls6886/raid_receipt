/**
 * 정산 계산 (명세서 §3) — 순수 함수. UI/DB 의존 없음 → 단위 테스트 붙이기 좋음.
 *
 *   실수익      = Σ(판매가 - 판매가 × 수수료%)   ← 경매장 수수료 등
 *   순수익      = 실수익 - 공대경비
 *   판매 인센티브 = Σ(드랍템 실수익 × 판매 인센티브%)  ← 그 아이템을 판 사람 몫
 *   판매 후 이익 = 순수익 - 판매 인센티브
 *   공대장 인센티브  = 판매 후 이익 × 인센티브%        (양수일 때만)
 *   분배 대상액  = 판매 후 이익 - 공대장 인센티브
 *   n빵 대상액   = 분배 대상액 - 역할 지원금
 *   기본 1인당   = n빵 대상액 / 참여인원
 *
 * 용병도 n빵을 치므로 별도 비용 항목이 아니라 참여자로 들어온다. 소모품·입장료 등
 * "쓴 돈"은 공대 경비(expenseTotal) 하나로 합쳐 순수익에서 차감한다.
 *
 * 판매 인센티브는 드랍템을 대신 팔아준 사람에게 주는 수고비다. 드랍템 **행마다**
 * 판매자와 %를 따로 정하므로 아이템별로 다른 사람·다른 요율이 될 수 있다.
 *
 *   - % 기준은 **그 행의 실수익(판매가 - 수수료)** 이다. 순수익 기준으로 잡으면 다른
 *     아이템의 판매가나 공대 경비에 따라 같은 "5%"가 다른 금액이 되어 설명이 안 된다.
 *   - 공대장 인센티브보다 **먼저** 뗀다. 판매 수고비는 실비에 가까워 공대장을 포함한
 *     전원이 부담하는 게 맞고, 나중에 떼면 공대장만 부담을 피하게 된다.
 *   - 판매자가 참여자 명단에 없으면 아예 떼지 않는다 — 공대장 인센티브와 같은 규칙이다.
 *     떼기만 하고 수령자가 없으면 그 돈이 "누구 것도 아닌 금액"이 되어 영수증이 안 맞는다.
 *   - 몰수 대상자가 판매자여도 지급한다. 판매는 노동의 대가라 분배 몫과 축이 다르다.
 *   - 합계가 순수익을 넘으면(경비가 큰 레이드) 비례 축소한다.
 *
 * 역할 지원금(보우마스터 샤프아이즈·비숍 부활 등)은 특정 역할을 맡은 참여자에게 n빵 전에
 * 먼저 떼어주는 몫이다. 공대장 인센티브를 뗀 **뒤**에 차감하므로 공대장 몫은 줄지 않고 공대원
 * 전원이 1/N 씩 부담한다. 한 사람에게 여러 개가 붙을 수 있고 금액은 합산된다.
 *
 *   - 이탈해도 지원금은 전액 지급한다. 감액이 필요하면 패널티로 건다 — 규칙을 한 곳에만 둔다.
 *   - 단 **몰수 대상자(기본 몫을 통째로 뺏긴 사람)에게는 지급하지 않는다.** 노쇼로 100%
 *     몰수당한 사람이 지원금만 챙겨가는 걸 막는다. 배정됐던 금액은 수령자가 없으므로
 *     orphanedPenalty 와 같은 취급으로 leftover 에 흘려 잔돈 정책에 맡긴다.
 *   - 지원금 합계가 분배 대상액을 넘으면 기본 1인당이 음수가 되므로 비례 축소한다.
 *   - 패널티의 percent 는 지원금을 **뺀** 기본 1인당 기준이다. 지원금까지 기준에 넣으면
 *     같은 "지각 10%"가 역할에 따라 다른 금액이 되어 설명이 안 된다.
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
  /**
   * 이 아이템을 판 사람 (참여자 id). null/undefined 면 판매 인센티브를 떼지 않는다.
   * 참여자 명단에 없는 id 도 같은 취급이다 — 줄 사람이 없는 돈은 떼지 않는다.
   */
  sellerId?: string | null;
  /** 판매 인센티브 % (0~100). 이 행의 실수익 기준 */
  incentivePct?: number;
}

export interface SettlementPenalty {
  calcType: 'percent' | 'fixed';
  /** percent: 0~100, fixed: 메소 절대액 */
  value: number;
}

export interface SettlementSubsidy {
  calcType: 'percent' | 'fixed';
  /** percent: 0~100 (순수익 기준), fixed: 메소 절대액 */
  value: number;
}

export interface SettlementParticipant {
  id: string;
  /** 한 사람에게 여러 개가 붙을 수 있다 (예: 2페 이탈 + 지각). 금액은 합산 */
  penalties?: SettlementPenalty[];
  /** 역할 지원금. 여러 개 가능하며 합산. n빵 전에 분배 대상액에서 먼저 뗀다 */
  subsidies?: SettlementSubsidy[];
  /** 이탈 페이즈 (1부터). null/undefined = 완주 */
  exitPhase?: number | null;
  /** 공대장 — 인센티브를 받는 사람. 공대당 한 명 */
  isLeader?: boolean;
}

export interface SettlementInput {
  drops: SettlementDrop[];
  /** 공대 경비(소모품·입장료·기타) 합계 */
  expenseTotal: number;
  participants: SettlementParticipant[];
  /** 인센티브율 0~1 */
  ppojiRate: number;
}

export interface ParticipantResult {
  id: string;
  /** 패널티/재분배 전 기본 1인당 */
  base: number;
  /** 실제 지급된 역할 지원금 (몰수 대상자는 0) */
  subsidy: number;
  /** 차감된 패널티 */
  penalty: number;
  /** 재분배로 추가 수령 */
  redistributed: number;
  /** 공대장 인센티브 수령액 (공대장만 > 0) */
  incentive: number;
  /** 드랍템 판매 인센티브 수령액. 여러 아이템을 팔았으면 합산된다 */
  saleIncentive: number;
  /** 잔돈 재분배 수령액 — 수령자 없는 벌금·몰수 지원금·끝전을 되돌려준 몫 */
  leftoverShare: number;
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
  /** 드랍템 판매 인센티브 합계 (비례 축소 후 · 실제 지급되는 금액) */
  saleIncentiveTotal: number;
  /**
   * 드랍템 행별 판매 인센티브 (input.drops 와 같은 순서·길이).
   * 판매자가 없거나 명단에 없으면 0. 확정 영수증 스냅샷과 화면 표기가 이 값을 쓴다 —
   * %만으로 다시 계산하면 비례 축소가 걸린 경우 합계와 어긋난다.
   */
  dropSaleIncentives: number[];
  /** 판매 인센티브 합계가 순수익을 넘어 비례 축소됐는지 — UI 경고용 */
  saleIncentiveCapped: boolean;
  /** 순수익 - 판매 인센티브. 공대장 인센티브의 기준액 */
  netAfterSaleIncentive: number;
  leaderPpoji: number;
  /** 참여자에게 분배되는 총액 (판매 후 이익 - 공대장 인센티브) */
  distributable: number;
  /** 분배 대상액에서 뗀 역할 지원금 총액 (비례 축소 후 기준) */
  subsidyTotal: number;
  /** 실제 참여자에게 지급된 지원금 합계 (몰수 대상자 제외) */
  subsidyPaid: number;
  /** 몰수 대상자에게 배정됐다가 지급되지 않고 잔돈으로 넘어간 지원금 */
  forfeitedSubsidy: number;
  /** 지원금 합계가 분배 대상액을 넘어 비례 축소됐는지 — UI 경고용 */
  subsidyCapped: boolean;
  /** n빵 대상액 (분배 대상액 - 지원금 총액). 기본 1인당의 분자 */
  distributableAfterSubsidy: number;
  participantCount: number;
  basePerPerson: number;
  /**
   * 화면·영수증에 "1인당"으로 내세우는 대표 금액.
   * 인센티브·지원금·패널티가 없고 완주한 사람의 실수령액이며, 그런 사람이 없으면
   * basePerPerson 으로 떨어진다. 공대장을 대표로 뽑으면 인센티브가 섞여 부풀려지고,
   * 지원금 수령자를 뽑아도 마찬가지라 둘 다 제외한다.
   */
  representativePerPerson: number;
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

const sum = (xs: number[]): number => xs.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

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
  /** 수령 자격자가 없어 아무에게도 못 간 패널티 (합계) */
  orphaned: number;
  /**
   * 위 금액을 "낸 사람" 별로 쪼갠 것. 잔돈으로 되돌려줄 때 낸 사람을 제외해야 하므로
   * 합계만으로는 부족하다 — 안 그러면 벌금 낸 사람이 자기 벌금을 일부 돌려받는다.
   */
  orphanedBy: number[];
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
  const orphanedBy = new Array<number>(n).fill(0);
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
      orphanedBy[i] = (orphanedBy[i] ?? 0) + amount;
      continue;
    }

    const per = Math.floor(amount / recipients.length);
    for (const j of recipients) redistributed[j] = (redistributed[j] ?? 0) + per;
    remainder += amount - per * recipients.length;
  }

  return { redistributed, remainder, orphaned, orphanedBy };
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

  // ── 드랍템 판매 인센티브 ──
  // 참여자 명단에 있는 판매자만 인정한다. 명단에 없는 id 는 UI 에서 참여자를 뺐는데
  // 드랍템 행에 판매자가 남은 경우로, 줄 사람이 없으니 떼지 않는다.
  const indexById = new Map(input.participants.map((p, i) => [p.id, i]));
  const n = input.participants.length;
  // 드랍템 행별로 먼저 구한다. 확정 스냅샷이 행 단위라 사람 단위 합계만으로는 부족하다.
  const requestedDropIncentives = input.drops.map((d) => {
    if (d.sellerId == null || !indexById.has(d.sellerId)) return 0;
    const price = Math.max(0, d.salePrice || 0);
    const fee = Math.floor((price * clamp(d.feePct ?? 0, 0, 100)) / 100);
    return Math.floor(((price - fee) * clamp(d.incentivePct ?? 0, 0, 100)) / 100);
  });
  const requestedSaleTotal = sum(requestedDropIncentives);
  // 경비가 커서 순수익이 판매 인센티브보다 작으면 비례 축소한다. 그대로 두면
  // 분배 대상액이 음수가 되어 전원 마이너스 수령이 된다 (지원금과 같은 처리).
  const saleIncentiveCap = Math.max(0, netProfit);
  const saleIncentiveCapped = requestedSaleTotal > saleIncentiveCap;
  const dropSaleIncentives = saleIncentiveCapped
    ? requestedDropIncentives.map((v) => Math.floor((v * saleIncentiveCap) / requestedSaleTotal))
    : requestedDropIncentives;

  // 행별 금액을 판매자에게 합산한다. 한 사람이 여러 아이템을 팔았을 수 있다.
  const saleIncentives = new Array<number>(n).fill(0);
  input.drops.forEach((d, i) => {
    const amount = dropSaleIncentives[i] ?? 0;
    if (amount <= 0 || d.sellerId == null) return;
    const seller = indexById.get(d.sellerId);
    if (seller === undefined) return;
    saleIncentives[seller] = (saleIncentives[seller] ?? 0) + amount;
  });
  const saleIncentiveTotal = sum(saleIncentives);
  const netAfterSaleIncentive = netProfit - saleIncentiveTotal;

  const rate = clamp(input.ppojiRate || 0, 0, 1);
  // 받을 사람(공대장)이 지정되지 않았으면 아예 떼지 않는다. 떼기만 하고 수령자가 없으면
  // 그 돈이 잔돈으로 흘러 "누구 것도 아닌 금액"이 되어 영수증 설명이 안 된다.
  const leaderIndex = input.participants.findIndex((p) => p.isLeader);
  const hasLeader = leaderIndex >= 0;
  // 판매 인센티브를 뗀 뒤가 기준이다. 순수익 기준으로 잡으면 공대장만 판매 수고비를
  // 부담하지 않게 되어, 공대원 몫만 줄고 공대장 몫은 그대로인 결과가 나온다.
  const leaderPpoji =
    hasLeader && netAfterSaleIncentive > 0 ? Math.floor(netAfterSaleIncentive * rate) : 0;
  const distributable = netAfterSaleIncentive - leaderPpoji;

  // 역할 지원금은 n빵 전에 분배 대상액에서 뗀다. 합계가 분배 대상액을 넘으면
  // 기본 1인당이 음수가 되므로 비례 축소한다 (전원 마이너스 수령 방지).
  // percent 지원금은 순수익 기준이다. 분배 대상액이나 1인당을 기준으로 잡으면
  // "지원금을 빼야 1인당이 나오는데 1인당이 있어야 지원금이 나오는" 순환이 생긴다.
  const subsidyAmount = (s: SettlementSubsidy): number =>
    s.calcType === 'percent'
      ? Math.floor((Math.max(0, netProfit) * clamp(s.value, 0, 100)) / 100)
      : Math.max(0, s.value);
  const requestedSubsidies = input.participants.map((p) =>
    Math.max(0, sum((p.subsidies ?? []).map(subsidyAmount))),
  );
  const requestedTotal = sum(requestedSubsidies);
  const subsidyCap = Math.max(0, distributable);
  const subsidyCapped = requestedTotal > subsidyCap;
  const subsidies = subsidyCapped
    ? requestedSubsidies.map((v) => Math.floor((v * subsidyCap) / requestedTotal))
    : requestedSubsidies;
  const subsidyTotal = sum(subsidies);
  const distributableAfterSubsidy = distributable - subsidyTotal;

  const basePerPerson = n > 0 ? Math.floor(distributableAfterSubsidy / n) : 0;
  const baseRemainder = n > 0 ? distributableAfterSubsidy - basePerPerson * n : 0;

  const penalties = calcPenalties(input.participants, basePerPerson);
  // 차감 후 기본 몫이 0 → 몰수. 노쇼 100% 든 기본 1인당을 넘는 정액 벌금이든 동일 취급
  const forfeited = penalties.map((amount) => basePerPerson > 0 && amount >= basePerPerson);
  const { redistributed, remainder, orphaned, orphanedBy } = redistributePenalties(
    input.participants,
    penalties,
    forfeited,
  );

  // 몰수 대상자에게는 지원금을 지급하지 않는다. 이미 분배 대상액에서는 뗀 뒤라
  // 남는 금액은 수령자가 없으므로 orphanedPenalty 와 똑같이 잔돈 정책으로 흘린다.
  const paidSubsidies = subsidies.map((amount, i) => (forfeited[i] ? 0 : amount));
  const subsidyPaid = sum(paidSubsidies);
  const forfeitedSubsidy = subsidyTotal - subsidyPaid;

  // 잔돈은 남기지 않고 참여자에게 되돌려준다. 원천은 네 가지 —
  // 1인당 나눗셈 끝전, 재분배 끝전, 수령자 없는 벌금, 몰수자에게 못 준 지원금.
  // 몰수 대상자는 제외한다. 자기 몫을 통째로 뺏긴 사람이 잔돈으로 되살아나면
  // 몰수의 의미가 없어지고, 남의 벌금을 못 받게 한 규칙과도 어긋난다.
  const leftoverShares = new Array<number>(n).fill(0);
  const leftoverTargets: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!forfeited[i]) leftoverTargets.push(i);
  }

  // 수령 자격자가 없던 벌금은 **낸 사람을 빼고** 나눈다. 전원에게 나누면 벌금을 낸
  // 사람이 자기 벌금의 1/N 을 돌려받아 실질 벌금이 줄어든다.
  // 나눈 뒤 남는 끝전은 아래 일반 잔돈과 합쳐 처리한다.
  let generalPool = baseRemainder + remainder + forfeitedSubsidy;
  for (let i = 0; i < n; i += 1) {
    const amount = orphanedBy[i] ?? 0;
    if (amount <= 0) continue;
    const targets = leftoverTargets.filter((j) => j !== i);
    if (targets.length === 0) {
      // 받을 사람이 정말 아무도 없으면(예: 참여자 1명) 일반 잔돈으로 흘린다
      generalPool += amount;
      continue;
    }
    const per = Math.floor(amount / targets.length);
    for (const j of targets) leftoverShares[j] = (leftoverShares[j] ?? 0) + per;
    generalPool += amount - per * targets.length;
  }

  // 나머지 잔돈(1인당 끝전·재분배 끝전·몰수자 지원금)은 출처를 따질 게 없어 전원에게
  const leftoverPool = generalPool;
  const leftoverPer =
    leftoverTargets.length > 0 ? Math.floor(leftoverPool / leftoverTargets.length) : 0;
  for (const i of leftoverTargets) leftoverShares[i] = (leftoverShares[i] ?? 0) + leftoverPer;
  // 여기서도 나누어떨어지지 않은 끝전(참여인원 미만의 메소)이 남는다.
  // 공대장이 있으면 그가 가져가고, 없으면 어쩔 수 없이 leftover 로 남긴다.
  let leftoverRest = leftoverPool - leftoverPer * leftoverTargets.length;
  if (hasLeader && leftoverRest > 0 && !forfeited[leaderIndex]) {
    leftoverShares[leaderIndex] = (leftoverShares[leaderIndex] ?? 0) + leftoverRest;
    leftoverRest = 0;
  }

  const participants: ParticipantResult[] = input.participants.map((p, i) => {
    const penalty = penalties[i] ?? 0;
    const gained = redistributed[i] ?? 0;
    const subsidy = paidSubsidies[i] ?? 0;
    const incentive = i === leaderIndex ? leaderPpoji : 0;
    const leftoverShare = leftoverShares[i] ?? 0;
    // 몰수 대상자에게도 지급한다 — 판매는 노동의 대가라 분배 몫과 축이 다르다.
    const saleIncentive = saleIncentives[i] ?? 0;
    return {
      id: p.id,
      base: basePerPerson,
      subsidy,
      penalty,
      redistributed: gained,
      incentive,
      saleIncentive,
      leftoverShare,
      final: basePerPerson + subsidy - penalty + gained + incentive + saleIncentive + leftoverShare,
      forfeited: forfeited[i] ?? false,
    };
  });

  // 대표 1인당 — 아무 가감이 없는 완주자의 실수령액.
  // 잔돈 재분배(leftoverShare)와 남의 벌금 수령(redistributed)은 그 사람이 실제로
  // 받는 돈이므로 포함한다. 인센티브·지원금·패널티·몰수는 개인 사정이라 제외한다.
  const cleanIdx = input.participants.findIndex(
    (p, i) =>
      !p.isLeader &&
      !p.penalties?.length &&
      !p.subsidies?.length &&
      // 판매 인센티브를 받은 사람도 제외한다. 공대장·지원금 수령자와 같은 이유로
      // 대표값이 부풀려져 "1인당"이 실제보다 크게 보인다.
      (saleIncentives[i] ?? 0) === 0 &&
      p.exitPhase == null &&
      !forfeited[i],
  );
  const representativePerPerson =
    cleanIdx >= 0 ? (participants[cleanIdx]?.final ?? basePerPerson) : basePerPerson;

  return {
    grossSales,
    feeTotal,
    totalSales,
    expenseTotal,
    netProfit,
    saleIncentiveTotal,
    dropSaleIncentives,
    saleIncentiveCapped,
    netAfterSaleIncentive,
    leaderPpoji,
    distributable,
    subsidyTotal,
    subsidyPaid,
    forfeitedSubsidy,
    subsidyCapped,
    distributableAfterSubsidy,
    participantCount: n,
    basePerPerson,
    representativePerPerson,
    penaltyPool: sum(penalties),
    orphanedPenalty: orphaned,
    // 참여자에게 되돌려주고도 남은 끝전만 잔돈으로 남는다. 공대장이 지정돼 있으면 0.
    leftover: leftoverRest,
    participants,
  };
}
