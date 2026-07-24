/**
 * 길드 스토어 (목업)
 *
 * 한 유저가 여러 길드를 소유할 수 있으므로 상단 "길드 스위처"의 상태를 관리한다.
 * 1차 단계에선 목업 데이터. DB 연결 시 guilds/currentGuildId 를 Supabase 조회로 교체.
 */
import { create } from 'zustand';

export interface Guild {
  id: string;
  /** 서버명 (예: 메이플랜드) */
  serverName: string;
  /** 길드명 */
  guildName: string;
  /** 크레딧 잔량 */
  credits: number;
}

const PRIMARY_GUILD: Guild = { id: 'g1', serverName: '메이플랜드', guildName: '흑우연맹', credits: 87 };

const MOCK_GUILDS: Guild[] = [
  PRIMARY_GUILD,
  { id: 'g2', serverName: '메이플플래닛', guildName: '달빛기사단', credits: 12 },
];

let guildSeq = MOCK_GUILDS.length;
const NEW_GUILD_CREDITS = 10; // 명세서 §7 신규 10크레딧 무료

interface GuildState {
  guilds: Guild[];
  currentGuildId: string;
  setCurrentGuild: (id: string) => void;
  /** 크레딧 증감 (확정 시 -1, 롤백/충전 시 +) */
  adjustCredits: (guildId: string, delta: number) => void;
  /** 새 길드 생성 (온보딩) — 현재 길드로 설정 후 반환 */
  addGuild: (serverName: string, guildName: string) => Guild;
  /** 길드 서버명 변경 */
  setGuildServer: (guildId: string, serverName: string) => void;
}

export const useGuildStore = create<GuildState>((set) => ({
  guilds: MOCK_GUILDS,
  currentGuildId: PRIMARY_GUILD.id,
  setCurrentGuild: (id) => set({ currentGuildId: id }),
  adjustCredits: (guildId, delta) =>
    set((s) => ({
      guilds: s.guilds.map((g) =>
        g.id === guildId ? { ...g, credits: Math.max(0, g.credits + delta) } : g,
      ),
    })),
  addGuild: (serverName, guildName) => {
    guildSeq += 1;
    const guild: Guild = {
      id: `guild_${guildSeq}`,
      serverName: serverName.trim(),
      guildName: guildName.trim(),
      credits: NEW_GUILD_CREDITS,
    };
    set((s) => ({ guilds: [...s.guilds, guild], currentGuildId: guild.id }));
    return guild;
  },
  setGuildServer: (guildId, serverName) =>
    set((s) => ({
      guilds: s.guilds.map((g) => (g.id === guildId ? { ...g, serverName } : g)),
    })),
}));

/** 현재 선택된 길드 (없으면 기본 길드로 폴백) */
export const useCurrentGuild = (): Guild =>
  useGuildStore((s) => s.guilds.find((g) => g.id === s.currentGuildId) ?? PRIMARY_GUILD);
