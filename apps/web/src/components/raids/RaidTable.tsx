import { Pencil, Lock } from 'lucide-react';
import type { RaidRow } from '@/lib/api';
import { isRaidEditable } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatMeso } from '@/lib/format';

interface RaidTableProps {
  rows: RaidRow[];
  emptyText?: string;
  /** 지정 시 "관리" 열이 생기고 수정 가능한 건에 수정 버튼이 뜬다 */
  onEdit?: (row: RaidRow) => void;
}

/** 레이드 이력 테이블 — 대시보드(최근) / 레이드 페이지(전체) 공용 */
export function RaidTable({ rows, emptyText = '레이드 내역이 없습니다.', onEdit }: RaidTableProps) {
  const colCount = onEdit ? 8 : 7;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-border-subtle text-text-tertiary border-b text-xs">
            <th className="px-4 py-2.5 text-left font-medium">날짜</th>
            <th className="px-4 py-2.5 text-left font-medium">보스</th>
            <th className="px-4 py-2.5 text-right font-medium">총 순수익</th>
            <th className="px-4 py-2.5 text-right font-medium">참여</th>
            <th className="px-4 py-2.5 text-right font-medium">1인당</th>
            <th className="px-4 py-2.5 text-center font-medium">상태</th>
            <th className="px-4 py-2.5 text-center font-medium">발송</th>
            {onEdit && <th className="px-4 py-2.5 text-center font-medium">관리</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="text-text-muted px-4 py-10 text-center" colSpan={colCount}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const isDraft = r.status === 'draft';
              return (
                <tr
                  key={r.id}
                  className="border-border-subtle hover:bg-bg-hover border-b last:border-0"
                >
                  <td className="text-text-secondary px-4 py-3 tabular-nums">{formatDate(r.date)}</td>
                  <td className="text-text-primary px-4 py-3 font-medium">{r.bossName}</td>
                  <td className="text-text-primary px-4 py-3 text-right tabular-nums">
                    {isDraft ? '—' : formatMeso(r.netProfit)}
                  </td>
                  <td className="text-text-secondary px-4 py-3 text-right tabular-nums">
                    {r.participantCount}
                  </td>
                  <td className="text-text-primary px-4 py-3 text-right font-medium tabular-nums">
                    {isDraft ? '—' : formatMeso(r.perPerson)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={isDraft ? 'warning' : 'success'}>{isDraft ? '임시' : '확정'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={r.sent ? 'brand' : 'neutral'}>{r.sent ? '발송' : '미발송'}</Badge>
                  </td>
                  {onEdit && (
                    <td className="px-4 py-3 text-center">
                      {isRaidEditable(r) ? (
                        <button
                          aria-label="수정"
                          className="text-text-secondary hover:bg-bg-hover hover:text-brand-600 rounded-md p-1.5"
                          onClick={() => onEdit(r)}
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : (
                        <span
                          className="text-text-muted inline-flex p-1.5"
                          title="발송 완료 — 읽기전용"
                        >
                          <Lock className="h-4 w-4" />
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
