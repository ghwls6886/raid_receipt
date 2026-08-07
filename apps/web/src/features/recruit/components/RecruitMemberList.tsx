import { Crown, LogOut, Swords, UserMinus } from 'lucide-react';
import type { RecruitMember } from '@/features/recruit/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface RecruitMemberListProps {
  members: RecruitMember[];
  currentUserId: string | undefined;
  onLeave?: () => void;
  /** 파티장에게만 전달 — 미전달 시 퇴장 버튼이 렌더링되지 않는다 */
  onKick?: (userId: string, nickname: string) => void;
  isKicking?: boolean;
}

export function RecruitMemberList({
  members,
  currentUserId,
  onLeave,
  onKick,
  isKicking = false,
}: RecruitMemberListProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-text-primary text-sm font-semibold">멤버</h3>
        <span className="text-text-tertiary text-xs tabular-nums">{members.length}명</span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {members.map((m) => {
          const isMe = m.userId === currentUserId;
          const isPartyLeader = m.role === 'LEADER';

          return (
            <li
              key={m.id}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
                isMe ? 'border-brand-200 bg-brand-50/50' : 'border-border-subtle bg-bg-muted',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {isPartyLeader && (
                    <Crown aria-label="파티장" className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  )}
                  <span className="text-text-primary truncate text-sm font-medium">
                    {m.nickname ?? '알 수 없음'}
                  </span>
                  {isMe && (
                    <span className="bg-brand-500 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white">
                      나
                    </span>
                  )}
                  {m.level != null && <Badge tone="neutral">Lv.{m.level}</Badge>}
                </div>

                <div className="text-text-tertiary mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                  {m.job && <span>{m.job}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Swords aria-hidden="true" className="h-3 w-3" />
                    {m.statAttack != null ? (
                      <span className="text-text-secondary font-medium tabular-nums">
                        스공 {m.statAttack.toLocaleString()}
                      </span>
                    ) : (
                      <span className="opacity-70">스공 미입력</span>
                    )}
                  </span>
                </div>
              </div>

              {isMe && !isPartyLeader && onLeave && (
                <Button aria-label="파티 탈퇴" onClick={onLeave} size="sm" variant="ghost">
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              )}

              {!isMe && !isPartyLeader && onKick && (
                <Button
                  aria-label={`${m.nickname ?? '파티원'} 퇴장`}
                  className="hover:text-error-600"
                  disabled={isKicking}
                  onClick={() => onKick(m.userId, m.nickname ?? '이 파티원')}
                  size="sm"
                  title="파티에서 퇴장"
                  variant="ghost"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
