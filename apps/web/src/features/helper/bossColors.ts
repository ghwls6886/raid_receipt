/**
 * 보스별 테마 색 — 타이머 카드를 한눈에 구분하기 위한 표시 전용 값.
 *
 * 키는 0012 가 넣은 보스 슬러그다. 마스터에 없는 보스(관리자가 화면에서 추가한
 * boss-xxxxxxxx)는 기본 회색으로 떨어진다 — 색이 없다고 기능이 막히지는 않는다.
 *
 * **색상 배정 원칙: 계열이 아니라 색상환으로 가른다.**
 * 처음엔 자쿰/카오스 자쿰을 같은 amber 계열로 묶었는데(농도만 다르게), 카드가 나란히
 * 놓이면 둘 다 "주황"으로 읽혀 구분이 안 됐다. 이름에 이미 "카오스"가 붙어 있으니
 * 색까지 같은 계열일 필요가 없다. 지금은 여덟 종이 서로 다른 색상환 위치를 쓴다.
 *
 * border 는 500 대 채도를 쓴다. 카드 왼쪽의 굵은 띠(border-l-4)가 제일 강한 신호라
 * 여기서 흐리면 나머지가 아무리 달라도 눈에 안 들어온다.
 *
 * Tailwind 는 소스에 문자열로 등장하는 클래스만 번들에 넣으므로, 여기 값들은
 * 조합해서 만들지 말고 완성된 클래스명 그대로 둘 것.
 */
interface BossColor {
  /** 아이콘 배경 (연한 틴트) */
  bg: string;
  /** 아이콘·강조 텍스트 */
  text: string;
  /** 카드 테두리 — 왼쪽 굵은 띠가 주 신호다 */
  border: string;
  /** 그룹 헤더의 점 */
  dot: string;
}

const BOSS_COLORS: Record<string, BossColor> = {
  zakum: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-500',
    dot: 'bg-amber-500',
  },
  horntail: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-500',
    dot: 'bg-red-500',
  },
  pinkbean: {
    bg: 'bg-pink-100',
    text: 'text-pink-700',
    border: 'border-pink-500',
    dot: 'bg-pink-500',
  },
  papulatus: {
    bg: 'bg-sky-100',
    text: 'text-sky-700',
    border: 'border-sky-500',
    dot: 'bg-sky-500',
  },
  'chaos-zakum': {
    bg: 'bg-violet-100',
    text: 'text-violet-700',
    border: 'border-violet-500',
    dot: 'bg-violet-500',
  },
  'chaos-horntail': {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-500',
    dot: 'bg-emerald-500',
  },
  'chaos-pinkbean': {
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    border: 'border-indigo-500',
    dot: 'bg-indigo-500',
  },
  'chaos-papulatus': {
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    border: 'border-teal-500',
    dot: 'bg-teal-500',
  },
};

const DEFAULT_BOSS_COLOR: BossColor = {
  bg: 'bg-bg-muted',
  text: 'text-text-secondary',
  border: 'border-border-default',
  dot: 'bg-text-tertiary',
};

export function getBossColor(bossId: string): BossColor {
  return BOSS_COLORS[bossId] ?? DEFAULT_BOSS_COLOR;
}
