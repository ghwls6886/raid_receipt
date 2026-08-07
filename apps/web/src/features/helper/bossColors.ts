/**
 * 보스별 테마 색 — 타이머 카드를 한눈에 구분하기 위한 표시 전용 값.
 *
 * 키는 0012 가 넣은 보스 슬러그다. 마스터에 없는 보스(관리자가 화면에서 추가한
 * boss-xxxxxxxx)는 기본 회색으로 떨어진다 — 색이 없다고 기능이 막히지는 않는다.
 *
 * Tailwind 는 소스에 문자열로 등장하는 클래스만 번들에 넣으므로, 여기 값들은
 * 조합해서 만들지 말고 완성된 클래스명 그대로 둘 것.
 */
interface BossColor {
  bg: string;
  text: string;
  border: string;
}

const BOSS_COLORS: Record<string, BossColor> = {
  zakum: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  horntail: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  papulatus: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  'chaos-zakum': { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  'chaos-horntail': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  pinkbean: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  'chaos-pinkbean': { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  'chaos-papulatus': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
};

const DEFAULT_BOSS_COLOR: BossColor = {
  bg: 'bg-bg-muted',
  text: 'text-text-secondary',
  border: 'border-border-subtle',
};

export function getBossColor(bossId: string): BossColor {
  return BOSS_COLORS[bossId] ?? DEFAULT_BOSS_COLOR;
}
