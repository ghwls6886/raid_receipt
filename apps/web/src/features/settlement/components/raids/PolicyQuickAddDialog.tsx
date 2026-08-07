import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { addPenaltyType, addSubsidyType, type PenaltyCalcType } from '@/features/settlement/api';
import { JOB_GROUPS } from '@/lib/jobs';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { toast } from '@/stores/useToastStore';

/**
 * 레이드 입력 화면에서 정책 유형을 그 자리에서 만드는 팝업들.
 * 길드 설정 페이지로 나갔다 오면 작성 중이던 레이드가 끊기므로,
 * 같은 화면에서 추가하고 칩이 바로 늘어나게 한다.
 */
interface QuickAddDialogProps {
  guildId: string;
  isOpen: boolean;
  onClose: () => void;
}

const DIALOG_WIDTH = 420;

/** 패널티 유형 추가 — 길드 설정 '패널티 정책'과 같은 입력을 팝업으로 */
export function PenaltyQuickAddDialog({ guildId, isOpen, onClose }: QuickAddDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [calcType, setCalcType] = useState<PenaltyCalcType>('percent');
  const [value, setValue] = useState(5);

  /** 닫을 때 입력을 비워 다음에 열면 빈 폼으로 시작하게 한다 */
  const close = () => {
    setName('');
    setCalcType('percent');
    setValue(5);
    onClose();
  };

  const addMutation = useMutation({
    mutationFn: () => addPenaltyType(guildId, { name, calcType, value }),
    onSuccess: (created) => {
      toast.success(`'${created.name}' 패널티가 추가되었습니다.`);
      void queryClient.invalidateQueries({ queryKey: ['penalty-types', guildId] });
      void queryClient.invalidateQueries({ queryKey: ['audit', guildId] });
      close();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '추가에 실패했습니다.'),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="패널티 유형 추가"
      width={DIALOG_WIDTH}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            취소
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!name.trim() || addMutation.isPending}
          >
            <Plus className="h-4 w-4" /> 추가
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-text-tertiary text-xs leading-relaxed">
          지각·노쇼처럼 개인 몫에서 깎을 유형입니다. 추가하면 참여자별 정산의 패널티 칩에 바로
          나타납니다.
        </p>
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">패널티명</label>
          <Input
            autoFocus
            placeholder="예: 지각"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-text-secondary mb-1 block text-xs font-medium">구분</label>
            <Select
              value={calcType}
              onChange={(e) => setCalcType(e.target.value as PenaltyCalcType)}
            >
              <option value="percent">% (비율)</option>
              <option value="fixed">정수 (메소)</option>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-text-secondary mb-1 block text-xs font-medium">수치</label>
            <Input
              type="number"
              min={0}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
              placeholder={calcType === 'percent' ? '5' : '1000000'}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** 역할 지원금 유형 추가 — 대상 직업을 지정하면 해당 직업 참여자에게 칩이 자동으로 켜진다 */
export function SubsidyQuickAddDialog({ guildId, isOpen, onClose }: QuickAddDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  /** 빈 문자열 = 직업 무관(수동 전용). DB 에는 null 로 들어간다 */
  const [job, setJob] = useState('');
  const [calcType, setCalcType] = useState<PenaltyCalcType>('fixed');
  const [amount, setAmount] = useState(1000000);

  const close = () => {
    setName('');
    setJob('');
    setCalcType('fixed');
    setAmount(1000000);
    onClose();
  };

  const addMutation = useMutation({
    mutationFn: () => addSubsidyType(guildId, { name, job: job || null, calcType, amount }),
    onSuccess: (created) => {
      toast.success(`'${created.name}' 지원금이 추가되었습니다.`);
      void queryClient.invalidateQueries({ queryKey: ['subsidy-types', guildId] });
      void queryClient.invalidateQueries({ queryKey: ['audit', guildId] });
      close();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '추가에 실패했습니다.'),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="지원금 유형 추가"
      width={DIALOG_WIDTH}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            취소
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!name.trim() || amount <= 0 || addMutation.isPending}
          >
            <Plus className="h-4 w-4" /> 추가
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-text-tertiary text-xs leading-relaxed">
          샤프아이즈·부활처럼 역할에 주는 대가입니다. n빵 <b className="text-text-secondary">전</b>
          에 분배 대상액에서 먼저 떼므로 공대장 인센티브는 줄지 않고 공대원 전원이 1/N씩 부담합니다.
        </p>
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">지원금명</label>
          <Input
            autoFocus
            placeholder="예: 샤프아이즈 지원"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">대상 직업</label>
          <Select value={job} onChange={(e) => setJob(e.target.value)}>
            <option value="">직업 무관 (수동 지정)</option>
            {JOB_GROUPS.map((g) => (
              <optgroup key={g.category} label={g.category}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <p className="text-text-tertiary mt-1 text-xs">
            직업을 고르면 그 직업 공대원에게 칩이 자동으로 켜집니다. 안 줄 날은 칩을 눌러 끄면
            됩니다.
          </p>
        </div>
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">계산 방식</label>
          <Select
            value={calcType}
            onChange={(e) => {
              const next = e.target.value as PenaltyCalcType;
              setCalcType(next);
              // 단위가 바뀌므로 기본값도 같이 바꾼다 (100만% 같은 값이 남지 않도록)
              setAmount(next === 'percent' ? 5 : 1000000);
            }}
          >
            <option value="fixed">정액 (메소)</option>
            <option value="percent">비율 (순수익의 %)</option>
          </Select>
        </div>
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">
            {calcType === 'percent' ? '비율 (%)' : '금액 (메소)'}
          </label>
          <Input
            type="number"
            min={0}
            max={calcType === 'percent' ? 100 : undefined}
            step={calcType === 'percent' ? 1 : 100000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder={calcType === 'percent' ? '5' : '1000000'}
          />
          {calcType === 'percent' && (
            <p className="text-text-tertiary mt-1 text-xs">
              공대 경비까지 뺀 <b className="text-text-secondary">순수익</b> 기준입니다.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
