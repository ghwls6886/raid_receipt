import { Pencil, UserMinus, Sword } from 'lucide-react';
import type { Character } from '@/features/helper/api';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface CharacterCardProps {
  character: Character;
  onEdit: (character: Character) => void;
  onDeactivate: (character: Character) => void;
}

export function CharacterCard({ character, onEdit, onDeactivate }: CharacterCardProps) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="bg-bg-muted text-text-tertiary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <Sword className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-text-primary truncate text-sm font-semibold">
            {character.nickname}
          </span>
          <Badge tone="brand">{character.jobCategory}</Badge>
        </div>

        <p className="text-text-secondary mt-0.5 text-xs">
          {character.job} · Lv.{character.level} · {character.serverName}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          aria-label="캐릭터 수정"
          onClick={() => onEdit(character)}
          size="sm"
          variant="ghost"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          aria-label="캐릭터 비활성화"
          className={cn('text-error-600 hover:text-error-700')}
          onClick={() => onDeactivate(character)}
          size="sm"
          variant="ghost"
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
