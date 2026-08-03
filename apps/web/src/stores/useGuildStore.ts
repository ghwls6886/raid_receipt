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
}

interface GuildState {
  guilds: Guild[];
  currentGuildId: string;
  /**
   * 길드 목록을 한 번이라도 서버에서 받아왔는지.
   * guilds 는 persist 대상이 아니라 새로고침마다 [] 로 시작하므로,
   * "아직 안 불러옴"과 "불러왔는데 소속 길드 0개"를 구분하는 데 필요하다.
   */
  loaded: boolean;
  /** Supabase 에서 길드 목록 로드 */
  loadGuilds: () => Promise<void>;
  /** 로그아웃 시 호출 — 다음 사용자에게 이전 길드가 새지 않도록 전부 비운다 */
  reset: () => void;
  setCurrentGuild: (id: string) => void;
  /** RPC 로 길드 생성 → 목록 갱신 후 현재 길드 설정 */
  addGuild: (serverName: string, guildName: string) => Promise<Guild>;
  setGuildServer: (guildId: string, serverName: string) => Promise<void>;
}

export const useGuildStore = create<GuildState>()(
  persist(
    (set, get) => ({
      guilds: [],
      currentGuildId: '',
      loaded: false,

      loadGuilds: async () => {
        const { data: accounts, error } = await supabase
          .from('guild_accounts')
          .select('guild_id, guilds(id, server_name, guild_name)');

        // 조회 실패 시 loaded 를 올리지 않는다 — "길드 0개"로 오판해
        // 온보딩으로 튕기거나 빈 guild_id 로 쿼리하는 걸 막기 위함.
        if (error) throw new Error(error.message);

        const guilds: Guild[] = (accounts ?? [])
          .map((a) => {
            const g = a.guilds as unknown as {
              id: string;
              server_name: string;
              guild_name: string;
            } | null;
            if (!g) return null;
            return {
              id: g.id,
              serverName: g.server_name,
              guildName: g.guild_name,
            };
          })
          .filter((g): g is Guild => g !== null);

        const currentId = get().currentGuildId;
        const validCurrent = guilds.some((g) => g.id === currentId);
        set({
          guilds,
          // persist 된 currentGuildId 가 이번 계정 소속이 아니면 버리고 첫 길드로
          currentGuildId: validCurrent ? currentId : (guilds[0]?.id ?? ''),
          loaded: true,
        });
      },

      reset: () => set({ guilds: [], currentGuildId: '', loaded: false }),

      setCurrentGuild: (id) => set({ currentGuildId: id }),

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
        };
        set((s) => ({ guilds: [...s.guilds, guild], currentGuildId: guild.id, loaded: true }));
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

const EMPTY_GUILD: Guild = { id: '', serverName: '', guildName: '' };

export const useCurrentGuild = (): Guild =>
  useGuildStore((s) => s.guilds.find((g) => g.id === s.currentGuildId) ?? s.guilds[0] ?? EMPTY_GUILD);
