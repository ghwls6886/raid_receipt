import { useState } from 'react';
import { ChevronDown, ChevronUp, Save, Trash2 } from 'lucide-react';
import { useBuffCallStore } from '@/stores/useBuffCallStore';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

interface BuffPresetManagerProps {
  defaultExpanded?: boolean;
}

/**
 * 프리셋 — 자주 쓰는 스킬 조합을 브라우저에 저장해 둔다.
 *
 * 파티가 아니라 **개인** 보관함이다. 새 파티를 팔 때마다 홀심·하바를
 * 다시 담지 않으려고 있는 기능이라, 파티가 바뀌어도 남아 있어야 한다.
 */
export function BuffPresetManager({ defaultExpanded = false }: BuffPresetManagerProps) {
  const skills = useBuffCallStore((s) => s.skills);
  const presets = useBuffCallStore((s) => s.presets);
  const savePreset = useBuffCallStore((s) => s.savePreset);
  const loadPreset = useBuffCallStore((s) => s.loadPreset);
  const deletePreset = useBuffCallStore((s) => s.deletePreset);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  const handleSave = () => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    savePreset(trimmed);
    setPresetName('');
    setIsSaveOpen(false);
  };

  return (
    <>
      <Card className="overflow-hidden">
        <button
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          <span className="text-text-primary text-sm font-semibold">프리셋 관리</span>
          {expanded ? (
            <ChevronUp className="text-text-muted h-4 w-4" />
          ) : (
            <ChevronDown className="text-text-muted h-4 w-4" />
          )}
        </button>

        {expanded && (
          <div className="border-border-subtle flex flex-col gap-3 border-t px-4 pt-3 pb-4">
            <div>
              <Button
                disabled={skills.length === 0}
                onClick={() => setIsSaveOpen(true)}
                size="sm"
                variant="secondary"
              >
                <Save className="h-4 w-4" />
                현재 설정 저장
              </Button>
            </div>

            {presets.length === 0 ? (
              <p className="text-text-muted text-xs">저장된 프리셋이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="bg-bg-muted flex items-center justify-between rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-text-primary truncate text-sm font-medium">
                        {preset.name}
                      </div>
                      <div className="text-text-muted text-xs">{preset.skills.length}개 스킬</div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {/* 불러오면 현재 목록을 통째로 갈아끼운다 */}
                      <Button onClick={() => loadPreset(preset.id)} size="sm" variant="ghost">
                        불러오기
                      </Button>
                      <Button
                        aria-label={`${preset.name} 삭제`}
                        className="text-error-600 hover:text-error-700 h-8 w-8 p-0"
                        onClick={() => deletePreset(preset.id)}
                        size="sm"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        footer={
          <>
            <Button onClick={() => setIsSaveOpen(false)} size="sm" variant="secondary">
              취소
            </Button>
            <Button disabled={!presetName.trim()} onClick={handleSave} size="sm">
              <Save className="h-4 w-4" />
              저장
            </Button>
          </>
        }
        isOpen={isSaveOpen}
        onClose={() => setIsSaveOpen(false)}
        title="프리셋 저장"
      >
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              // 조합 중 Enter 는 한글 확정이지 제출이 아니다
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSave();
            }}
            placeholder="프리셋 이름"
            value={presetName}
          />
          <p className="text-text-muted text-xs">
            현재 등록된 {skills.length}개 스킬이 프리셋으로 저장됩니다.
          </p>
        </div>
      </Modal>
    </>
  );
}
