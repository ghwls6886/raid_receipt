import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useBuffCallStore } from '@/stores/useBuffCallStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { DEFAULT_BUFF_PRESETS, makeBuffSkillId, type BuffSkillPreset } from './presets';

/** 직접 추가 시 기본 주기 — 대부분의 버프가 2분이다 */
const DEFAULT_INTERVAL_SEC = 120;

interface BuffSkillSetupProps {
  defaultExpanded?: boolean;
}

export function BuffSkillSetup({ defaultExpanded = false }: BuffSkillSetupProps) {
  const addSkill = useBuffCallStore((s) => s.addSkill);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showPresets, setShowPresets] = useState(false);
  const [name, setName] = useState('');
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [alertText, setAlertText] = useState('');

  const handleAddCustom = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    addSkill({
      id: makeBuffSkillId(),
      name: trimmedName,
      intervalSec,
      // 읽어 줄 문구를 안 적으면 이름으로 만들어 준다.
      alertText: alertText.trim() || `${trimmedName}콜~`,
      enabled: true,
    });

    setName('');
    setIntervalSec(DEFAULT_INTERVAL_SEC);
    setAlertText('');
  };

  const handleAddPreset = (preset: BuffSkillPreset) => {
    addSkill({
      // 프리셋 id 를 그대로 쓰면 같은 버프를 두 번 담을 때 부딪힌다.
      id: makeBuffSkillId(),
      name: preset.name,
      intervalSec: preset.intervalSec,
      alertText: preset.alertText,
      enabled: true,
    });
  };

  return (
    <Card className="overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <span className="text-text-primary text-sm font-semibold">스킬 추가</span>
        {expanded ? (
          <ChevronUp className="text-text-muted h-4 w-4" />
        ) : (
          <ChevronDown className="text-text-muted h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="border-border-subtle flex flex-col gap-4 border-t px-4 pt-3 pb-4">
          <div>
            <Button onClick={() => setShowPresets((v) => !v)} size="sm" variant="secondary">
              기본 프리셋 추가
              {showPresets ? (
                <ChevronUp className="ml-1 h-3 w-3" />
              ) : (
                <ChevronDown className="ml-1 h-3 w-3" />
              )}
            </Button>

            {showPresets && (
              <div className="mt-2 flex flex-wrap gap-2">
                {DEFAULT_BUFF_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="bg-bg-muted text-text-primary hover:bg-border-default rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    onClick={() => handleAddPreset(preset)}
                    type="button"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-text-secondary text-xs font-medium">직접 추가</div>
            <Input onChange={(e) => setName(e.target.value)} placeholder="스킬 이름" value={name} />
            <div className="flex gap-2">
              <Input
                className="w-28"
                min={1}
                onChange={(e) => setIntervalSec(Math.max(1, Number(e.target.value)))}
                placeholder="주기 (초)"
                type="number"
                value={intervalSec}
              />
              <Input
                className="flex-1"
                onChange={(e) => setAlertText(e.target.value)}
                placeholder="알림 문구 (예: 심콜~)"
                value={alertText}
              />
            </div>
            <div>
              <Button disabled={!name.trim()} onClick={handleAddCustom} size="sm">
                <Plus className="h-4 w-4" />
                추가
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
