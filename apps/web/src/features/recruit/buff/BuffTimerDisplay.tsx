import { Play, Square, Volume2 } from 'lucide-react';
import { useBuffCallStore } from '@/stores/useBuffCallStore';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { BuffSkillCard } from './BuffSkillCard';

interface BuffTimerDisplayProps {
  /** 파티장만 true — 시작/정지와 스킬 편집 권한 */
  canEdit: boolean;
  /** 오디오가 아직 해금되지 않은 파티원에게 안내 버튼을 띄운다 */
  needsAudioUnlock?: boolean;
  onStart: () => void;
  onStop: () => void;
  onUnlockAudio?: () => void;
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
}

/**
 * 타이머 표시와 조작 UI.
 *
 * 실행 상태의 원본은 recruit_posts.buff_started_at 이고 BuffCallPanel 이
 * 관리한다. 워커는 runner.ts 싱글톤이, 알림 재생은 App 에 상주하는
 * BuffTimerHost 가 맡는다. 이 컴포넌트가 사라져도 타이머는 계속 돈다.
 */
export function BuffTimerDisplay({
  canEdit,
  needsAudioUnlock = false,
  onStart,
  onStop,
  onUnlockAudio,
  onToggle,
  onRemove,
}: BuffTimerDisplayProps) {
  const skills = useBuffCallStore((s) => s.skills);
  const isRunning = useBuffCallStore((s) => s.isRunning);
  const startedAt = useBuffCallStore((s) => s.startedAt);

  const hasSkills = skills.length > 0;
  const hasEnabled = skills.some((s) => s.enabled);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Button
            className="h-12 gap-2 px-6 text-base font-semibold"
            disabled={!hasEnabled}
            onClick={isRunning ? onStop : onStart}
            variant={isRunning ? 'danger' : 'primary'}
          >
            {isRunning ? (
              <>
                <Square className="h-5 w-5" />
                중지
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                시작
              </>
            )}
          </Button>
        ) : (
          // 파티원은 파티장이 시작한 타이머를 따라간다.
          // 브라우저 자동재생 정책상 소리는 본인 클릭이 한 번 필요하다.
          needsAudioUnlock &&
          isRunning && (
            <Button className="h-12 gap-2 px-6 text-base font-semibold" onClick={onUnlockAudio}>
              <Volume2 className="h-5 w-5" />
              소리 켜기
            </Button>
          )
        )}

        {isRunning && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="bg-success-500 absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
              <span className="bg-success-500 relative inline-flex h-2.5 w-2.5 rounded-full" />
            </span>
            <span className="text-text-secondary text-sm font-medium">
              {canEdit ? '실행 중' : '파티장이 실행 중'}
            </span>
          </div>
        )}

        {!isRunning && !canEdit && (
          <span className="text-text-tertiary text-sm">파티장이 시작하면 함께 울립니다.</span>
        )}

        {/* 시작 버튼이 왜 안 눌리는지 이유를 말해 준다 */}
        {canEdit && hasSkills && !hasEnabled && (
          <span className="text-text-tertiary text-sm">활성화된 스킬이 없습니다</span>
        )}
      </div>

      {hasSkills && (
        <div
          className={cn(
            'grid gap-3',
            skills.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2',
          )}
        >
          {skills.map((skill) => (
            <BuffSkillCard
              key={skill.id}
              isRunning={isRunning}
              onRemove={canEdit ? onRemove : undefined}
              onToggle={canEdit ? onToggle : undefined}
              skill={skill}
              startedAt={startedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
