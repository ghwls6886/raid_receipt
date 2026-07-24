-- 0001_init.sql — 메월드 길드 정산 매니저 (Supabase-native)
-- FE apps/web/src/lib/api.ts 의 데이터 모델을 반영. 명세서 §9.
-- 구성: 테이블 + RLS(같은 길드=접근) + 헬퍼/RPC 함수.
-- 적용: supabase db push  (또는 supabase migration up)

-- ── Enums ────────────────────────────────────────────────
create type account_role as enum ('OWNER', 'ADMIN', 'MEMBER'); -- 계정 권한
create type raid_status as enum ('DRAFT', 'CONFIRMED');
create type remainder_policy as enum ('LEADER', 'FUND', 'FIRST');
create type penalty_calc_type as enum ('PERCENT', 'FIXED');

-- ── SYS 마스터 (공용) ────────────────────────────────────
create table bosses (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);
create table game_servers (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- ── 길드 & 계정 ──────────────────────────────────────────
create table guilds (
  id          uuid primary key default gen_random_uuid(),
  server_name text not null,
  guild_name  text not null,
  credits     int  not null default 10,   -- 신규 10크레딧 (§7). 무료 베타 동안 미차감.
  webhook_url text,                        -- 비밀값(디스코드). select 제한 권장.
  created_at  timestamptz not null default now()
);

-- 구글 로그인 계정 ↔ 길드 멤버십/권한. (정산 명단 members 와 별개)
create table guild_accounts (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null, -- Supabase Auth
  email      text not null,
  name       text not null,
  role       account_role not null default 'MEMBER',
  created_at timestamptz not null default now(),
  unique (guild_id, email)
);
create index on guild_accounts (guild_id);
create index on guild_accounts (user_id);

-- 정산 명단(로스터). 로그인/계정 무관.
create table members (
  id           uuid primary key default gen_random_uuid(),
  guild_id     uuid not null references guilds(id) on delete cascade,
  nickname     text not null,
  job_category text not null,   -- 전사/마법사/궁수/도적/해적
  job          text not null,
  level        int  not null,
  created_at   timestamptz not null default now(),
  unique (guild_id, nickname)
);
create index on members (guild_id);

-- ── 공대 ─────────────────────────────────────────────────
create table parties (
  id               uuid primary key default gen_random_uuid(),
  guild_id         uuid not null references guilds(id) on delete cascade,
  name             text not null,
  leader_id        uuid,   -- members.id (공대장)
  remainder_policy remainder_policy not null default 'FUND',
  created_at       timestamptz not null default now()
);
create index on parties (guild_id);

create table party_members (
  party_id  uuid not null references parties(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  primary key (party_id, member_id)
);

-- ── 정책 ─────────────────────────────────────────────────
create table penalty_types (
  id        uuid primary key default gen_random_uuid(),
  guild_id  uuid not null references guilds(id) on delete cascade,
  name      text not null,
  calc_type penalty_calc_type not null,
  value     int  not null,
  is_active boolean not null default true
);
create index on penalty_types (guild_id);

create table guild_settings (
  guild_id           uuid primary key references guilds(id) on delete cascade,
  ppoji_enabled      boolean not null default true,
  ppoji_rate         real    not null default 0.10,
  leader_in_split    boolean not null default false,
  min_sample_for_avg int     not null default 3
);

-- ── 레이드 (요약 + 상세, 확정 시 스냅샷) ─────────────────
create table raids (
  id                uuid primary key default gen_random_uuid(),
  guild_id          uuid not null references guilds(id) on delete cascade,
  date              date not null default current_date,
  boss_name         text not null,            -- 스냅샷
  party_name        text,                     -- 스냅샷 (null=임시공대)
  ppoji_rate        real not null default 0.10,
  remainder_policy  remainder_policy not null default 'FUND',
  material_cost     int  not null default 0,
  net_profit        int  not null,
  participant_count int  not null,
  per_person        int  not null,
  status            raid_status not null default 'DRAFT',
  sent              boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on raids (guild_id, date);

create table raid_drops (
  id uuid primary key default gen_random_uuid(),
  raid_id uuid not null references raids(id) on delete cascade,
  name text not null,
  sale_price int not null
);
create table raid_materials (
  id uuid primary key default gen_random_uuid(),
  raid_id uuid not null references raids(id) on delete cascade,
  name text not null,
  cost int not null
);
create table raid_mercs (
  id uuid primary key default gen_random_uuid(),
  raid_id uuid not null references raids(id) on delete cascade,
  name text not null,
  fee int not null
);
create table raid_participants (
  id            uuid primary key default gen_random_uuid(),
  raid_id       uuid not null references raids(id) on delete cascade,
  member_id     uuid not null references members(id),
  penalty_name  text,               -- 확정 스냅샷
  penalty_calc  penalty_calc_type,
  penalty_value int,
  penalty       int not null default 0,
  redistributed int not null default 0,
  final_amount  int not null default 0
);
create index on raid_participants (raid_id);

-- ── 초대 ─────────────────────────────────────────────────
create table invites (
  code       text primary key,      -- MW-XXXXXX
  guild_id   uuid not null references guilds(id) on delete cascade,
  role       account_role not null default 'MEMBER',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by    text
);
create index on invites (guild_id);

-- ── 크레딧 원장 (멱등성) — 유료화 대비 ───────────────────
create table credit_logs (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  delta      int  not null,          -- -1 확정, +N 충전, +1 롤백
  reason     text not null,          -- 'raid_confirm' | 'charge' | 'rollback'
  payment_id text unique,            -- 결제 웹훅 멱등성
  raid_id    uuid,
  created_at timestamptz not null default now()
);
create index on credit_logs (guild_id);

-- ── 변경 이력 (audit) ────────────────────────────────────
create table audit_logs (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  actor      text,                   -- 수행 계정 email
  action     text not null,
  detail     text not null,
  created_at timestamptz not null default now()
);
create index on audit_logs (guild_id, created_at desc);

-- ══════════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════════
-- 헬퍼: 현재 로그인 유저가 속한 길드 id 집합. 정책 재귀 회피 위해 SECURITY DEFINER.
create or replace function auth_user_guilds()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select guild_id from guild_accounts where user_id = auth.uid();
$$;

-- MVP 정책: "같은 길드면 전권"(§9). 확정/정책/권한변경의 role 세분화는 RPC/추후 정책에서.
alter table guilds enable row level security;
create policy guild_member on guilds
  for all using (id in (select auth_user_guilds()))
  with check (id in (select auth_user_guilds()));

alter table members enable row level security;
create policy members_same_guild on members
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

alter table guild_accounts enable row level security;
create policy accounts_same_guild on guild_accounts
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

alter table parties enable row level security;
create policy parties_same_guild on parties
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

alter table penalty_types enable row level security;
create policy penalty_same_guild on penalty_types
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

alter table guild_settings enable row level security;
create policy settings_same_guild on guild_settings
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

alter table raids enable row level security;
create policy raids_same_guild on raids
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

alter table invites enable row level security;
create policy invites_same_guild on invites
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

alter table audit_logs enable row level security;
create policy audit_same_guild on audit_logs
  for select using (guild_id in (select auth_user_guilds()));

-- 자식 테이블(직접 guild_id 없음): 상위 → 길드 조인으로 정책.
alter table party_members enable row level security;
create policy party_members_via_party on party_members
  for all using (party_id in (select id from parties where guild_id in (select auth_user_guilds())));

alter table raid_drops enable row level security;
create policy raid_drops_via_raid on raid_drops
  for all using (raid_id in (select id from raids where guild_id in (select auth_user_guilds())));
alter table raid_materials enable row level security;
create policy raid_materials_via_raid on raid_materials
  for all using (raid_id in (select id from raids where guild_id in (select auth_user_guilds())));
alter table raid_mercs enable row level security;
create policy raid_mercs_via_raid on raid_mercs
  for all using (raid_id in (select id from raids where guild_id in (select auth_user_guilds())));
alter table raid_participants enable row level security;
create policy raid_participants_via_raid on raid_participants
  for all using (raid_id in (select id from raids where guild_id in (select auth_user_guilds())));

-- SYS 마스터: 로그인 유저는 읽기. 쓰기는 시스템 관리자 or service_role.
alter table bosses enable row level security;
create policy bosses_read on bosses for select using (auth.role() = 'authenticated');
alter table game_servers enable row level security;
create policy servers_read on game_servers for select using (auth.role() = 'authenticated');
-- TODO(BE): boss/server 쓰기 정책(시스템 관리자) — service_role 로만 or 별도 admins 테이블.

-- credit_logs 는 원장이라 클라이언트 직접 쓰기 금지 → RPC/service_role 로만.
alter table credit_logs enable row level security;
create policy credit_logs_read on credit_logs
  for select using (guild_id in (select auth_user_guilds()));

-- ══════════════════════════════════════════════════════════
-- 확정 RPC (원자적). FE: supabase.rpc('confirm_settlement', { p_raid_id })
-- ══════════════════════════════════════════════════════════
create or replace function confirm_settlement(p_raid_id uuid)
returns raids
language plpgsql security definer set search_path = public
as $$
declare
  v_raid raids;
begin
  select * into v_raid from raids where id = p_raid_id;
  if not found then raise exception 'raid not found'; end if;

  -- TODO(BE):
  -- 1) 권한: auth.uid() 가 v_raid.guild_id 의 OWNER/ADMIN 인지 확인, 아니면 raise exception.
  -- 2) 상태 검증: draft 또는 미발송 확정건만(§5 잠금).
  -- 3) 참여자별 penalty/redistributed/final 스냅샷 저장
  --    (MVP: FE settlement.ts 계산값을 받아 검증 후 저장. 이후 서버 계산 이관 가능.)
  -- 4) [유료화 시] 크레딧 원자 차감:
  --      update guilds set credits = credits - 1 where id = v_raid.guild_id and credits > 0;
  --      if not found then raise exception 'insufficient credits'; end if;
  --      insert into credit_logs(guild_id, delta, reason, raid_id)
  --        values (v_raid.guild_id, -1, 'raid_confirm', p_raid_id);
  --    (무료 베타 동안 4)는 건너뜀.)
  -- 5) 발송: Edge Function discord-send 호출(pg_net) 또는 확정 후 FE 가 호출.
  --    발송 실패 시 sent=false 유지 + [유료화 시] credit_logs reason='rollback'.

  update raids
    set status = 'CONFIRMED', updated_at = now()
    where id = p_raid_id
    returning * into v_raid;

  insert into audit_logs (guild_id, action, detail)
    values (v_raid.guild_id, '레이드 확정', v_raid.boss_name);

  return v_raid;
end;
$$;
