/**
 * 구인 목록의 선택 상태 (MERGE_PLAN §7 4단계).
 *
 * 서버·캐릭터를 글 볼 때마다 다시 고르게 하면 성가시다. 상세를 다녀와도,
 * 새로고침해도 유지되도록 localStorage 에 남긴다.
 *
 * useCharacterStore 와 별개다 — 저쪽은 helper 화면의 "지금 보는 캐릭터"고,
 * 여기는 "구인에 쓸 캐릭터"라 선택한 서버와 맞아야 한다는 제약이 더 붙는다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecruitState {
  selectedCategory: string;
  /** 목록 필터. 빈 문자열은 "아직 정해지지 않음"이며 화면에서 첫 서버로 채운다 */
  selectedServer: string;
  /** 글 작성·신청에 쓸 캐릭터 */
  selectedCharacterId: string;
  setSelectedCategory: (category: string) => void;
  setSelectedServer: (server: string) => void;
  setSelectedCharacterId: (characterId: string) => void;
}

export const useRecruitStore = create<RecruitState>()(
  persist(
    (set) => ({
      selectedCategory: 'all',
      selectedServer: '',
      selectedCharacterId: '',
      setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
      setSelectedServer: (selectedServer) => set({ selectedServer }),
      setSelectedCharacterId: (selectedCharacterId) => set({ selectedCharacterId }),
    }),
    { name: 'raid-recruit-finder' },
  ),
);
