import { Pencil, Lock, Trash2 } from 'lucide-react';
import type { RaidRow } from '@/lib/api';
import { canDeleteRaid, isRaidEditable, isRaidMine } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatMeso } from '@/lib/format';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCurrentGuild } from '@/stores/useGuildStore';

interface RaidTableProps {
  rows: RaidRow[];
  emptyText?: string;
  /** 지정 시 "관리" 열이 생기고 수정 가능한 건에 수정 버튼이 뜬다 */
  onEdit?: (row: RaidRow) => void;
  /** 지정 시 삭제 가능한 임시저장 건에 삭제 버튼이 같이 뜬다 (canDeleteRaid 참고) */
  onDelete?: (row: RaidRow) => void;
}

/** 레이드 이력 테이블 — 대시보드(최근) / 레이드 페이지(전체) 공용 */
export function RaidTable({
  rows,
  emptyText = '레이드 내역이 없습니다.',
  onEdit,
  onDelete,
}: RaidTableProps) {
  // 소유권 판정용. 서버(save_raid/delete_raid)가 같은 규칙을 다시 검사하므로 여기선
  // 버튼을 잠그고 이유를 보여주는 역할만 한다.
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { myRole } = useCurrentGuild();
  const colCount = onEdit ? 9 : 8;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-border-subtle text-text-tertiary border-b text-xs">
            <th className="px-4 py-2.5 text-left font-medium">날짜</th>
            <th className="px-4 py-2.5 text-left font-medium">보스</th>
            <th className="px-4 py-2.5 text-left font-medium">작성자</th>
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
                  <td className="text-text-secondary px-4 py-3">{r.createdByName ?? '—'}</td>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-0.5">
                        {isRaidEditable(r) && isRaidMine(r, userId, myRole) ? (
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
                            title={
                              isRaidEditable(r)
                                ? `${r.createdByName ?? '다른 공대원'} 님이 만든 정산 — 작성자만 수정할 수 있습니다`
                                : '확정 완료 — 읽기전용 (확정한 정산은 고칠 수 없습니다)'
                            }
                          >
                            <Lock className="h-4 w-4" />
                          </span>
                        )}
                        {/* 확정 건에는 아예 뜨지 않는다. 자물쇠로 자리를 채우면 "지울 수 있는데
                            권한이 없다"로 읽혀서, 지울 수 없는 기록이라는 사실이 흐려진다. */}
                        {onDelete && canDeleteRaid(r, userId, myRole) && (
                          <button
                            aria-label="삭제"
                            className="text-text-secondary hover:bg-error-50 hover:text-error-600 rounded-md p-1.5"
                            onClick={() => onDelete(r)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
