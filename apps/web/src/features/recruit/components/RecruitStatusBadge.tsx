import { Badge } from '@/components/ui/Badge';
import type { RecruitStatus } from '@/features/recruit/api';

type Tone = 'brand' | 'success' | 'warning' | 'neutral';

const STATUS: Record<RecruitStatus, { label: string; tone: Tone }> = {
  OPEN: { label: '모집중', tone: 'success' },
  FULL: { label: '인원 충족', tone: 'brand' },
  IN_PROGRESS: { label: '진행중', tone: 'warning' },
  CLOSED: { label: '종료', tone: 'neutral' },
};

export function RecruitStatusBadge({ status }: { status: RecruitStatus }) {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
