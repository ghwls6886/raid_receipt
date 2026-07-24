import { Sparkles, Check } from 'lucide-react';
import { formatMeso } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface Pkg {
  id: string;
  name: string;
  price: number;
  credits: number;
  bonus?: string;
}

// 명세서 §7 충전 패키지 (정식 출시 시 활성화)
const PACKAGES: Pkg[] = [
  { id: 'starter', name: '스타터', price: 3000, credits: 30 },
  { id: 'master', name: '길드장', price: 5000, credits: 55, bonus: '+10%' },
  { id: 'union', name: '연합', price: 10000, credits: 120, bonus: '+20%' },
];

/** 크레딧 / 결제 — 무료 베타 기간 안내 (§5·§7) */
export function CreditsPage() {
  return (
    <div>
      <PageHeader title="크레딧" description="지금은 무료 베타 — 모든 기능을 무료로 사용할 수 있어요." />

      {/* 무료 베타 배너 */}
      <Card className="mb-6 p-6">
        <span className="bg-brand-50 text-brand-700 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" /> 무료 베타
        </span>
        <h2 className="text-text-primary mt-3 text-xl font-bold">모든 기능 무료로 사용 중</h2>
        <p className="text-text-secondary mt-1 text-sm leading-relaxed">
          레이드 확정 · 디스코드 영수증 발송 · 이력 · 통계까지 전부 무료입니다. 크레딧 차감이 없어요.
        </p>
      </Card>

      {/* 충전 패키지 (준비 중) */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-section-title">충전 패키지</h2>
        <Badge tone="neutral">준비 중</Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PACKAGES.map((p) => (
          <Card key={p.id} className="flex flex-col p-5 opacity-60">
            <p className="text-text-primary text-lg font-semibold">{p.name}</p>
            <p className="text-text-primary mt-2 text-2xl font-bold">
              {formatMeso(p.price)}
              <span className="text-text-tertiary text-sm font-normal">원</span>
            </p>
            <p className="text-text-secondary mt-1 flex items-center gap-1 text-sm">
              <Check className="text-success-600 h-4 w-4" /> {p.credits}크레딧
              {p.bonus && <span className="text-success-600 font-medium">{p.bonus}</span>}
            </p>
            <Button className="mt-4" variant="secondary" disabled>
              준비 중
            </Button>
          </Card>
        ))}
      </div>
      <p className="text-text-tertiary mt-4 text-xs">
        결제(크레딧 충전)는 정식 출시 시 오픈됩니다. (명세서 §7)
      </p>
    </div>
  );
}
