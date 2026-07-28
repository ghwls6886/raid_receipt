/**
 * 데이터 레이어 (목업) — 명세서 §12
 *
 * 화면은 오직 이 레이어를 통해 데이터를 읽는다.
 * DB 연결 시 각 함수의 "속"만 Supabase 호출로 교체하면 화면은 무수정.
 */
import { useGuildStore } from '@/stores/useGuildStore';
import { DEFAULT_COOLDOWN_HOURS } from '@/lib/bossTimer';

export type RaidStatus = 'draft' | 'confirmed';

export interface RaidRow {
  id: string;
  /** ISO 날짜 "YYYY-MM-DD" */
  date: string;
  bossName: string;
  /** 공대명 스냅샷 (null = 임시 공대) */
  partyName: string | null;
  /** 총 순수익 (메소) */
  netProfit: number;
  participantCount: number;
  /** 1인당 분배금 (메소) */
  perPerson: number;
  status: RaidStatus;
  /** 디스코드 영수증 발송 여부 */
  sent: boolean;
}

export interface DashboardStats {
  totalNetProfit: number;
  monthNetProfit: number;
  raidCount: number;
  topContributor: { name: string; raidCount: number } | null;
}

/** 네트워크 지연 흉내 — 로딩 상태 UX 확인용 */
const delay = <T>(data: T, ms = 350): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

const RAIDS: Record<string, RaidRow[]> = {
  g1: [
    { id: 'r1', date: '2026-07-24', bossName: '자쿰', partyName: '1공대 (자쿰)', netProfit: 0, participantCount: 6, perPerson: 0, status: 'draft', sent: false },
    { id: 'r10', date: '2026-07-24', bossName: '카오스 자쿰', partyName: '1공대 (자쿰)', netProfit: 48_000_000, participantCount: 6, perPerson: 7_200_000, status: 'confirmed', sent: true },
    { id: 'r2', date: '2026-07-22', bossName: '혼테일', partyName: '2공대 (혼테일)', netProfit: 82_000_000, participantCount: 8, perPerson: 9_225_000, status: 'confirmed', sent: true },
    { id: 'r3', date: '2026-07-20', bossName: '핑크빈', partyName: '1공대 (자쿰)', netProfit: 33_500_000, participantCount: 5, perPerson: 6_030_000, status: 'confirmed', sent: true },
    { id: 'r11', date: '2026-07-20', bossName: '카오스 혼테일', partyName: '2공대 (혼테일)', netProfit: 40_000_000, participantCount: 7, perPerson: 5_142_857, status: 'confirmed', sent: true },
    { id: 'r4', date: '2026-07-18', bossName: '카오스 핑크빈', partyName: null, netProfit: 18_000_000, participantCount: 4, perPerson: 4_050_000, status: 'confirmed', sent: true },
    { id: 'r5', date: '2026-07-15', bossName: '카오스 자쿰', partyName: '1공대 (자쿰)', netProfit: 51_200_000, participantCount: 7, perPerson: 6_582_857, status: 'confirmed', sent: true },
    { id: 'r6', date: '2026-07-13', bossName: '혼테일', partyName: '2공대 (혼테일)', netProfit: 47_400_000, participantCount: 6, perPerson: 7_110_000, status: 'confirmed', sent: false },
    { id: 'r7', date: '2026-06-28', bossName: '핑크빈', partyName: '1공대 (자쿰)', netProfit: 29_000_000, participantCount: 5, perPerson: 5_220_000, status: 'confirmed', sent: true },
  ],
  g2: [
    { id: 'r8', date: '2026-07-21', bossName: '자쿰', partyName: '주말 공대', netProfit: 24_000_000, participantCount: 5, perPerson: 4_320_000, status: 'confirmed', sent: true },
    { id: 'r9', date: '2026-07-19', bossName: '핑크빈', partyName: '주말 공대', netProfit: 9_600_000, participantCount: 3, perPerson: 2_880_000, status: 'confirmed', sent: true },
  ],
};

const TOP_CONTRIBUTOR: Record<string, { name: string; raidCount: number }> = {
  g1: { name: '물풀', raidCount: 8 },
  g2: { name: '달빛', raidCount: 2 },
};

/** 레이드 이력 (최신순) */
export function getRaids(guildId: string): Promise<RaidRow[]> {
  const rows = [...(RAIDS[guildId] ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return delay(rows);
}

/** 대시보드 스탯 — 확정 레이드 기준 집계 (명세서 §8) */
export function getDashboardStats(guildId: string): Promise<DashboardStats> {
  const rows = RAIDS[guildId] ?? [];
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const totalNetProfit = confirmed.reduce((sum, r) => sum + r.netProfit, 0);

  // 데이터 기준 최신 달을 "이번 달"로 잡는다(실제 시계와 무관하게 데모 안정).
  const latestMonth = rows.reduce((max, r) => (r.date > max ? r.date : max), '').slice(0, 7);
  const monthNetProfit = confirmed
    .filter((r) => r.date.startsWith(latestMonth))
    .reduce((sum, r) => sum + r.netProfit, 0);

  return delay({
    totalNetProfit,
    monthNetProfit,
    raidCount: confirmed.length,
    topContributor: TOP_CONTRIBUTOR[guildId] ?? null,
  });
}

/** 훅 밖(이벤트 핸들러 등)에서 현재 길드 id 가 필요할 때 */
export function currentGuildId(): string {
  return useGuildStore.getState().currentGuildId;
}

// ─── 길드원 ───────────────────────────────────────────────
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
  /** 직업 대분류 (전사/마법사/궁수/도적/해적) */
  jobCategory: string;
  /** 세부 직업 */
  job: string;
  level: number;
  role: MemberRole;
  /**
   * 활동 여부. 길드를 떠난 사람은 삭제가 아니라 false 로 둔다.
   *
   * 삭제하면 raid_participants.member_id 가 끊겨 과거 레이드의 참여자가 누구였는지,
   * 참여도 집계가 통째로 사라진다. 비활성은 "앞으로 뽑지 않는다"는 뜻일 뿐이고
   * 지난 기록은 그대로 남는다.
   */
  isActive: boolean;
}

/** 직업 대분류 → 세부 직업 */
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

/** 세부 직업 → 대분류 조회 */
export function jobCategoryOf(job: string): string {
  return JOB_GROUPS.find((g) => g.jobs.includes(job))?.category ?? '기타';
}

export interface JobSection {
  category: string;
  members: Member[];
}

/** 직업 대분류로 그룹핑 → 세부 직업순 → 레벨 내림차순 (여러 화면 공용) */
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

// m4(도둑고양이)는 비활성 시드 — 비활성 탭과 "과거 이력은 남는다"(MEMBER_STATS 에 5회 참여)를
// 바로 확인할 수 있게 해 둔다. 어느 공대에도 편성돼 있지 않아 공대 시드와 충돌하지 않는다.
const MEMBERS: Record<string, Member[]> = {
  g1: [
    { id: 'm1', guildId: 'g1', nickname: '흑우', jobCategory: '전사', job: '히어로', level: 200, role: 'MASTER', isActive: true },
    { id: 'm2', guildId: 'g1', nickname: '물풀', jobCategory: '마법사', job: '비숍', level: 195, role: 'MANAGER', isActive: true },
    { id: 'm3', guildId: 'g1', nickname: '라플', jobCategory: '궁수', job: '보우마스터', level: 190, role: 'MEMBER', isActive: true },
    { id: 'm4', guildId: 'g1', nickname: '도둑고양이', jobCategory: '도적', job: '나이트로드', level: 188, role: 'MEMBER', isActive: false },
    { id: 'm5', guildId: 'g1', nickname: '배주부', jobCategory: '마법사', job: '아크메이지(불,독)', level: 192, role: 'MEMBER', isActive: true },
    { id: 'm8', guildId: 'g1', nickname: '강철검', jobCategory: '전사', job: '팔라딘', level: 198, role: 'MEMBER', isActive: true },
    { id: 'm9', guildId: 'g1', nickname: '불꽃', jobCategory: '마법사', job: '아크메이지(썬,콜)', level: 187, role: 'MEMBER', isActive: true },
    { id: 'm10', guildId: 'g1', nickname: '활짱', jobCategory: '궁수', job: '신궁', level: 193, role: 'MEMBER', isActive: true },
    { id: 'm11', guildId: 'g1', nickname: '그림자', jobCategory: '도적', job: '섀도어', level: 185, role: 'MEMBER', isActive: true },
    { id: 'm12', guildId: 'g1', nickname: '항해왕', jobCategory: '해적', job: '캡틴', level: 191, role: 'MANAGER', isActive: true },
  ],
  g2: [
    { id: 'm6', guildId: 'g2', nickname: '달빛', jobCategory: '전사', job: '팔라딘', level: 180, role: 'MASTER', isActive: true },
    { id: 'm7', guildId: 'g2', nickname: '은빛', jobCategory: '궁수', job: '신궁', level: 175, role: 'MEMBER', isActive: true },
  ],
};

let seq = 100;
const nextId = (prefix: string): string => `${prefix}_${(seq += 1)}`;

/**
 * 길드원 목록 — 기본은 활동 중인 사람만.
 *
 * 공대 편성·레이드 참여자 선택이 이 함수를 그대로 쓰기 때문에, 기본값을 "활성만"으로
 * 두면 비활성 길드원이 새 레이드에 딸려 들어가는 일이 화면 수정 없이 막힌다.
 * 비활성까지 보려면(길드원 화면의 비활성 탭) includeInactive 를 켠다.
 */
export function getMembers(guildId: string, includeInactive = false): Promise<Member[]> {
  const list = MEMBERS[guildId] ?? [];
  return delay(includeInactive ? [...list] : list.filter((m) => m.isActive));
}

export interface AddMemberInput {
  nickname: string;
  jobCategory: string;
  job: string;
  level: number;
  role: MemberRole;
}

/** 길드원 추가 — 같은 길드 내 닉네임 중복 체크 (넥슨 자동검증 없음, 우리 DB만) */
export function addMember(guildId: string, input: AddMemberInput): Promise<Member> {
  const list = MEMBERS[guildId] ?? (MEMBERS[guildId] = []);
  const nickname = input.nickname.trim();
  if (!nickname) return Promise.reject(new Error('닉네임을 입력해 주세요.'));

  // 비활성까지 포함해 검사한다. 같은 닉네임을 새로 만들면 과거 이력이 두 사람으로 쪼개진다.
  const existing = list.find((m) => m.nickname === nickname);
  if (existing) {
    return Promise.reject(
      new Error(
        existing.isActive
          ? `이미 등록된 닉네임입니다: ${nickname}`
          : `'${nickname}'은(는) 비활성 길드원입니다. 길드원 화면의 [비활성] 탭에서 되돌려 주세요.`,
      ),
    );
  }

  const member: Member = {
    id: nextId('m'),
    guildId,
    nickname,
    jobCategory: input.jobCategory || jobCategoryOf(input.job),
    job: input.job,
    level: input.level,
    role: input.role,
    isActive: true,
  };
  list.push(member);
  logAudit(guildId, '길드원 등록', `${nickname} (${ROLE_LABEL[input.role]})`);
  return delay(member, 200);
}

/** 활동 중인 마스터 수 — 비활성은 길드를 운영하지 못하므로 정족수에서 뺀다 */
function masterCount(list: Member[]): number {
  return list.filter((m) => m.role === 'MASTER' && m.isActive).length;
}

/** 길드원 역할(권한) 변경 — 마지막 마스터는 강등 불가 */
export function updateMemberRole(guildId: string, memberId: string, role: MemberRole): Promise<Member> {
  const list = MEMBERS[guildId] ?? [];
  const idx = list.findIndex((m) => m.id === memberId);
  const member = list[idx];
  if (!member) return Promise.reject(new Error('길드원을 찾을 수 없습니다.'));
  if (member.role === 'MASTER' && role !== 'MASTER' && masterCount(list) <= 1) {
    return Promise.reject(
      new Error('관리자(마스터)는 최소 1명 필요합니다. 다른 관리자를 먼저 임명하세요.'),
    );
  }
  const updated: Member = { ...member, role };
  list[idx] = updated;
  logAudit(guildId, '역할 변경', `${member.nickname}: ${ROLE_LABEL[member.role]} → ${ROLE_LABEL[role]}`);
  return delay(updated, 150);
}

/**
 * 비활성화 결과 — 어느 공대에서 빠졌는지, 공대장 재지정이 필요한 공대가 어디인지.
 * 화면이 "1공대의 공대장을 다시 지정해 주세요" 같은 안내를 띄우는 데 쓴다.
 */
export interface DeactivateResult {
  member: Member;
  /** 이 길드원이 빠진 공대 이름들 */
  removedFromParties: string[];
  /** 공대장 자리가 비어 재지정이 필요한 공대 이름들 */
  partiesNeedingLeader: string[];
}

/**
 * 길드원 비활성화 (soft delete) — 삭제하지 않는다.
 *
 * 실제 삭제는 과거 레이드의 참여자 기록(raid_participants)과 참여도 집계를 끊어버린다.
 * 비활성은 명단에서만 빼고 지난 기록은 그대로 둔다.
 * 편성돼 있던 공대에서는 같이 빠진다 — 안 뽑을 사람이 명단에 남아 인원수를 부풀리면
 * 공대 정원을 잘못 읽게 된다. 공대장이었다면 자리를 비우고 재지정을 요청한다.
 */
export function deactivateMember(guildId: string, memberId: string): Promise<DeactivateResult> {
  const list = MEMBERS[guildId] ?? [];
  const idx = list.findIndex((m) => m.id === memberId);
  const member = list[idx];
  if (!member) return Promise.reject(new Error('길드원을 찾을 수 없습니다.'));
  if (!member.isActive) return Promise.reject(new Error('이미 비활성 상태입니다.'));
  if (member.role === 'MASTER' && masterCount(list) <= 1) {
    return Promise.reject(
      new Error('마지막 관리자(마스터)는 비활성화할 수 없습니다. 다른 관리자를 먼저 임명하세요.'),
    );
  }

  const updated: Member = { ...member, isActive: false };
  list[idx] = updated;

  const removedFromParties: string[] = [];
  const partiesNeedingLeader: string[] = [];
  const parties = PARTIES[guildId] ?? [];
  parties.forEach((party, i) => {
    if (!party.memberIds.includes(memberId) && party.leaderId !== memberId) return;
    removedFromParties.push(party.name);
    const wasLeader = party.leaderId === memberId;
    if (wasLeader) partiesNeedingLeader.push(party.name);
    parties[i] = {
      ...party,
      memberIds: party.memberIds.filter((id) => id !== memberId),
      leaderId: wasLeader ? '' : party.leaderId,
    };
  });

  logAudit(guildId, '길드원 비활성화', member.nickname);
  return delay({ member: updated, removedFromParties, partiesNeedingLeader }, 200);
}

/** 비활성 길드원 복귀 — 공대 편성은 복원되지 않으니 다시 넣어야 한다 */
export function reactivateMember(guildId: string, memberId: string): Promise<Member> {
  const list = MEMBERS[guildId] ?? [];
  const idx = list.findIndex((m) => m.id === memberId);
  const member = list[idx];
  if (!member) return Promise.reject(new Error('길드원을 찾을 수 없습니다.'));
  if (member.isActive) return Promise.reject(new Error('이미 활동 중입니다.'));

  const updated: Member = { ...member, isActive: true };
  list[idx] = updated;
  logAudit(guildId, '길드원 복귀', member.nickname);
  return delay(updated, 200);
}

// ─── 보스 마스터 (SYS 공용, §9 시드) ──────────────────────
/**
 * 이탈 시점 셀렉트에 처음 보여줄 페이즈 개수.
 *
 * 재분배 계산은 페이즈의 "순서"만 비교하므로(2페 < 3페 < 완주) 보스별 실제 페이즈 수를
 * 정확히 알 필요가 없다. 이 값은 선택지를 몇 개 그릴지에만 쓰이고, 모자라면 레이드
 * 화면에서 그 자리에서 늘린다 → 보스 마스터에 페이즈 수를 관리할 필요가 없다.
 */
export const DEFAULT_PHASE_COUNT = 3;

/** 이탈 페이즈 상한 — 실수로 무한정 늘리는 걸 막는 안전장치 */
export const MAX_PHASE_COUNT = 20;

export interface Boss {
  id: string;
  name: string;
  /** 재입장 쿨타임(시간). 대시보드 보스 타이머의 다음 입장 가능 시각 계산에 쓰인다 */
  cooldownHours: number;
}

const BOSSES: Boss[] = [
  { id: 'b1', name: '자쿰', cooldownHours: DEFAULT_COOLDOWN_HOURS },
  { id: 'b2', name: '혼테일', cooldownHours: DEFAULT_COOLDOWN_HOURS },
  { id: 'b3', name: '핑크빈', cooldownHours: DEFAULT_COOLDOWN_HOURS },
  { id: 'b4', name: '카오스 자쿰', cooldownHours: DEFAULT_COOLDOWN_HOURS },
  { id: 'b5', name: '카오스 혼테일', cooldownHours: DEFAULT_COOLDOWN_HOURS },
  { id: 'b6', name: '카오스 핑크빈', cooldownHours: DEFAULT_COOLDOWN_HOURS },
];

export function getBosses(): Promise<Boss[]> {
  return delay([...BOSSES]);
}

/** 쿨타임 입력 상한 — 30일. 오타(24 를 240 으로)로 타이머가 사실상 안 열리는 걸 막는다 */
export const MAX_COOLDOWN_HOURS = 720;

/** 쿨타임 값 검증 — 통과하면 null, 아니면 사용자에게 보여줄 메시지 */
function cooldownError(hours: number): string | null {
  if (!Number.isInteger(hours) || hours < 1) return '쿨타임은 1시간 이상의 정수여야 합니다.';
  if (hours > MAX_COOLDOWN_HOURS) return `쿨타임은 ${MAX_COOLDOWN_HOURS}시간(30일) 이하여야 합니다.`;
  return null;
}

/** 보스 추가 (이름 중복 체크) */
export function addBoss(name: string, cooldownHours = DEFAULT_COOLDOWN_HOURS): Promise<Boss> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new Error('보스 이름을 입력해 주세요.'));
  if (BOSSES.some((b) => b.name === trimmed)) {
    return Promise.reject(new Error(`이미 등록된 보스입니다: ${trimmed}`));
  }
  const invalid = cooldownError(cooldownHours);
  if (invalid) return Promise.reject(new Error(invalid));

  const boss: Boss = { id: nextId('b'), name: trimmed, cooldownHours };
  BOSSES.push(boss);
  return delay(boss, 150);
}

/** 보스 쿨타임 변경 — 주 1회 보스라면 168 처럼 값만 바꾸면 된다 */
export function updateBossCooldown(id: string, cooldownHours: number): Promise<Boss> {
  const idx = BOSSES.findIndex((b) => b.id === id);
  const boss = BOSSES[idx];
  if (!boss) return Promise.reject(new Error('보스를 찾을 수 없습니다.'));
  const invalid = cooldownError(cooldownHours);
  if (invalid) return Promise.reject(new Error(invalid));

  const updated: Boss = { ...boss, cooldownHours };
  BOSSES[idx] = updated;
  return delay(updated, 150);
}

/** 보스 삭제 — 과거 레이드는 bossName 스냅샷이라 영향 없음 */
export function deleteBoss(id: string): Promise<void> {
  const idx = BOSSES.findIndex((b) => b.id === id);
  if (idx >= 0) BOSSES.splice(idx, 1);
  return delay(undefined, 120);
}

// ─── 서버 마스터 (SYS · 관리자) ───────────────────────────
export interface GameServer {
  id: string;
  name: string;
}

const SERVERS: GameServer[] = [
  { id: 's1', name: '메이플랜드' },
  { id: 's2', name: '메이플플래닛' },
];

export function getServers(): Promise<GameServer[]> {
  return delay([...SERVERS]);
}

export function addServer(name: string): Promise<GameServer> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new Error('서버 이름을 입력해 주세요.'));
  if (SERVERS.some((s) => s.name === trimmed)) {
    return Promise.reject(new Error(`이미 등록된 서버입니다: ${trimmed}`));
  }
  const server: GameServer = { id: nextId('s'), name: trimmed };
  SERVERS.push(server);
  return delay(server, 150);
}

export function deleteServer(id: string): Promise<void> {
  const idx = SERVERS.findIndex((s) => s.id === id);
  if (idx >= 0) SERVERS.splice(idx, 1);
  return delay(undefined, 120);
}

// ─── 길드 정산 정책 (guild_settings §9) ───────────────────
export interface GuildSettings {
  /** 기본 뽀찌율 0~1. 뽀찌를 안 걷는 길드가 많아 기본값은 0 */
  ppojiRate: number;
  /** 기본 판매 수수료 % (경매장). 드랍템 행마다 자동으로 채워지고 개별 수정 가능 */
  defaultFeePct: number;
}

export function getGuildSettings(_guildId: string): Promise<GuildSettings> {
  return delay({ ppojiRate: 0, defaultFeePct: 5 });
}

// ─── 레이드 생성 ──────────────────────────────────────────
// 레이드 상세 (편집·복원용) — RaidRow 는 목록 요약, RaidDetail 은 입력 원본
export interface RaidDrop {
  name: string;
  /** 실제 판매가 — 수수료 떼기 전 */
  salePrice: number;
  /** 판매 수수료 % (0~100). 직거래면 0 */
  feePct: number;
}
/**
 * 공대 경비 = 레이드에서 "쓴 돈" 전부. 소모품·입장료·기타를 한 카드에서 입력받는다.
 * 용병은 더 이상 비용이 아니라 n빵 참여자(RaidParticipant.guestName)로 들어간다.
 */
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
  /** 길드원 참여자 id. 임시 용병이면 null */
  memberId: string | null;
  /** 임시 용병 이름. 길드원이면 null */
  guestName: string | null;
  /** 한 사람에게 여러 개가 붙을 수 있다 (예: 2페 이탈 + 지각) */
  penaltyTypeIds: string[];
  /** 이탈 페이즈(1부터). null = 완주 */
  exitPhase: number | null;
}

export interface RaidDetail {
  id: string;
  guildId: string;
  bossName: string;
  partyName: string | null;
  ppojiPct: number;
  remainderPolicy: RemainderPolicy;
  /** 이 레이드에서 쓴 이탈 페이즈 선택지 개수 (사용자가 늘렸으면 그 값) */
  phaseCount: number;
  drops: RaidDrop[];
  expenses: RaidExpense[];
  participants: RaidParticipant[];
}

/** 확정+발송 완료 건은 읽기전용 잠금. 임시저장/미발송 건만 수정 가능 (명세서 §5) */
export function isRaidEditable(raid: RaidRow): boolean {
  return raid.status === 'draft' || !raid.sent;
}

// 시드된 draft 건(r1)에 상세 제공 → 편집 데모용 (그 외 시드 행은 요약만)
const RAID_DETAILS: Record<string, RaidDetail> = {
  r1: {
    id: 'r1',
    guildId: 'g1',
    bossName: '자쿰',
    partyName: '1공대 (자쿰)',
    ppojiPct: 10,
    remainderPolicy: 'fund',
    phaseCount: DEFAULT_PHASE_COUNT,
    drops: [{ name: '', salePrice: 0, feePct: 5 }],
    expenses: [],
    participants: [
      { memberId: 'm2', guestName: null, penaltyTypeIds: [], exitPhase: null },
      { memberId: 'm1', guestName: null, penaltyTypeIds: [], exitPhase: null },
      { memberId: 'm3', guestName: null, penaltyTypeIds: [], exitPhase: null },
      { memberId: 'm5', guestName: null, penaltyTypeIds: [], exitPhase: null },
      { memberId: 'm10', guestName: null, penaltyTypeIds: [], exitPhase: null },
      { memberId: 'm8', guestName: null, penaltyTypeIds: [], exitPhase: null },
    ],
  },
};

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface RaidInput {
  /** 있으면 수정, 없으면 신규 */
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

/** 레이드 저장(신규/수정) — 목록 요약 행 + 상세를 함께 저장. 확정 시 sent=true */
export function saveRaid(guildId: string, input: RaidInput): Promise<RaidRow> {
  const list = RAIDS[guildId] ?? (RAIDS[guildId] = []);
  const sent = input.status === 'confirmed';

  let row: RaidRow;
  if (input.id) {
    const idx = list.findIndex((r) => r.id === input.id);
    row = {
      id: input.id,
      date: list[idx]?.date ?? todayISO(),
      bossName: input.bossName,
      partyName: input.partyName,
      netProfit: input.netProfit,
      participantCount: input.participantCount,
      perPerson: input.perPerson,
      status: input.status,
      sent,
    };
    if (idx >= 0) list[idx] = row;
    else list.unshift(row);
  } else {
    row = {
      id: nextId('r'),
      date: todayISO(),
      bossName: input.bossName,
      partyName: input.partyName,
      netProfit: input.netProfit,
      participantCount: input.participantCount,
      perPerson: input.perPerson,
      status: input.status,
      sent,
    };
    list.unshift(row);
  }

  RAID_DETAILS[row.id] = {
    id: row.id,
    guildId,
    bossName: input.bossName,
    partyName: input.partyName,
    ppojiPct: input.ppojiPct,
    remainderPolicy: input.remainderPolicy,
    phaseCount: input.phaseCount,
    drops: input.drops,
    expenses: input.expenses,
    participants: input.participants,
  };

  return delay(row, 200);
}

/** 레이드 상세 조회 (편집 시 폼 복원용) */
export function getRaidDetail(raidId: string): Promise<RaidDetail | null> {
  return delay(RAID_DETAILS[raidId] ?? null);
}

/** 특정 레이드 요약 조회 (편집 진입 시 상태/발송 확인용) */
export function getRaid(guildId: string, raidId: string): Promise<RaidRow | null> {
  return delay((RAIDS[guildId] ?? []).find((r) => r.id === raidId) ?? null);
}

// ─── 공대 구성 ────────────────────────────────────────────
/** 잔돈(정수 나눗셈 나머지) 처리 정책 — 공대별 설정 (명세서 §9 remainder_policy) */
export type RemainderPolicy = 'leader' | 'fund' | 'first';
export const REMAINDER_POLICY_LABEL: Record<RemainderPolicy, string> = {
  leader: '공대장 몫',
  fund: '기금 적립',
  first: '첫 참여자',
};
export const REMAINDER_POLICIES: RemainderPolicy[] = ['fund', 'leader', 'first'];

export interface Party {
  id: string;
  guildId: string;
  name: string;
  /** 공대장 (member id) */
  leaderId: string;
  /** 공대원 (member id 목록, 공대장 포함) */
  memberIds: string[];
  /** 잔돈 처리 정책 */
  remainderPolicy: RemainderPolicy;
}

const PARTIES: Record<string, Party[]> = {
  g1: [
    { id: 'p1', guildId: 'g1', name: '1공대 (자쿰)', leaderId: 'm2', memberIds: ['m2', 'm1', 'm3', 'm5', 'm10'], remainderPolicy: 'fund' },
    { id: 'p2', guildId: 'g1', name: '2공대 (혼테일)', leaderId: 'm12', memberIds: ['m12', 'm8', 'm9', 'm11'], remainderPolicy: 'leader' },
  ],
  g2: [{ id: 'p3', guildId: 'g2', name: '주말 공대', leaderId: 'm6', memberIds: ['m6', 'm7'], remainderPolicy: 'fund' }],
};

/** 공대장은 항상 공대원에 포함 */
function ensureLeader(memberIds: string[], leaderId: string): string[] {
  return memberIds.includes(leaderId) ? memberIds : [leaderId, ...memberIds];
}

export function getParties(guildId: string): Promise<Party[]> {
  return delay([...(PARTIES[guildId] ?? [])]);
}

export interface PartyInput {
  name: string;
  leaderId: string;
  memberIds: string[];
  remainderPolicy: RemainderPolicy;
}

export function createParty(guildId: string, input: PartyInput): Promise<Party> {
  const list = PARTIES[guildId] ?? (PARTIES[guildId] = []);
  const name = input.name.trim();
  if (!name) return Promise.reject(new Error('공대명을 입력해 주세요.'));
  if (!input.leaderId) return Promise.reject(new Error('공대장을 지정해 주세요.'));
  const party: Party = {
    id: nextId('p'),
    guildId,
    name,
    leaderId: input.leaderId,
    memberIds: ensureLeader(input.memberIds, input.leaderId),
    remainderPolicy: input.remainderPolicy,
  };
  list.push(party);
  return delay(party, 200);
}

export function updateParty(guildId: string, partyId: string, input: PartyInput): Promise<Party> {
  const list = PARTIES[guildId] ?? [];
  const idx = list.findIndex((p) => p.id === partyId);
  const existing = list[idx];
  if (!existing) return Promise.reject(new Error('공대를 찾을 수 없습니다.'));
  const name = input.name.trim();
  if (!name) return Promise.reject(new Error('공대명을 입력해 주세요.'));
  const updated: Party = {
    ...existing,
    name,
    leaderId: input.leaderId,
    memberIds: ensureLeader(input.memberIds, input.leaderId),
    remainderPolicy: input.remainderPolicy,
  };
  list[idx] = updated;
  return delay(updated, 200);
}

export function deleteParty(guildId: string, partyId: string): Promise<void> {
  const list = PARTIES[guildId];
  if (list) {
    const idx = list.findIndex((p) => p.id === partyId);
    if (idx >= 0) list.splice(idx, 1);
  }
  return delay(undefined, 150);
}

// ─── 보스 입장 기록 (쿨타임 타이머) ───────────────────────
/**
 * 공대가 보스에 "언제 들어갔는지"만 남기는 기록. 정산(raids)과는 별개다.
 *
 * 왜 raids 에 컬럼으로 안 붙였나: 입장했지만 정산을 안 하는 레이드(실패·꽝·파토)가
 * 있는데, 입장 시각을 raids 행에 매달면 그런 건이 통째로 누락돼 타이머가 틀린 값을
 * 보여준다. 두 기록은 생명주기가 다르므로 테이블을 분리한다.
 *
 * 쿨타임은 캐릭터 단위지만 공대가 같이 도는 운영을 전제로 (공대, 보스) 단위로 잡는다.
 * 임시 공대(RaidRow.partyName = null)는 party_id 가 없어 타이머 대상이 아니다.
 */
export interface BossEntry {
  id: string;
  guildId: string;
  partyId: string;
  bossId: string;
  /** 보스명 스냅샷 — 보스 마스터에서 삭제돼도 기록은 남는다 (raids.bossName 과 같은 정책) */
  bossName: string;
  /** ISO datetime (UTC). 표시할 때만 로컬로 바꾼다 */
  enteredAt: string;
}

/**
 * 덮어쓰지 않고 쌓는다(append-only). 취소가 "마지막 행 삭제"로 자연스럽게 풀리고,
 * 나중에 입장 이력 화면을 붙일 때 데이터 구조를 바꿀 필요가 없다.
 */
const BOSS_ENTRIES: Record<string, BossEntry[]> = {};

/** 지금으로부터 h시간 전 ISO — 목업 시드가 실제 시계를 따라가게 한다 */
function hoursAgoISO(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

/**
 * 시드 — 화면에서 "대기 중"과 "지금 가능"을 한 번에 볼 수 있게 두 상태를 섞는다.
 * 고정 날짜를 쓰면 시간이 지날수록 전부 "가능"으로 수렴해 카운트다운을 확인할 수 없다.
 */
BOSS_ENTRIES.g1 = [
  { id: 'be1', guildId: 'g1', partyId: 'p1', bossId: 'b1', bossName: '자쿰', enteredAt: hoursAgoISO(26) },
  { id: 'be2', guildId: 'g1', partyId: 'p1', bossId: 'b4', bossName: '카오스 자쿰', enteredAt: hoursAgoISO(20.8) },
  { id: 'be3', guildId: 'g1', partyId: 'p2', bossId: 'b2', bossName: '혼테일', enteredAt: hoursAgoISO(2) },
];
BOSS_ENTRIES.g2 = [
  { id: 'be4', guildId: 'g2', partyId: 'p3', bossId: 'b1', bossName: '자쿰', enteredAt: hoursAgoISO(30) },
];

/** (공대, 보스) 조합마다 가장 최근 1건 — 타이머가 필요로 하는 건 최신 상태뿐이다 */
export function getBossEntries(guildId: string): Promise<BossEntry[]> {
  const latest = new Map<string, BossEntry>();
  for (const entry of BOSS_ENTRIES[guildId] ?? []) {
    const key = `${entry.partyId}:${entry.bossId}`;
    const current = latest.get(key);
    // ISO(UTC) 문자열은 사전순 비교 = 시각순 비교
    if (!current || entry.enteredAt > current.enteredAt) latest.set(key, entry);
  }
  return delay([...latest.values()]);
}

/** 입장 기록 — "지금 입장" 버튼. 현재 시각으로 찍는다 */
export function recordBossEntry(
  guildId: string,
  partyId: string,
  bossId: string,
): Promise<BossEntry> {
  const boss = BOSSES.find((b) => b.id === bossId);
  if (!boss) return Promise.reject(new Error('보스를 찾을 수 없습니다.'));
  const party = (PARTIES[guildId] ?? []).find((p) => p.id === partyId);
  if (!party) return Promise.reject(new Error('공대를 찾을 수 없습니다.'));

  const entry: BossEntry = {
    id: nextId('be'),
    guildId,
    partyId,
    bossId,
    bossName: boss.name,
    enteredAt: new Date().toISOString(),
  };
  const list = BOSS_ENTRIES[guildId] ?? (BOSS_ENTRIES[guildId] = []);
  list.push(entry);
  logAudit(guildId, '보스 입장 기록', `${party.name} · ${boss.name}`);
  return delay(entry, 150);
}

/** 입장 시각 보정 — 버튼을 늦게 눌렀을 때 실제 입장 시각으로 되돌린다 */
export function updateBossEntry(
  guildId: string,
  entryId: string,
  enteredAt: string,
): Promise<BossEntry> {
  const list = BOSS_ENTRIES[guildId] ?? [];
  const idx = list.findIndex((e) => e.id === entryId);
  const entry = list[idx];
  if (!entry) return Promise.reject(new Error('입장 기록을 찾을 수 없습니다.'));

  const ms = new Date(enteredAt).getTime();
  if (Number.isNaN(ms)) return Promise.reject(new Error('시각 형식이 올바르지 않습니다.'));
  if (ms > Date.now()) return Promise.reject(new Error('입장 시각은 미래일 수 없습니다.'));

  const updated: BossEntry = { ...entry, enteredAt: new Date(ms).toISOString() };
  list[idx] = updated;
  logAudit(guildId, '입장 시각 수정', `${entry.bossName} → ${updated.enteredAt}`);
  return delay(updated, 150);
}

/** 입장 기록 취소 — 원클릭이라 오터치가 나온다 */
export function deleteBossEntry(guildId: string, entryId: string): Promise<void> {
  const list = BOSS_ENTRIES[guildId] ?? [];
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx >= 0) {
    const [removed] = list.splice(idx, 1);
    if (removed) logAudit(guildId, '입장 기록 취소', removed.bossName);
  }
  return delay(undefined, 120);
}

// ─── HTTP 에러 로그 (시스템 관리자) ───────────────────────
export interface ErrorLog {
  id: string;
  /** ISO datetime */
  at: string;
  method: string;
  path: string;
  status: number;
  message: string;
}

const ERROR_LOGS: ErrorLog[] = [
  { id: 'e1', at: '2026-07-24T09:12:33', method: 'POST', path: '/api/raids/confirm', status: 500, message: 'deduct_credit(): credits exhausted' },
  { id: 'e2', at: '2026-07-24T08:47:10', method: 'POST', path: '/api/discord/webhook', status: 502, message: 'Discord webhook timeout (10s)' },
  { id: 'e3', at: '2026-07-23T22:03:51', method: 'GET', path: '/api/guilds/g9/raids', status: 404, message: 'guild not found' },
  { id: 'e4', at: '2026-07-23T19:20:08', method: 'POST', path: '/api/members', status: 400, message: 'nickname already exists' },
  { id: 'e5', at: '2026-07-23T14:55:42', method: 'POST', path: '/api/credits/charge', status: 409, message: 'duplicate payment_id (idempotency)' },
  { id: 'e6', at: '2026-07-22T11:31:17', method: 'GET', path: '/api/parties', status: 500, message: 'Unexpected token in JSON' },
];

export function getErrorLogs(): Promise<ErrorLog[]> {
  return delay([...ERROR_LOGS].sort((a, b) => b.at.localeCompare(a.at)));
}

// ─── 패널티 정책 (penalty_types §9) ───────────────────────
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
  /** percent: 0~100, fixed: 메소 절대액 */
  value: number;
}

const PENALTY_TYPES: Record<string, PenaltyType[]> = {
  g1: [
    { id: 'pt1', guildId: 'g1', name: '지각', calcType: 'percent', value: 5 },
    { id: 'pt2', guildId: 'g1', name: '노쇼(몰수)', calcType: 'percent', value: 100 },
    { id: 'pt3', guildId: 'g1', name: '실수 벌금', calcType: 'fixed', value: 1_000_000 },
  ],
  g2: [{ id: 'pt4', guildId: 'g2', name: '지각', calcType: 'percent', value: 10 }],
};

export function getPenaltyTypes(guildId: string): Promise<PenaltyType[]> {
  return delay([...(PENALTY_TYPES[guildId] ?? [])]);
}

export interface PenaltyTypeInput {
  name: string;
  calcType: PenaltyCalcType;
  value: number;
}

export function addPenaltyType(guildId: string, input: PenaltyTypeInput): Promise<PenaltyType> {
  const list = PENALTY_TYPES[guildId] ?? (PENALTY_TYPES[guildId] = []);
  const name = input.name.trim();
  if (!name) return Promise.reject(new Error('패널티명을 입력해 주세요.'));
  if (list.some((p) => p.name === name)) {
    return Promise.reject(new Error(`이미 등록된 패널티입니다: ${name}`));
  }
  const type: PenaltyType = {
    id: nextId('pt'),
    guildId,
    name,
    calcType: input.calcType,
    value: input.value,
  };
  list.push(type);
  logAudit(
    guildId,
    '패널티 추가',
    `${name} (${input.calcType === 'percent' ? `${input.value}%` : `${input.value} 메소`})`,
  );
  return delay(type, 150);
}

export function deletePenaltyType(guildId: string, id: string): Promise<void> {
  const list = PENALTY_TYPES[guildId];
  if (list) {
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) {
      const [removed] = list.splice(idx, 1);
      if (removed) logAudit(guildId, '패널티 삭제', removed.name);
    }
  }
  return delay(undefined, 120);
}

// ─── 대시보드 집계 (보스별 평균 · 참여도) ─────────────────
export interface BossAverage {
  bossName: string;
  /** 1인당 평균 수령액 (메소) */
  avgPerPerson: number;
  raidCount: number;
}

/** 보스별 1인당 평균 수령액 (확정 건 기준, 평균 높은 순) — 명세서 §8 킬러 지표 */
export function getBossAverages(guildId: string): Promise<BossAverage[]> {
  const confirmed = (RAIDS[guildId] ?? []).filter((r) => r.status === 'confirmed');
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of confirmed) {
    const cur = map.get(r.bossName) ?? { sum: 0, count: 0 };
    cur.sum += r.perPerson;
    cur.count += 1;
    map.set(r.bossName, cur);
  }
  const rows = [...map.entries()]
    .map(([bossName, v]) => ({
      bossName,
      avgPerPerson: Math.round(v.sum / v.count),
      raidCount: v.count,
    }))
    .sort((a, b) => b.avgPerPerson - a.avgPerPerson);
  return delay(rows);
}

export interface MemberStat {
  memberId: string;
  nickname: string;
  job: string;
  raidCount: number;
  totalReceived: number;
}

// 참여도 목업 (실제로는 raid_participants 집계). MEMBERS 와 조인해 표시
const MEMBER_STATS: Record<string, { memberId: string; raidCount: number; totalReceived: number }[]> =
  {
    g1: [
      { memberId: 'm2', raidCount: 12, totalReceived: 78_000_000 },
      { memberId: 'm1', raidCount: 10, totalReceived: 65_000_000 },
      { memberId: 'm3', raidCount: 9, totalReceived: 58_000_000 },
      { memberId: 'm10', raidCount: 8, totalReceived: 51_000_000 },
      { memberId: 'm5', raidCount: 7, totalReceived: 44_000_000 },
      { memberId: 'm8', raidCount: 6, totalReceived: 39_000_000 },
      { memberId: 'm9', raidCount: 5, totalReceived: 31_000_000 },
      { memberId: 'm4', raidCount: 5, totalReceived: 30_000_000 },
      { memberId: 'm11', raidCount: 4, totalReceived: 24_000_000 },
      { memberId: 'm12', raidCount: 3, totalReceived: 19_000_000 },
    ],
    g2: [
      { memberId: 'm6', raidCount: 2, totalReceived: 8_600_000 },
      { memberId: 'm7', raidCount: 2, totalReceived: 7_200_000 },
    ],
  };

/** 길드원 참여도·누적 수령액 (참여 많은 순) — 명세서 §8 */
export function getMemberStats(guildId: string): Promise<MemberStat[]> {
  const members = MEMBERS[guildId] ?? [];
  const rows = (MEMBER_STATS[guildId] ?? [])
    .map((s) => {
      const m = members.find((x) => x.id === s.memberId);
      return {
        memberId: s.memberId,
        nickname: m?.nickname ?? '알수없음',
        job: m?.job ?? '',
        raidCount: s.raidCount,
        totalReceived: s.totalReceived,
      };
    })
    .sort((a, b) => b.raidCount - a.raidCount);
  return delay(rows);
}

// ─── 길드 초대 (목업) ─────────────────────────────────────
export interface Invite {
  code: string;
  guildId: string;
  role: MemberRole;
}

function genInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return `MW-${s}`;
}

// 데모용 시드 초대 코드 (온보딩에서 바로 테스트 가능)
const INVITES: Invite[] = [{ code: 'MW-DEMO12', guildId: 'g2', role: 'MANAGER' }];

/** 초대 코드 생성 (길마) */
export function createInvite(guildId: string, role: MemberRole): Promise<Invite> {
  const invite: Invite = { code: genInviteCode(), guildId, role };
  INVITES.push(invite);
  logAudit(guildId, '초대 코드 생성', `${ROLE_LABEL[role]} · ${invite.code}`);
  return delay(invite, 150);
}

/** 초대 코드 확인 (온보딩) — 유효하면 대상 길드/역할 반환 */
export function redeemInvite(code: string): Promise<Invite | null> {
  const normalized = code.trim().toUpperCase();
  return delay(INVITES.find((i) => i.code === normalized) ?? null, 200);
}

// ── [BE TODO] 변경 이력(audit) — 서버 audit_logs 테이블로 구현 ─────────────
// FE 목업은 비활성화(주석). 아래 logAudit() 호출 지점들이 "여기서 감사 이벤트가
// 발생한다"는 마커다. BE에서 각 지점을 audit_logs INSERT 로 대체할 것.
//
//   export interface AuditEntry { id: string; at: string; action: string; detail: string }
//   const AUDIT_LOGS: Record<string, AuditEntry[]> = {};
//   export function recordAudit(guildId, action, detail): void  // 클라이언트발 기록(예: 서버명 변경)
//   export function getAuditLogs(guildId): Promise<AuditEntry[]>
//
/** [BE TODO] 변경 이력 기록 지점 — 현재 no-op. 서버 audit_logs INSERT 로 구현. */
function logAudit(_guildId: string, _action: string, _detail: string): void {
  // BE: INSERT INTO audit_logs (guild_id, actor, action, detail, created_at) VALUES (...)
}

// ─── 길드 계정 권한 (구글 로그인 유저, 목업) ──────────────
// 길드원(MEMBERS, 정산 명단)과 별개로, 서비스에 로그인해 길드에 참여한 계정의 권한.
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

const ACCOUNTS: Record<string, GuildAccount[]> = {
  g1: [
    { id: 'a1', guildId: 'g1', email: 'master@gmail.com', name: '길드마스터', role: 'OWNER' },
    { id: 'a2', guildId: 'g1', email: 'vice@gmail.com', name: '부길마', role: 'ADMIN' },
    { id: 'a3', guildId: 'g1', email: 'raidlead@gmail.com', name: '공대장A', role: 'MEMBER' },
  ],
  g2: [{ id: 'a4', guildId: 'g2', email: 'moon@gmail.com', name: '달빛', role: 'OWNER' }],
};

function ownerCount(list: GuildAccount[]): number {
  return list.filter((a) => a.role === 'OWNER').length;
}

export function getAccounts(guildId: string): Promise<GuildAccount[]> {
  return delay([...(ACCOUNTS[guildId] ?? [])]);
}

/** 계정 권한 변경 — 마지막 관리자(OWNER)는 강등 불가 */
export function updateAccountRole(
  guildId: string,
  accountId: string,
  role: AccountRole,
): Promise<GuildAccount> {
  const list = ACCOUNTS[guildId] ?? [];
  const idx = list.findIndex((a) => a.id === accountId);
  const account = list[idx];
  if (!account) return Promise.reject(new Error('계정을 찾을 수 없습니다.'));
  if (account.role === 'OWNER' && role !== 'OWNER' && ownerCount(list) <= 1) {
    return Promise.reject(
      new Error('관리자는 최소 1명 필요합니다. 다른 관리자를 먼저 임명하세요.'),
    );
  }
  const updated: GuildAccount = { ...account, role };
  list[idx] = updated;
  logAudit(
    guildId,
    '권한 변경',
    `${account.name}: ${ACCOUNT_ROLE_LABEL[account.role]} → ${ACCOUNT_ROLE_LABEL[role]}`,
  );
  return delay(updated, 150);
}

/** 계정 삭제(내보내기) — 마지막 관리자는 삭제 불가 */
export function removeAccount(guildId: string, accountId: string): Promise<void> {
  const list = ACCOUNTS[guildId] ?? [];
  const idx = list.findIndex((a) => a.id === accountId);
  const account = list[idx];
  if (!account) return delay(undefined, 100);
  if (account.role === 'OWNER' && ownerCount(list) <= 1) {
    return Promise.reject(new Error('마지막 관리자는 삭제할 수 없습니다.'));
  }
  list.splice(idx, 1);
  logAudit(guildId, '계정 삭제', `${account.name} (${account.email})`);
  return delay(undefined, 120);
}
