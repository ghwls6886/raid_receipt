/**
 * 공대 보스 입장 기록 (MERGE_PLAN 함정 2: helper 의 char_boss_entries 와 축이 다름)
 */
import { supabase, throwIfError } from '@/lib/supabase';
import { getBosses } from '@/lib/masters';

// ─── 보스 입장 기록 ─────────────────────────────────────────
export interface BossEntry {
  id: string;
  guildId: string;
  partyId: string;
  bossId: string;
  bossName: string;
  enteredAt: string;
}

export async function getBossEntries(guildId: string): Promise<BossEntry[]> {
  // (party_id, boss_id) 별 최신 1건 — distinct on 으로 처리
  const { data, error } = await supabase
    .from('boss_entries')
    .select('*')
    .eq('guild_id', guildId)
    .order('party_id')
    .order('boss_id')
    .order('entered_at', { ascending: false });
  throwIfError(error);

  // 클라이언트에서 (party_id, boss_id) 별 최신 1건 필터
  const rows = data ?? [];
  const latest = new Map<string, (typeof rows)[0]>();
  for (const entry of rows) {
    const key = `${entry.party_id}:${entry.boss_id}`;
    if (!latest.has(key)) latest.set(key, entry);
  }

  return [...latest.values()].map((e) => ({
    id: e.id,
    guildId: e.guild_id,
    partyId: e.party_id,
    bossId: e.boss_id ?? '',
    bossName: e.boss_name,
    enteredAt: e.entered_at,
  }));
}

export async function recordBossEntry(
  guildId: string,
  partyId: string,
  bossId: string,
): Promise<BossEntry> {
  const bosses = await getBosses();
  const boss = bosses.find((b) => b.id === bossId);
  if (!boss) throw new Error('보스를 찾을 수 없습니다.');

  const { data, error } = await supabase
    .from('boss_entries')
    .insert({
      guild_id: guildId,
      party_id: partyId,
      boss_id: bossId,
      boss_name: boss.name,
    })
    .select()
    .single();
  throwIfError(error);

  return {
    id: data!.id,
    guildId: data!.guild_id,
    partyId: data!.party_id,
    bossId: data!.boss_id ?? '',
    bossName: data!.boss_name,
    enteredAt: data!.entered_at,
  };
}

export async function updateBossEntry(
  _guildId: string,
  entryId: string,
  enteredAt: string,
): Promise<BossEntry> {
  const ms = new Date(enteredAt).getTime();
  if (Number.isNaN(ms)) throw new Error('시각 형식이 올바르지 않습니다.');
  if (ms > Date.now()) throw new Error('입장 시각은 미래일 수 없습니다.');

  const { data, error } = await supabase
    .from('boss_entries')
    .update({ entered_at: new Date(ms).toISOString() })
    .eq('id', entryId)
    .select()
    .single();
  throwIfError(error);

  return {
    id: data!.id,
    guildId: data!.guild_id,
    partyId: data!.party_id,
    bossId: data!.boss_id ?? '',
    bossName: data!.boss_name,
    enteredAt: data!.entered_at,
  };
}

export async function deleteBossEntry(_guildId: string, entryId: string): Promise<void> {
  const { error } = await supabase.from('boss_entries').delete().eq('id', entryId);
  throwIfError(error);
}

