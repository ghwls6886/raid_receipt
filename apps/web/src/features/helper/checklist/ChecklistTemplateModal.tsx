import { useState } from 'react';
import type { ChecklistCycle } from '@/features/helper/api';
import { Modal } from '@/components/popup/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

interface ChecklistTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, cycle: ChecklistCycle) => void;
}

export function ChecklistTemplateModal({ isOpen, onClose, onSubmit }: ChecklistTemplateModalProps) {
  const [name, setName] = useState('');
  const [cycle, setCycle] = useState<ChecklistCycle>('DAILY');

  const handleClose = () => {
    setName('');
    setCycle('DAILY');
    onClose();
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), cycle);
    handleClose();
  };

  return (
    <Modal
      footer={
        <>
          <Button onClick={handleClose} variant="ghost">
            취소
          </Button>
          <Button disabled={!name.trim()} onClick={handleSubmit}>
            추가
          </Button>
        </>
      }
      isOpen={isOpen}
      onClose={handleClose}
      title="항목 추가"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-text-secondary mb-1 block text-sm font-medium" htmlFor="tpl-name">
            항목 이름
          </label>
          <Input
            autoFocus
            id="tpl-name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="예: 자쿰, 일일 퀘스트"
            value={name}
          />
        </div>

        <div>
          <label className="text-text-secondary mb-1 block text-sm font-medium" htmlFor="tpl-cycle">
            주기
          </label>
          <Select
            id="tpl-cycle"
            onChange={(e) => setCycle(e.target.value as ChecklistCycle)}
            value={cycle}
          >
            <option value="DAILY">일간 (매일 초기화)</option>
            <option value="WEEKLY">주간 (매주 월요일 초기화)</option>
          </Select>
        </div>
      </div>
    </Modal>
  );
}
