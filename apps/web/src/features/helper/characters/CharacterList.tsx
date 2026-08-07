import { Users } from 'lucide-react';
import type { Character } from '@/features/helper/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharacterCard } from '@/features/helper/characters/CharacterCard';

interface CharacterListProps {
  characters: Character[];
  onEdit: (character: Character) => void;
  onDeactivate: (character: Character) => void;
}

export function CharacterList({ characters, onEdit, onDeactivate }: CharacterListProps) {
  if (characters.length === 0) {
    return (
      <EmptyState
        Icon={Users}
        description="캐릭터를 추가하면 보스 입장 기록과 숙제를 캐릭터별로 관리할 수 있습니다."
        title="등록된 캐릭터가 없습니다"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {characters.map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          onDeactivate={onDeactivate}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
