/**
 * 선택된 캐릭터 — 개인 도구 화면들이 공유한다 (MERGE_PLAN §7 2단계).
 *
 * 숙제·보스추적·버프콜이 전부 "지금 보고 있는 캐릭터" 하나를 기준으로 그린다.
 * 화면을 옮겨 다녀도, 새로고침해도 유지돼야 해서 localStorage 에 남긴다.
 * useGuildStore 가 currentGuildId 를 다루는 것과 같은 역할이다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CharacterState {
  selectedCharacterId: string | null;
  setSelectedCharacter: (id: string | null) => void;
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set) => ({
      selectedCharacterId: null,
      setSelectedCharacter: (id) => set({ selectedCharacterId: id }),
    }),
    { name: 'raid-selected-character' },
  ),
);
