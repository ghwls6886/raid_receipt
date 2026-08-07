/** 자주 쓰는 버프 — 매번 직접 입력하지 않고 한 번에 담을 수 있게 */
export interface BuffSkillPreset {
  id: string;
  name: string;
  intervalSec: number;
  alertText: string;
}

/**
 * 지속시간이 아니라 **다시 걸어 줄 주기**다. 메이플 워리어만 15분이고
 * 나머지는 2분으로, 실제 지속시간보다 조금 짧게 잡혀 있다 —
 * 끊긴 뒤에 알려 주면 이미 늦기 때문이다.
 */
export const DEFAULT_BUFF_PRESETS: readonly BuffSkillPreset[] = [
  { id: 'holy-symbol', name: '홀리심볼', intervalSec: 120, alertText: '심콜~' },
  { id: 'hyper-body', name: '하이퍼바디', intervalSec: 120, alertText: '하바콜~' },
  { id: 'sharp-eyes', name: '샤프아이즈', intervalSec: 120, alertText: '샤프콜~' },
  { id: 'adv-bless', name: '어드밴스드 블레스', intervalSec: 120, alertText: '블레스콜~' },
  { id: 'maple-warrior', name: '메이플 워리어', intervalSec: 900, alertText: '메워콜~' },
];

/** 스킬 인스턴스 id — 같은 프리셋을 두 번 담아도 서로 다른 항목이 된다 */
export function makeBuffSkillId(): string {
  return `buff-${crypto.randomUUID().slice(0, 8)}`;
}
