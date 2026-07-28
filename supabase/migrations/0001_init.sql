-- 0001_init.sql — 메월드 길드 정산 매니저 (Supabase-native)
-- FE apps/web/src/lib/api.ts 의 데이터 계약(§12) + lib/settlement.ts 의 정산 모델(§3)을 반영.
-- 구성: 테이블 + RLS(같은 길드=접근) + 헬퍼/RPC 함수.
-- 적용: supabase db push  (또는 supabase migration up)
--
-- enum 은 SQL 관습대로 대문자. FE 타입은 소문자('draft','fund','percent')이므로
-- api.ts 에 toDb/fromDb 매핑 헬퍼를 두고 경계에서 변환한다.

-- ── Enums ────────────────────────────────────────────────
create type account_role as enum ('OWNER', 'ADMIN', 'MEMBER');      -- 로그인 계정 권한
create type member_role  as enum ('MASTER', 'MANAGER', 'MEMBER');   -- 정산 로스터 권한
create type raid_status  as enum ('DRAFT', 'CONFIRMED');
create type remainder_policy  as enum ('LEADER', 'FUND', 'FIRST');
create type penalty_calc_type as enum ('PERCENT', 'FIXED');
create type expense_category  as enum ('CONSUMABLE', 'ENTRY', 'ETC');

-- ── SYS 마스터 (공용) ────────────────────────────────────
create table bosses (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);
-- 이탈 페이즈 개수는 보스 마스터가 아니라 레이드별(raids.phase_count)로 관리한다.
-- 화면에서 그 자리에서 늘리는 방식이라 마스터에 둘 이유가 없음 (api.ts DEFAULT_PHASE_COUNT 주석).

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
  role         member_role not null default 'MEMBER',
  created_at   timestamptz not null default now(),
  unique (guild_id, nickname)
);
create index on members (guild_id);

-- ── 공대 ─────────────────────────────────────────────────
create table parties (
  id               uuid primary key default gen_random_uuid(),
  guild_id         uuid not null references guilds(id) on delete cascade,
  name             text not null,
  -- 공대장. 길드원 삭제 시 공대는 남기고 공대장만 비운다(화면에서 재지정).
  leader_id        uuid references members(id) on delete set null,
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
  value     int  not null,   -- PERCENT: 0~100, FIXED: 메소 절대액
  is_active boolean not null default true,
  unique (guild_id, name)   -- api.ts addPenaltyType 의 중복 이름 거부와 동일 규칙
);
create index on penalty_types (guild_id);

-- FE GuildSettings 와 1:1 (api.ts getGuildSettings)
create table guild_settings (
  guild_id        uuid primary key references guilds(id) on delete cascade,
  ppoji_rate      real not null default 0,   -- 0~1. 뽀찌를 안 걷는 길드가 많아 기본 0
  default_fee_pct real not null default 5    -- 경매장 판매 수수료 % 기본값
);

-- ── 레이드 (요약 + 상세, 확정 시 스냅샷) ─────────────────
create table raids (
  id                uuid primary key default gen_random_uuid(),
  guild_id          uuid not null references guilds(id) on delete cascade,
  date              date not null default current_date,
  boss_name         text not null,            -- 스냅샷 (보스 마스터 삭제와 무관)
  party_name        text,                     -- 스냅샷 (null=임시 공대)
  ppoji_pct         real not null default 0,  -- 0~100 (FE RaidDetail.ppojiPct)
  remainder_policy  remainder_policy not null default 'FUND',
  phase_count       int  not null default 3,  -- 이 레이드에서 쓴 이탈 페이즈 선택지 개수

  -- 정산 스냅샷 (settlement.ts SettlementResult). 확정 영수증 재현용.
  fee_total         int not null default 0,   -- 판매 수수료 합계
  total_sales       int not null default 0,   -- 실수익 (수수료 뗀 판매금액)
  expense_total     int not null default 0,   -- 공대 경비 합계 (소모품·입장료·기타)
  net_profit        int not null default 0,   -- 실수익 - 경비
  leader_ppoji      int not null default 0,   -- 공대장 뽀찌
  leftover          int not null default 0,   -- 잔돈 + 재분배 나머지 + 고아 패널티
  participant_count int not null default 0,
  per_person        int not null default 0,   -- 기본 1인당 (basePerPerson)

  status            raid_status not null default 'DRAFT',
  sent              boolean not null default false,  -- 디스코드 영수증 발송 여부
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on raids (guild_id, date desc);

create table raid_drops (
  id         uuid primary key default gen_random_uuid(),
  raid_id    uuid not null references raids(id) on delete cascade,
  name       text not null,
  sale_price int  not null default 0,   -- 수수료 떼기 전 실제 판매가
  fee_pct    real not null default 0,   -- 0~100. 직거래면 0
  -- FE 는 drops[] 배열이라 입력 순서가 곧 화면 순서. select 순서는 비결정적이므로 명시 보존.
  sort_order int  not null default 0
);
create index on raid_drops (raid_id);

-- 공대 경비 = 레이드에서 "쓴 돈" 전부(소모품·입장료·기타).
-- 용병은 더 이상 비용이 아니라 n빵 참여자(raid_participants.guest_name)로 들어간다.
create table raid_expenses (
  id       uuid primary key default gen_random_uuid(),
  raid_id  uuid not null references raids(id) on delete cascade,
  category expense_category not null,
  name     text not null,
  cost     int  not null default 0,
  sort_order int not null default 0
);
create index on raid_expenses (raid_id);

create table raid_participants (
  id            uuid primary key default gen_random_uuid(),
  raid_id       uuid not null references raids(id) on delete cascade,
  -- 길드원 참여자. 임시 용병이면 null 이고 guest_name 이 채워진다.
  member_id     uuid references members(id) on delete set null,
  guest_name    text,
  -- 이탈 페이즈(1부터). null = 완주. 패널티 재분배 자격을 가르는 축(§3).
  exit_phase    int,

  -- 정산 스냅샷 (settlement.ts ParticipantResult)
  base          int not null default 0,   -- 패널티/재분배 전 기본 1인당
  penalty       int not null default 0,   -- 차감된 패널티 합계
  redistributed int not null default 0,   -- 재분배 수령액
  final_amount  int not null default 0,   -- 최종 수령액
  forfeited     boolean not null default false,  -- 몰수 대상(남의 벌금 수령 불가)
  sort_order    int not null default 0,

  -- 길드원이거나 용병이거나, 최소한 한쪽은 있어야 한다.
  -- member_id 는 길드원 삭제 시 null 이 될 수 있어 "정확히 하나"로는 검사하지 않는다.
  constraint participant_is_member_or_guest check (member_id is not null or guest_name is not null)
);
create index on raid_participants (raid_id);

-- 한 참여자에게 여러 패널티가 붙을 수 있다 (예: 2페 이탈 + 지각). 금액은 합산(§3).
-- 확정 후 정책이 바뀌어도 영수증이 흔들리지 않게 name/calc_type/value 를 스냅샷한다.
create table raid_participant_penalties (
  id                   uuid primary key default gen_random_uuid(),
  raid_participant_id  uuid not null references raid_participants(id) on delete cascade,
  penalty_type_id      uuid references penalty_types(id) on delete set null,
  name                 text not null,
  calc_type            penalty_calc_type not null,
  value                int  not null
);
create index on raid_participant_penalties (raid_participant_id);

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
  raid_id    uuid references raids(id) on delete set null,
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

-- ── HTTP 에러 로그 (SYS · 시스템 관리자 화면) ────────────
create table error_logs (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz not null default now(),
  guild_id uuid references guilds(id) on delete set null,
  method   text not null,
  path     text not null,
  status   int  not null,
  message  text not null
);
create index on error_logs (at desc);

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

alter table raid_expenses enable row level security;
create policy raid_expenses_via_raid on raid_expenses
  for all using (raid_id in (select id from raids where guild_id in (select auth_user_guilds())));

alter table raid_participants enable row level security;
create policy raid_participants_via_raid on raid_participants
  for all using (raid_id in (select id from raids where guild_id in (select auth_user_guilds())));

alter table raid_participant_penalties enable row level security;
create policy raid_participant_penalties_via_raid on raid_participant_penalties
  for all using (raid_participant_id in (
    select rp.id from raid_participants rp
    join raids r on r.id = rp.raid_id
    where r.guild_id in (select auth_user_guilds())
  ));

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

-- error_logs 는 시스템 관리자 전용. 일반 로그인 유저에게 열면 타 길드 정보가 샌다.
-- 정책 없음 = authenticated 는 전부 거부, service_role 만 접근.
-- TODO(BE): admins 테이블 도입 후 select 정책 추가 (FE AdminPage getErrorLogs 가 이걸 기다림).
alter table error_logs enable row level security;

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
  -- 2) 상태 검증: DRAFT 또는 미발송 확정건만(§5 잠금. FE isRaidEditable 과 동일 규칙).
  -- 3) 정산 재계산·검증: 지금은 FE settlement.ts 결과를 raids/raid_participants 에
  --    이미 저장한 상태로 들어온다. 서버 계산 이관 시 여기서 재계산 후 불일치면 거부.
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
