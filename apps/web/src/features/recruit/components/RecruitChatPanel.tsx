import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import {
  CHAT_MAX_LENGTH,
  getRecruitMessages,
  sendRecruitMessage,
  toRecruitMessage,
  type RecruitMessage,
} from '@/features/recruit/api';
import { supabase } from '@/lib/supabase';
import { toast } from '@/stores/useToastStore';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface RecruitChatPanelProps {
  postId: string;
  userId: string;
  nickname: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function RecruitChatPanel({ postId, userId, nickname }: RecruitChatPanelProps) {
  const [messages, setMessages] = useState<RecruitMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [isSending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /** 같은 메시지가 낙관적 추가와 realtime 이벤트로 두 번 들어오므로 id 로 거른다 */
  const appendMessage = useCallback((msg: RecruitMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  // 최근 메시지 로드 + 신규 메시지 구독
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    getRecruitMessages(postId)
      .then((loaded) => {
        if (!cancelled) setMessages(loaded);
      })
      .catch(() => {
        if (!cancelled) toast.error('채팅을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const channel = supabase
      .channel(`recruit-chat-${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'recruit_messages',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          appendMessage(toRecruitMessage(payload.new));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [postId, appendMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setSending(true);
    try {
      appendMessage(await sendRecruitMessage({ postId, nickname, message: text }));
      setInput('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '메시지 전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  // isComposing 을 봐야 한다 — 한글 조합 중의 Enter 는 확정이지 전송이 아니다
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-text-primary text-sm font-semibold">채팅</h3>
        <span className="text-text-tertiary text-xs">해산하면 대화가 삭제됩니다</span>
      </div>

      <div className="bg-bg-muted flex h-64 flex-col overflow-y-auto rounded-lg p-3">
        {isLoading ? (
          <p className="text-text-tertiary m-auto text-sm">불러오는 중...</p>
        ) : messages.length === 0 ? (
          <p className="text-text-tertiary m-auto text-sm">메시지가 없습니다.</p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.userId === userId;
            return (
              <div key={msg.id} className={cn('mb-1.5 flex flex-col', isMine && 'items-end')}>
                {!isMine && <span className="text-text-tertiary text-xs">{msg.nickname}</span>}
                <div className={cn('flex items-end gap-1.5', isMine && 'flex-row-reverse')}>
                  <div
                    className={cn(
                      'inline-block max-w-[80%] rounded-lg px-3 py-1.5 text-sm break-words',
                      isMine ? 'bg-brand-500 text-white' : 'bg-bg-card text-text-primary',
                    )}
                  >
                    {msg.message}
                  </div>
                  <span className="text-text-tertiary shrink-0 text-[10px] tabular-nums">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <Input
          className="flex-1"
          disabled={isSending}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지 입력..."
          value={input}
        />
        <Button disabled={!input.trim() || isSending} onClick={() => void handleSend()} size="sm">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
