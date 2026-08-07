/**
 * 매너온도 도메인 — 상수 · 타입 · 순수 계산 (MERGE_PLAN §7 4단계)
 *
 * 파티가 해체되는 순간(해산 · 탈퇴 · 퇴장)에 그때 함께 있던 파티원끼리
 * 상호평가를 남기고, 그 결과가 매너온도에 누적된다.
 *
 * **여기 있는 숫자는 0015 의 submit_recruit_rating 과 반드시 같아야 한다.**
 * 온도를 실제로 갱신하는 건 DB 쪽이고 이 파일은 화면 표시용이다.
 * 한쪽만 고치면 화면과 저장값이 어긋난다.
 */

// ─── 온도 ────────────────────────────────────────────────────────

/** 가입 시 부여되는 기본 매너온도 (0015 manner_profiles.temperature 기본값) */
export const MANNER_TEMP_INITIAL = 30;
export const MANNER_TEMP_MIN = 0;
export const MANNER_TEMP_MAX = 99;

export type RatingValue = 'LIKE' | 'NEUTRAL' | 'DISLIKE';

/** 평가 1건이 매너온도에 주는 변화량 */
export const MANNER_TEMP_DELTA: Record<RatingValue, number> = {
  LIKE: 0.5,
  NEUTRAL: 0,
  DISLIKE: -0.5,
};

export const RATING_LABELS: Record<RatingValue, string> = {
  LIKE: '좋아요',
  NEUTRAL: '보통이에요',
  DISLIKE: '싫어요',
};

/** 부동소수점 누적 오차를 막기 위해 소수 첫째 자리로 고정한다. */
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampTemperature(value: number): number {
  return roundToTenth(Math.min(MANNER_TEMP_MAX, Math.max(MANNER_TEMP_MIN, value)));
}

export type TemperatureBand = 'cold' | 'cool' | 'normal' | 'warm' | 'hot';

export interface BandSpec {
  /** 이 구간의 하한(이상) */
  min: number;
  band: TemperatureBand;
  label: string;
  /** 온도 뱃지 배경/글자 */
  chip: string;
  /** 게이지 채움 */
  fill: string;
}

/** 하한이 0이라 어떤 온도에도 매치되는 최저 구간. find() 의 폴백으로도 쓴다. */
const COLD_BAND: BandSpec = {
  min: MANNER_TEMP_MIN,
  band: 'cold',
  label: '주의가 필요해요',
  chip: 'bg-sky-100 text-sky-800',
  fill: 'bg-sky-500',
};

/** 높은 구간이 앞에 오도록 정렬 — find() 가 첫 매치를 그대로 쓴다. */
const BAND_SPECS: readonly BandSpec[] = [
  {
    min: 55,
    band: 'hot',
    label: '아주 따뜻해요',
    chip: 'bg-orange-100 text-orange-800',
    fill: 'bg-orange-500',
  },
  {
    min: 40,
    band: 'warm',
    label: '따뜻해요',
    chip: 'bg-amber-100 text-amber-800',
    fill: 'bg-amber-500',
  },
  {
    min: 30,
    band: 'normal',
    label: '보통이에요',
    chip: 'bg-emerald-100 text-emerald-800',
    fill: 'bg-emerald-500',
  },
  {
    min: 20,
    band: 'cool',
    label: '조금 차가워요',
    chip: 'bg-slate-200 text-slate-700',
    fill: 'bg-slate-400',
  },
  COLD_BAND,
];

export function getTemperatureBand(temperature: number): BandSpec {
  const clamped = clampTemperature(temperature);
  return BAND_SPECS.find((spec) => clamped >= spec.min) ?? COLD_BAND;
}

export function formatTemperature(temperature: number): string {
  return `${clampTemperature(temperature).toFixed(1)}°C`;
}

/** 게이지 렌더링용 0~100 비율 */
export function temperaturePercent(temperature: number): number {
  const clamped = clampTemperature(temperature);
  return ((clamped - MANNER_TEMP_MIN) / (MANNER_TEMP_MAX - MANNER_TEMP_MIN)) * 100;
}

// ─── 스티커 ──────────────────────────────────────────────────────

export type StickerTone = 'positive' | 'negative';

export interface MannerSticker {
  id: string;
  label: string;
  emoji: string;
  tone: StickerTone;
}

/**
 * 스티커는 평가에 종속된다 — 좋아요를 고르면 긍정 스티커만, 싫어요를 고르면
 * 부정 스티커만 노출된다. "친절해요 + 스공 사기꾼" 같은 모순된 조합이
 * 애초에 만들어지지 않도록 하기 위한 제약이다.
 */
export const MANNER_STICKERS: readonly MannerSticker[] = [
  // 긍정
  { id: 'kind', label: '친절해요', emoji: '😊', tone: 'positive' },
  { id: 'fair_price', label: '합리적인 가격', emoji: '💰', tone: 'positive' },
  { id: 'fast', label: '엄청난 스피드', emoji: '⚡', tone: 'positive' },
  { id: 'skilled', label: '실력이 좋아요', emoji: '🎯', tone: 'positive' },
  { id: 'punctual', label: '시간 약속을 잘 지켜요', emoji: '⏰', tone: 'positive' },
  { id: 'spec_honest', label: '스펙이 정확해요', emoji: '✅', tone: 'positive' },
  // 부정
  { id: 'unkind', label: '불친절해요', emoji: '😠', tone: 'negative' },
  { id: 'stat_liar', label: '스공 사기꾼', emoji: '🤥', tone: 'negative' },
  { id: 'afk', label: '잠수탔어요', emoji: '💤', tone: 'negative' },
  { id: 'no_show', label: '약속을 안 지켜요', emoji: '🚫', tone: 'negative' },
  { id: 'greedy', label: '아이템을 독식해요', emoji: '🪤', tone: 'negative' },
  { id: 'rude', label: '말이 거칠어요', emoji: '💢', tone: 'negative' },
];

/** 한 번의 평가에서 고를 수 있는 스티커 최대 개수 */
export const MAX_STICKERS_PER_RATING = 3;

const STICKER_BY_ID = new Map(MANNER_STICKERS.map((s) => [s.id, s]));

export function getSticker(id: string): MannerSticker | undefined {
  return STICKER_BY_ID.get(id);
}

/** 평가값에 대응하는 스티커 톤. 보통(NEUTRAL)은 스티커를 쓰지 않는다. */
export function stickerToneFor(value: RatingValue): StickerTone | null {
  if (value === 'LIKE') return 'positive';
  if (value === 'DISLIKE') return 'negative';
  return null;
}

export function stickersFor(value: RatingValue): readonly MannerSticker[] {
  const tone = stickerToneFor(value);
  if (!tone) return [];
  return MANNER_STICKERS.filter((s) => s.tone === tone);
}

// ─── 평가 세션 ───────────────────────────────────────────────────

/**
 * 평가 세션이 열린 계기.
 *
 * 원본은 2종이었는데 0015 의 trigger check 는 MEMBER_KICKED 를 포함한 3종이다.
 * 빠뜨리면 퇴장으로 생긴 세션에서 라벨이 undefined 로 뜬다.
 */
export type RatingTrigger = 'PARTY_CLOSED' | 'MEMBER_LEFT' | 'MEMBER_KICKED';

export const RATING_TRIGGER_LABELS: Record<RatingTrigger, string> = {
  PARTY_CLOSED: '파티 해산',
  MEMBER_LEFT: '파티원 탈퇴',
  MEMBER_KICKED: '파티원 퇴장',
};

/** 평가 가능 기간 (일). 0015 rating_sessions.expires_at 기본값과 같아야 한다. */
export const RATING_WINDOW_DAYS = 7;
