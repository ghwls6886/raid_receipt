import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActiveServers } from '@/lib/masters';
import { JOB_CATEGORIES, type JobCategory } from '@/lib/jobs';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

export interface CharacterFormData {
  nickname: string;
  jobCategory: JobCategory;
  job: string;
  level: number;
  serverName: string;
  statAttack?: number | null;
}

interface CharacterFormProps {
  initialData?: CharacterFormData;
  onSubmit: (data: CharacterFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const DEFAULT_DATA: CharacterFormData = {
  nickname: '',
  jobCategory: '전사',
  job: '',
  level: 1,
  serverName: '',
  statAttack: null,
};

const MAX_LEVEL = 300;

export function CharacterForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CharacterFormProps) {
  const [form, setForm] = useState<CharacterFormData>({ ...DEFAULT_DATA, ...initialData });

  // 서버 목록은 거의 바뀌지 않는다 — 폼을 여닫을 때마다 다시 부르지 않도록 길게 캐시한다.
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['servers', 'active'],
    queryFn: getActiveServers,
    staleTime: 5 * 60 * 1000,
  });

  // 신규 생성 시 첫 활성 서버를 기본값으로 채운다. 이미 값이 있으면(수정 모드 포함) 건드리지 않는다.
  useEffect(() => {
    if (servers.length === 0) return;
    setForm((prev) => (prev.serverName ? prev : { ...prev, serverName: servers[0]!.name }));
  }, [servers]);

  // 비활성 처리된 서버로 저장된 기존 캐릭터도 값을 잃지 않도록 선택지에 남긴다.
  const serverOptions =
    form.serverName && !servers.some((s) => s.name === form.serverName)
      ? [...servers.map((s) => s.name), form.serverName]
      : servers.map((s) => s.name);

  const change = <K extends keyof CharacterFormData>(key: K, value: CharacterFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isValid =
    form.nickname.trim() !== '' &&
    form.job.trim() !== '' &&
    form.serverName.trim() !== '' &&
    form.level >= 1;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      ...form,
      nickname: form.nickname.trim(),
      job: form.job.trim(),
      serverName: form.serverName.trim(),
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <fieldset className="flex flex-col gap-4" disabled={isSubmitting}>
        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">닉네임</span>
          <Input
            maxLength={20}
            onChange={(e) => change('nickname', e.target.value)}
            placeholder="캐릭터 닉네임"
            required
            value={form.nickname}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">직업 계열</span>
          <Select
            onChange={(e) => change('jobCategory', e.target.value as JobCategory)}
            value={form.jobCategory}
          >
            {JOB_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">직업</span>
          <Input
            maxLength={30}
            onChange={(e) => change('job', e.target.value)}
            placeholder="예: 히어로, 비숍"
            required
            value={form.job}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">레벨</span>
          <Input
            max={MAX_LEVEL}
            min={1}
            onChange={(e) => change('level', Math.max(1, Number(e.target.value)))}
            required
            type="number"
            value={form.level}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">서버</span>
          <Select
            disabled={serversLoading || serverOptions.length === 0}
            onChange={(e) => change('serverName', e.target.value)}
            required
            value={form.serverName}
          >
            {serverOptions.length === 0 && (
              <option value="">
                {serversLoading ? '불러오는 중...' : '등록된 서버가 없습니다'}
              </option>
            )}
            {serverOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          {!serversLoading && serverOptions.length === 0 && (
            <span className="text-text-tertiary text-xs">
              관리자가 서버를 등록해야 캐릭터를 만들 수 있습니다.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">
            스공 <span className="text-text-tertiary font-normal">(선택)</span>
          </span>
          <Input
            min={0}
            onChange={(e) => change('statAttack', e.target.value ? Number(e.target.value) : null)}
            placeholder="스탯 공격력"
            type="number"
            value={form.statAttack ?? ''}
          />
        </label>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2">
        <Button disabled={isSubmitting} onClick={onCancel} type="button" variant="secondary">
          취소
        </Button>
        <Button disabled={!isValid || isSubmitting} type="submit">
          {initialData ? '수정' : '추가'}
        </Button>
      </div>
    </form>
  );
}
