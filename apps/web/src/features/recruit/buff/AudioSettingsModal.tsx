import { Volume2 } from 'lucide-react';
import { useBuffCallStore } from '@/stores/useBuffCallStore';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { playBeep, resumeAudio, speak } from './audio';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 볼륨·음성 속도 설정.
 *
 * 값은 스토어에 둔다. 원본은 이 모달의 로컬 상태로만 들고 있어서
 * 슬라이더를 움직여도 실제 알림 소리는 그대로였다.
 */
export function AudioSettingsModal({ isOpen, onClose }: AudioSettingsModalProps) {
  const volume = useBuffCallStore((s) => s.volume);
  const rate = useBuffCallStore((s) => s.rate);
  const setVolume = useBuffCallStore((s) => s.setVolume);
  const setRate = useBuffCallStore((s) => s.setRate);

  const handleTest = () => {
    // 테스트 클릭이 곧 유저 제스처 — 여기서 오디오를 깨워 둔다.
    resumeAudio();
    playBeep(volume);
    speak('버프콜 테스트입니다. 심콜~', rate, volume);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="오디오 설정" width={360}>
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-text-primary text-sm font-medium">볼륨</span>
          <div className="flex items-center gap-3">
            <Input
              className="h-2 flex-1 cursor-pointer border-0 p-0"
              max={100}
              min={0}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              type="range"
              value={Math.round(volume * 100)}
            />
            <span className="text-text-secondary w-10 text-right text-sm tabular-nums">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-text-primary text-sm font-medium">음성 속도</span>
          <div className="flex items-center gap-3">
            <Input
              className="h-2 flex-1 cursor-pointer border-0 p-0"
              max={2}
              min={0.5}
              onChange={(e) => setRate(Number(e.target.value))}
              step={0.1}
              type="range"
              value={rate}
            />
            <span className="text-text-secondary w-10 text-right text-sm tabular-nums">
              {rate.toFixed(1)}x
            </span>
          </div>
        </label>

        <Button className="w-full" onClick={handleTest} variant="secondary">
          <Volume2 className="h-4 w-4" />
          소리 테스트
        </Button>

        <p className="text-text-tertiary text-xs leading-relaxed">
          설정은 이 브라우저에 저장되며 모든 파티에서 함께 쓰입니다.
        </p>
      </div>
    </Modal>
  );
}
