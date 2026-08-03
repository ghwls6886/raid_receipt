import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Ticket } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useGuildStore } from '@/stores/useGuildStore';
import { supabase } from '@/lib/supabase';
import { toast } from '@/stores/useToastStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function OnboardingPage() {
  const navigate = useNavigate();
  const guilds = useGuildStore((s) => s.guilds);
  const loadGuilds = useGuildStore((s) => s.loadGuilds);
  const setCurrentGuild = useGuildStore((s) => s.setCurrentGuild);
  const addGuild = useGuildStore((s) => s.addGuild);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  const [creating, setCreating] = useState(false);
  const [serverName, setServerName] = useState('');
  const [guildName, setGuildName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadGuilds()
      .then(() => {
        const { guilds: loaded } = useGuildStore.getState();
        if (loaded.length === 0) setCreating(true);
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : '길드 목록을 불러오지 못했습니다.');
      });
  }, [loadGuilds]);

  const enter = () => {
    completeOnboarding();
    navigate('/dashboard', { replace: true });
  };

  const pick = (id: string) => {
    setCurrentGuild(id);
    enter();
  };

  const create = async () => {
    if (!serverName.trim() || !guildName.trim()) {
      toast.warning('서버명과 길드명을 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await addGuild(serverName, guildName);
      toast.success('길드가 생성되었습니다.');
      enter();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '길드 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    if (!inviteCode.trim()) {
      toast.warning('초대 코드를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('redeem_invite', {
        p_code: inviteCode,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('유효하지 않은 초대 코드입니다.');

      await loadGuilds();
      const guildId = data.guild_id;
      setCurrentGuild(guildId);

      const guild = useGuildStore.getState().guilds.find((g) => g.id === guildId);
      toast.success(guild ? `${guild.guildName}에 참여했습니다.` : '길드에 참여했습니다.');
      enter();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '초대 수락에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-bg-page flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-text-primary text-center text-2xl font-bold">길드 선택</h1>
        <p className="text-text-secondary mt-1 text-center text-sm">
          길드를 고르거나 새로 만들고, 초대받았다면 코드로 참여하세요.
        </p>

        {guilds.length > 0 && (
          <div className="mt-6 space-y-2">
            {guilds.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => pick(g.id)}
                className="border-border-subtle bg-bg-card hover:border-brand-400 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors"
              >
                <span className="bg-brand-50 text-brand-700 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold">
                  {g.guildName.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block truncate font-semibold">
                    {g.guildName}
                  </span>
                  <span className="text-text-tertiary block truncate text-xs">
                    {g.serverName}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {creating ? (
          <div className="border-border-subtle bg-bg-card mt-3 space-y-3 rounded-xl border p-4">
            <p className="text-text-primary text-sm font-medium">새 길드 만들기</p>
            <Input
              placeholder="서버명 (예: 메이플랜드)"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
            />
            <Input
              placeholder="길드명"
              value={guildName}
              onChange={(e) => setGuildName(e.target.value)}
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void create()} disabled={busy}>
                만들기
              </Button>
              {guilds.length > 0 && (
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  취소
                </Button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-text-secondary hover:bg-bg-hover border-border-default mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> 새 길드 만들기
          </button>
        )}

        <div className="border-border-subtle mt-6 border-t pt-6">
          <p className="text-text-secondary mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Ticket className="h-4 w-4" /> 초대 코드로 참여
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="예: MW-XXXXXX"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void redeem();
              }}
            />
            <Button variant="secondary" onClick={() => void redeem()} disabled={busy}>
              참여
            </Button>
          </div>
        </div>

        <div className="text-text-tertiary mt-6 text-center text-xs">
          <Link to="/terms" className="hover:underline">
            이용약관
          </Link>
          <span className="mx-2">·</span>
          <Link to="/privacy" className="hover:underline">
            개인정보처리방침
          </Link>
        </div>
      </div>
    </div>
  );
}
