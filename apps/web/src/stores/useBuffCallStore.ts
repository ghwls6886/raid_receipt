import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BuffSkill {
  id: string;
  name: string;
  /** 주기 (초) */
  intervalSec: number;
  /** 음성으로 읽어 줄 문구 */
  alertText: string;
  enabled: boolean;
}

export interface BuffPreset {
  id: string;
  name: string;
  skills: BuffSkill[];
}

interface BuffCallState {
  /** 지금 타이머가 쓰는 작업 목록 — 파티의 buff_skills 로 채워진다 */
  skills: BuffSkill[];
  /** 개인 보관함 */
  presets: BuffPreset[];
  isRunning: boolean;
  /** 주기의 기준 시각 (epoch ms). 파티의 buff_started_at 을 따라간다 */
  startedAt: number | null;

  /** 0~1 */
  volume: number;
  /** 0.5~2.0 */
  rate: number;

  setSkills: (skills: BuffSkill[]) => void;
  addSkill: (skill: BuffSkill) => void;
  removeSkill: (id: string) => void;
  toggleSkill: (id: string) => void;

  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;

  setVolume: (volume: number) => void;
  setRate: (rate: number) => void;

  /**
   * 파티가 공유하는 기준 시각으로 실행 상태를 맞춘다.
   * 파티 화면에서는 각자 시작하지 않고 파티장이 정한 시각을 따라간다.
   */
  syncTimer: (startedAt: number | null) => void;
}

/** 프리셋 id — 전역 카운터는 새로고침 때 0으로 돌아가 기존 id 와 부딪힌다 */
function makePresetId(): string {
  return `preset-${crypto.randomUUID().slice(0, 8)}`;
}

export const useBuffCallStore = create<BuffCallState>()(
  persist(
    (set, get) => ({
      skills: [],
      presets: [],
      isRunning: false,
      startedAt: null,
      volume: 1,
      rate: 1,

      setSkills: (skills) => set({ skills }),
      addSkill: (skill) => set((s) => ({ skills: [...s.skills, skill] })),
      removeSkill: (id) => set((s) => ({ skills: s.skills.filter((sk) => sk.id !== id) })),
      toggleSkill: (id) =>
        set((s) => ({
          skills: s.skills.map((sk) => (sk.id === id ? { ...sk, enabled: !sk.enabled } : sk)),
        })),

      savePreset: (name) => {
        // 스킬을 복사해서 담는다. 참조를 그대로 넣으면 프리셋과 현재 목록이
        // 같은 객체를 가리켜, 나중에 스킬을 켜고 끄면 저장해 둔 프리셋까지 바뀐다.
        const preset: BuffPreset = {
          id: makePresetId(),
          name,
          skills: get().skills.map((s) => ({ ...s })),
        };
        set((s) => ({ presets: [...s.presets, preset] }));
      },
      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (preset) set({ skills: preset.skills.map((s) => ({ ...s })) });
      },
      deletePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setRate: (rate) => set({ rate: Math.min(2, Math.max(0.5, rate)) }),

      syncTimer: (startedAt) => set({ isRunning: startedAt !== null, startedAt }),
    }),
    {
      name: 'raid-buff-call',
      /**
       * presets 와 오디오 설정만 저장한다.
       *
       * skills 는 "지금 타이머가 쓰는 작업 목록"이고 파티의 buff_skills 로
       * 채워지므로, 저장하면 다른 파티에 들어갔을 때 이전 파티의 스킬이
       * 잠깐 보인다. isRunning/startedAt 도 파티가 원본이라 저장하면
       * 새로고침 직후 "실행 중"이 잘못 뜬다.
       */
      partialize: (state) => ({
        presets: state.presets,
        volume: state.volume,
        rate: state.rate,
      }),
    },
  ),
);
