/**
 * 길드 스토어 — Supabase 연동.
 *
 * guilds 목록은 guild_accounts 를 통해 "내가 속한 길드"만 조회.
 * currentGuildId 는 localStorage 에 보존.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

export interface Guild {
  id: string;
  serverName: string;
  guildName: string;
  credits: number;
}

interface GuildState {
  guilds: Guild[];
  currentGuildId: string;
  /** Supabase 에서 길드 목록 로드 */
  loadGuilds: () => Promise<void>;
  setCurrentGuild: (id: string) => void;
  adjustCredits: (guildId: string, delta: number) => void;
  /** RPC 로 길드 생성 → 목록 갱신 후 현재 길드 설정 */
  addGuild: (serverName: string, guildName: string) => Promise<Guild>;
  setGuildServer: (guildId: string, serverName: string) => Promise<void>;
}

export const useGuildStore = create<GuildState>()(
  persist(
    (set, get) => ({
      guilds: [],
      currentGuildId: '',

      loadGuilds: async () => {
        const { data: accounts } = await supabase
          .from('guild_accounts')
          .select('guild_id, guilds(id, server_name, guild_name, credits)');

        if (!accounts) return;

        const guilds: Guild[] = accounts
          .map((a) => {
            const g = a.guilds as unknown as {
              id: string;
              server_name: string;
              guild_name: string;
              credits: number;
            } | null;
            if (!g) return null;
            return {
              id: g.id,
              serverName: g.server_name,
              guildName: g.guild_name,
              credits: g.credits,
            };
          })
          .filter((g): g is Guild => g !== null);

        const currentId = get().currentGuildId;
        const validCurrent = guilds.some((g) => g.id === currentId);
        set({
          guilds,
          currentGuildId: validCurrent ? currentId : (guilds[0]?.id ?? ''),
        });
      },

      setCurrentGuild: (id) => set({ currentGuildId: id }),

      adjustCredits: (guildId, delta) =>
        set((s) => ({
          guilds: s.guilds.map((g) =>
            g.id === guildId ? { ...g, credits: Math.max(0, g.credits + delta) } : g,
          ),
        })),

      addGuild: async (serverName, guildName) => {
        const { data, error } = await supabase.rpc('create_guild', {
          p_server_name: serverName.trim(),
          p_guild_name: guildName.trim(),
        });
        if (error) throw new Error(error.message);

        const guild: Guild = {
          id: data.id,
          serverName: data.server_name,
          guildName: data.guild_name,
          credits: data.credits,
        };
        set((s) => ({ guilds: [...s.guilds, guild], currentGuildId: guild.id }));
        return guild;
      },

      setGuildServer: async (guildId, serverName) => {
        const { error } = await supabase
          .from('guilds')
          .update({ server_name: serverName })
          .eq('id', guildId);
        if (error) throw new Error(error.message);
        set((s) => ({
          guilds: s.guilds.map((g) => (g.id === guildId ? { ...g, serverName } : g)),
        }));
      },
    }),
    {
      name: 'guild-storage',
      partialize: (state) => ({ currentGuildId: state.currentGuildId }),
    },
  ),
);

const EMPTY_GUILD: Guild = { id: '', serverName: '', guildName: '', credits: 0 };

export const useCurrentGuild = (): Guild =>
  useGuildStore((s) => s.guilds.find((g) => g.id === s.currentGuildId) ?? s.guilds[0] ?? EMPTY_GUILD);
