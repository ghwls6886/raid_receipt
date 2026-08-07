/**
 * 관리 — 에러 로그 · 초대 · 변경 이력 · 계정 권한
 */
import { supabase, throwIfError } from '@/lib/supabase';
import type { AccountRole, GuildAccount } from '@/lib/account';

// ─── HTTP 에러 로그 ─────────────────────────────────────────
export interface ErrorLog {
  id: string;
  at: string;
  method: string;
  path: string;
  status: number;
  message: string;
}

export async function getErrorLogs(): Promise<ErrorLog[]> {
  const { data, error } = await supabase
    .from('error_logs')
    .select('*')
    .order('at', { ascending: false })
    .limit(100);
  throwIfError(error);
  return (data ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    method: e.method,
    path: e.path,
    status: e.status,
    message: e.message,
  }));
}

// ─── 길드 초대 ──────────────────────────────────────────────
export interface Invite {
  code: string;
  guildId: string;
  role: AccountRole;
}

function genInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return `MW-${s}`;
}

export async function createInvite(guildId: string, role: AccountRole): Promise<Invite> {
  const code = genInviteCode();
  const { data, error } = await supabase.rpc('create_invite', {
    p_guild_id: guildId,
    p_role: role,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  return {
    code: (data as unknown as { code: string }).code,
    guildId,
    role,
  };
}

/** 초대 코드 확인 — redeem_invite RPC 로 처리 (OnboardingPage 에서 직접 호출) */
export async function redeemInvite(code: string): Promise<Invite | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from('invites')
    .select('code, guild_id, role')
    .eq('code', normalized)
    .is('used_by', null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    code: data.code,
    guildId: data.guild_id,
    role: data.role as AccountRole,
  };
}

// ─── audit (변경 이력) ──────────────────────────────────────
export interface AuditLog {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  detail: string;
}

export async function getAuditLogs(guildId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, created_at, actor, action, detail')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(100);
  throwIfError(error);
  return (data ?? []).map((l) => ({
    id: l.id,
    at: l.created_at,
    actor: l.actor,
    action: l.action,
    detail: l.detail,
  }));
}

/** audit_logs INSERT — RPC 에서도 기록하지만 FE 직접 기록 지점용 */
export async function logAudit(guildId: string, action: string, detail: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  await supabase.from('audit_logs').insert({
    guild_id: guildId,
    actor: user?.email ?? null,
    action,
    detail,
  });
}


export async function getAccounts(guildId: string): Promise<GuildAccount[]> {
  const { data, error } = await supabase
    .from('guild_accounts')
    .select('id, guild_id, email, name, role')
    .eq('guild_id', guildId);
  throwIfError(error);
  return (data ?? []).map((a) => ({
    id: a.id,
    guildId: a.guild_id,
    email: a.email,
    name: a.name,
    role: a.role as AccountRole,
  }));
}

export async function updateAccountRole(
  _guildId: string,
  accountId: string,
  role: AccountRole,
): Promise<GuildAccount> {
  const { data, error } = await supabase.rpc('update_account_role', {
    p_account_id: accountId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    guildId: data.guild_id,
    email: data.email,
    name: data.name,
    role: data.role as AccountRole,
  };
}

export async function removeAccount(_guildId: string, accountId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_account', { p_account_id: accountId });
  if (error) throw new Error(error.message);
}
