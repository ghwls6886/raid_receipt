import { useEffect, useState } from 'react';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface EntryTimeModalProps {
  isOpen: boolean;
  bossName: string;
  /** 현재 기록된 입장 시각 (ISO, UTC) */
  enteredAt: string;
  onClose: () => void;
  /** 저장 — ISO(UTC) 로 돌려준다 */
  onSubmit: (enteredAt: string) => void;
  pending: boolean;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * ISO(UTC) → datetime-local 이 요구하는 로컬 "YYYY-MM-DDTHH:mm".
 * toISOString() 을 잘라 쓰면 UTC 가 그대로 나와 한국 기준 9시간이 어긋난다.
 */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** datetime-local 값(로컬 해석) → ISO(UTC). 저장 형식은 항상 UTC 로 통일한다 */
function toISO(localValue: string): string {
  return new Date(localValue).toISOString();
}

/**
 * 입장 시각 보정 — "지금 입장"을 10분 늦게 눌렀을 때 실제 시각으로 되돌린다.
 * 원클릭 기록이라 시각이 밀리는 일이 잦아서, 타이머를 믿으려면 보정 수단이 필요하다.
 */
export function EntryTimeModal({
  isOpen,
  bossName,
  enteredAt,
  onClose,
  onSubmit,
  pending,
}: EntryTimeModalProps) {
  const [value, setValue] = useState(() => toLocalInputValue(enteredAt));
  const [error, setError] = useState<string | null>(null);

  // 다른 보스 행에서 다시 열면 그 보스의 기록으로 폼을 갈아끼운다
  useEffect(() => {
    if (isOpen) {
      setValue(toLocalInputValue(enteredAt));
      setError(null);
    }
  }, [isOpen, enteredAt]);

  const submit = () => {
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms)) {
      setError('시각 형식이 올바르지 않습니다.');
      return;
    }
    if (ms > Date.now()) {
      setError('입장 시각은 미래일 수 없습니다.');
      return;
    }
    setError(null);
    onSubmit(toISO(value));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${bossName} 입장 시각`}
      width={340}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            취소
          </Button>
          <Button disabled={pending} onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <label className="text-text-secondary mb-1.5 block text-sm font-medium" htmlFor="entry-at">
        실제 입장 시각
      </label>
      <Input
        id="entry-at"
        max={toLocalInputValue(new Date().toISOString())}
        onChange={(e) => setValue(e.target.value)}
        type="datetime-local"
        value={value}
      />
      {error ? (
        <p className="text-error-600 mt-2 text-xs">{error}</p>
      ) : (
        <p className="text-text-tertiary mt-2 text-xs">
          이 시각에 보스별 쿨타임을 더해 다음 입장 가능 시각을 계산합니다.
        </p>
      )}
    </Modal>
  );
}
