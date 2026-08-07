import { useState } from 'react';
import { Settings } from 'lucide-react';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { AudioSettingsModal } from './AudioSettingsModal';
import { BuffPresetManager } from './BuffPresetManager';
import { BuffSkillSetup } from './BuffSkillSetup';

interface BuffCallModalProps {
  /** 어느 파티에서 열었는지 — 헤더 표시용 */
  postTitle?: string;
  onClose: () => void;
}

/** 심콜 설정 — 스킬 추가와 프리셋 관리 */
export function BuffCallModal({ postTitle, onClose }: BuffCallModalProps) {
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);

  const title = (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0">
        <div>심콜 설정</div>
        {postTitle && (
          <p className="text-text-tertiary truncate text-xs font-normal">{postTitle}</p>
        )}
      </div>
      <Button
        aria-label="오디오 설정"
        onClick={() => setIsAudioSettingsOpen(true)}
        size="sm"
        variant="ghost"
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <>
      <Modal isOpen maxWidth={672} onClose={onClose} title={title} width="100%">
        <div className="flex flex-col gap-4">
          {/*
            타이머(BuffTimerDisplay)는 여기 두지 않는다. 모달을 닫으면 사라져서
            남은 시간이 안 보인다. 파티방의 심콜 카드에 상시 띄워 둔다.
          */}
          <BuffSkillSetup defaultExpanded />
          <BuffPresetManager />

          <p className="text-text-tertiary border-border-subtle border-t pt-3 text-xs leading-relaxed">
            여기서 담은 스킬은 <strong>파티 전체에 저장</strong>되어 파티원 모두에게 보입니다.
            프리셋과 오디오 설정만 이 브라우저에 남습니다.
          </p>
        </div>
      </Modal>

      <AudioSettingsModal
        isOpen={isAudioSettingsOpen}
        onClose={() => setIsAudioSettingsOpen(false)}
      />
    </>
  );
}
