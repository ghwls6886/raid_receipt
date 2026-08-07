import { Check, X } from 'lucide-react';
import type { RecruitApplication } from '@/features/recruit/api';
import { Button } from '@/components/ui/Button';

interface RecruitApplicationListProps {
  applications: RecruitApplication[];
  onRespond: (applicationId: string, accept: boolean) => void;
  isResponding: boolean;
}

export function RecruitApplicationList({
  applications,
  onRespond,
  isResponding,
}: RecruitApplicationListProps) {
  if (applications.length === 0) {
    return (
      <div className="text-text-tertiary py-4 text-center text-sm">대기중인 신청이 없습니다.</div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-text-primary text-sm font-semibold">신청 목록 ({applications.length})</h3>
      <div className="flex flex-col gap-2">
        {applications.map((app) => (
          <div
            key={app.id}
            className="bg-bg-muted flex items-center justify-between rounded-lg px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-text-primary text-sm font-medium">
                {app.nickname ?? '알 수 없음'}
                {app.job && (
                  <span className="text-text-tertiary ml-1 font-normal">({app.job})</span>
                )}
                {app.level != null && (
                  <span className="text-text-tertiary ml-1 font-normal">Lv.{app.level}</span>
                )}
              </p>
              <div className="text-text-secondary mt-0.5 space-y-0.5 text-xs">
                {app.statAttack != null && <p>스공: {app.statAttack.toLocaleString()}</p>}
                {app.specText && <p>스펙: {app.specText}</p>}
                {app.message && <p>메시지: {app.message}</p>}
              </div>
            </div>
            <div className="ml-2 flex gap-1.5">
              <Button
                aria-label="수락"
                disabled={isResponding}
                onClick={() => onRespond(app.id, true)}
                size="sm"
                variant="primary"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                aria-label="거절"
                disabled={isResponding}
                onClick={() => onRespond(app.id, false)}
                size="sm"
                variant="danger"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
