import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Volume2 } from 'lucide-react';
import {
  updateBuffSkills,
  updateBuffTimer,
  type RecruitBuffSkill,
  type RecruitPost,
} from '@/features/recruit/api';
import { useBuffCallStore } from '@/stores/useBuffCallStore';
import { toast } from '@/stores/useToastStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BuffCallModal } from './BuffCallModal';
import { BuffTimerDisplay } from './BuffTimerDisplay';
import { resumeAudio } from './audio';
import { startBuffTimers, stopBuffTimers } from './runner';
import { useAudioAlert, useNotification } from './useAudioAlert';

interface BuffCallPanelProps {
  post: RecruitPost;
  /** 파티장만 true — 스킬 편집과 시작/정지 권한 */
  canEdit: boolean;
}

/**
 * 파티방에 상시 노출되는 심콜 카드.
 *
 * 스킬 구성(buff_skills)과 실행 시각(buff_started_at)이 **둘 다 글에 있고
 * 파티장만 쓴다.** 파티원은 그 값을 따라가기만 한다. 같은 기준 시각을
 * 워커에 넘기므로 전원의 주기가 정렬돼 같은 순간에 울린다.
 *
 * 개인 설정으로 두면 각자 시작 시점이 달라 콜이 몇 초씩 어긋난다.
 */
export function BuffCallPanel({ post, canEdit }: BuffCallPanelProps) {
  const queryClient = useQueryClient();

  const [isSetupOpen, setSetupOpen] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const skills = useBuffCallStore((s) => s.skills);
  const isRunning = useBuffCallStore((s) => s.isRunning);
  const setSkills = useBuffCallStore((s) => s.setSkills);
  const syncTimer = useBuffCallStore((s) => s.syncTimer);

  const { init: initAudio } = useAudioAlert();
  const { requestPermission } = useNotification();

  const startedAtMs = post.buffStartedAt ? Date.parse(post.buffStartedAt) : null;

  const invalidatePost = () => {
    void queryClient.invalidateQueries({ queryKey: ['recruitPost', post.id] });
  };

  const skillsMutation = useMutation({
    mutationFn: (next: RecruitBuffSkill[]) => updateBuffSkills(post.id, next),
    onSuccess: invalidatePost,
    onError: (e: Error) => toast.error(e.message || '스킬 저장에 실패했습니다.'),
  });

  const timerMutation = useMutation({
    mutationFn: (startedAt: string | null) => updateBuffTimer(post.id, startedAt),
    onSuccess: invalidatePost,
    onError: (e: Error) => toast.error(e.message || '타이머 조작에 실패했습니다.'),
  });

  // 파티 설정 → 작업 목록. 실행 중에는 갈아끼우지 않는다 — 돌고 있는
  // 타이머와 목록이 어긋나면 어떤 스킬이 울린 건지 알 수 없게 된다.
  useEffect(() => {
    if (isRunning) return;
    setSkills(post.buffSkills.map((s) => ({ ...s })));
  }, [post.buffSkills, isRunning, setSkills]);

  // 파티가 정한 실행 시각을 그대로 따라간다.
  useEffect(() => {
    syncTimer(startedAtMs);

    if (startedAtMs === null) {
      stopBuffTimers();
      return;
    }

    const enabled = post.buffSkills.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    startBuffTimers(enabled, startedAtMs);
  }, [startedAtMs, post.buffSkills, syncTimer]);

  /** 파티장 편집 — 화면과 DB 를 함께 갱신한다 */
  const persist = (next: RecruitBuffSkill[]) => {
    setSkills(next.map((s) => ({ ...s })));
    skillsMutation.mutate(next);
  };

  const handleToggle = (id: string) =>
    persist(skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));

  const handleRemove = (id: string) => persist(skills.filter((s) => s.id !== id));

  /** 팝업에서 추가한 스킬은 스토어에만 들어가므로, 닫을 때 DB 로 올린다 */
  const handleSetupClose = () => {
    setSetupOpen(false);
    persist(skills.map((s) => ({ ...s })));
  };

  /** 브라우저 자동재생 정책 — 유저 클릭 안에서 한 번 열어 줘야 소리가 난다 */
  const unlockAudio = () => {
    initAudio();
    resumeAudio();
    void requestPermission();
    setAudioUnlocked(true);
  };

  const handleStart = () => {
    unlockAudio(); // 시작 클릭이 곧 유저 제스처
    timerMutation.mutate(new Date().toISOString());
  };

  const handleStop = () => {
    timerMutation.mutate(null);
  };

  const enabledCount = skills.filter((s) => s.enabled).length;
  const hasSkills = skills.length > 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-bg-muted flex h-7 w-7 items-center justify-center rounded-lg">
            <Volume2 className="text-text-secondary h-4 w-4" />
          </span>
          <h3 className="text-text-primary text-sm font-semibold">심콜</h3>
          {hasSkills && (
            <span className="text-text-tertiary text-xs tabular-nums">
              {enabledCount}/{skills.length} 활성
            </span>
          )}
          {!canEdit && (
            <span className="text-text-tertiary inline-flex items-center gap-1 text-xs">
              <Lock className="h-3 w-3" /> 파티장 설정
            </span>
          )}
        </div>

        {canEdit && (
          <Button
            disabled={isRunning}
            onClick={() => setSetupOpen(true)}
            size="sm"
            variant="secondary"
          >
            <Plus className="h-4 w-4" /> 스킬 추가
          </Button>
        )}
      </div>

      {!hasSkills ? (
        <div className="border-border-subtle rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-text-secondary text-sm">등록된 버프 스킬이 없습니다.</p>
          <p className="text-text-tertiary mt-1 text-xs">
            {canEdit
              ? "'스킬 추가'로 홀리심볼·하이퍼바디 같은 버프를 등록하세요."
              : '파티장이 심콜을 등록하면 여기에 표시됩니다.'}
          </p>
        </div>
      ) : (
        <BuffTimerDisplay
          canEdit={canEdit}
          needsAudioUnlock={!audioUnlocked}
          onRemove={handleRemove}
          onStart={handleStart}
          onStop={handleStop}
          onToggle={handleToggle}
          onUnlockAudio={unlockAudio}
        />
      )}

      {isRunning && (
        <p className="text-text-tertiary mt-3 text-[11px] leading-relaxed">
          파티원 전원이 같은 주기로 울립니다. 다른 화면으로 옮겨도 계속되지만 브라우저 탭은 닫지
          마세요.
        </p>
      )}

      {isSetupOpen && <BuffCallModal onClose={handleSetupClose} postTitle={post.title} />}
    </Card>
  );
}
