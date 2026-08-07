import { useEffect } from 'react';
import type { Character } from '@/features/helper/api';
import { useCharacterStore } from '@/stores/useCharacterStore';
import { Select } from '@/components/ui/Select';

interface CharacterSelectorProps {
  characters: Character[];
  className?: string;
}

/**
 * 캐릭터 전환 드롭다운 — 숙제·보스추적·버프콜이 공유한다 (MERGE_PLAN §7 2단계 후속).
 * 선택값은 useCharacterStore 가 localStorage 에 들고 있어 화면을 옮겨도 유지된다.
 */
export function CharacterSelector({ characters, className }: CharacterSelectorProps) {
  const selectedCharacterId = useCharacterStore((s) => s.selectedCharacterId);
  const setSelectedCharacter = useCharacterStore((s) => s.setSelectedCharacter);

  // 선택값이 비었거나, 저장된 캐릭터가 비활성화로 목록에서 사라졌으면 첫 캐릭터로 되돌린다.
  // 이게 없으면 캐릭터를 비활성화한 뒤 화면이 빈 상태로 멈춘다.
  useEffect(() => {
    if (characters.length === 0) {
      if (selectedCharacterId !== null) setSelectedCharacter(null);
      return;
    }
    const stillValid = characters.some((c) => c.id === selectedCharacterId);
    if (!stillValid) setSelectedCharacter(characters[0]!.id);
  }, [characters, selectedCharacterId, setSelectedCharacter]);

  if (characters.length === 0) return null;

  return (
    <Select
      aria-label="캐릭터 선택"
      className={className}
      onChange={(e) => setSelectedCharacter(e.target.value || null)}
      value={selectedCharacterId ?? ''}
    >
      {characters.map((character) => (
        <option key={character.id} value={character.id}>
          {character.nickname} (Lv.{character.level} {character.job})
        </option>
      ))}
    </Select>
  );
}
