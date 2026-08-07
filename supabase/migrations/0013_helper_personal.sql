-- 0013_helper_personal.sql — 개인 도구 스키마 (MERGE_PLAN §3.2 · §7 2단계)
--
-- maple_helper 의 "길드 없이 쓰는" 기능들이 여기서 들어온다.
-- 캐릭터 관리 · 일일/주간 숙제 · 개인 보스 추적.
--
--   user_profiles          서비스 전역 프로필 (auth 계정 1개당 1행)
--   characters             캐릭터. 나머지 셋이 전부 여기 매달린다
--   user_boss_tracking     사용자별 보스 추적 on/off
--   char_boss_entries      캐릭터 단위 보스 입장 기록  ← 개명 (함정 2)
--   checklist_templates    숙제 항목 정의
--   checklist_completions  숙제 완료 기록
--
-- 왜 characters 가 먼저인가: 나머지 3개가 전부 character_id 로 참조한다.
-- 구인(4단계)의 recruit_* 3개도 마찬가지다.
--
-- ⚠️ char_boss_entries 는 maple_helper 의 boss_entries 를 개명한 것이다.
--    raid_receipt 에 이미 boss_entries 가 있는데 **축이 다르다** (MERGE_PLAN 함정 2):
--      raid_receipt boss_entries  = 공대 단위 (guild_id, party_id) — 정산 타이머
--      char_boss_entries          = 캐릭터 단위 (user_id, character_id) + note
--    합칠 수 없어서 둘 다 남긴다.
--
-- 적용: supabase db push (또는 supabase migration up)

-- ── 1. user_profiles ─────────────────────────────────────
-- guild_accounts · members 와 층이 다르다 (MERGE_PLAN §3.1):
--   user_profiles  auth 계정 1개당 1행 — 서비스 전역 프로필
--   guild_accounts (guild_id, email, role) — 어느 길드에 어떤 권한으로 속하는가
--   members        길드 내 인물 — auth 계정이 없는 사람도 있다
-- 셋은 통합하지 않는다.
--
-- ⚠️ maple_helper 의 user_profiles.is_admin 컬럼은 **가져오지 않는다**.
--    raid_receipt 에 이미 admins 테이블 + is_admin() 함수가 있다 (0004_rls_fix.sql:11-24).
--    컬럼까지 들이면 시스템 관리자 개념이 둘이 되고, 둘이 어긋나면 어느 쪽이 진짜인지
--    아무도 모르게 된다. helper 의 useIsAdmin 훅은 이식할 때 is_admin() RPC 로 바꾼다.
create table user_profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

alter table user_profiles enable row level security;

create policy user_profiles_read_own   on user_profiles for select using (auth.uid() = id);
create policy user_profiles_update_own on user_profiles for update using (auth.uid() = id);
create policy user_profiles_insert_own on user_profiles for insert with check (auth.uid() = id);

-- ── 2. characters ────────────────────────────────────────
-- server_name 은 자유 입력 text 다. game_servers 는 드롭다운 소스일 뿐 FK 가 아니다
-- (0012 §6 주석 참고). FK 로 조이면 기존 자유 입력 값이 전부 걸린다.
create table characters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  nickname     text not null,
  job_category text not null,
  job          text not null default '',
  level        int  not null default 1,
  -- 스탯 공격력(스공). 구인 글의 요구 스공 필터가 쓴다 — 4단계
  stat_attack  bigint,
  server_name  text not null default '',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table characters enable row level security;

-- for all + using → INSERT 의 WITH CHECK 로도 같은 식이 적용된다 (Postgres 기본 동작)
create policy characters_manage_own on characters for all using (auth.uid() = user_id);

create index idx_characters_user on characters (user_id);

-- ⚠️ maple_helper 0009 의 "Party participants can read characters" 정책은 여기서 제외한다.
--    parties · party_members · party_applications 를 참조하는데, 그건 4단계(0014)에
--    recruit_* 로 들어온다. 게다가 raid_receipt 의 parties 는 **공대**라 character_id 가
--    없어서, 지금 넣으면 엉뚱한 테이블에 걸려 에러가 난다.

-- ── 3. user_boss_tracking ────────────────────────────────
create table user_boss_tracking (
  user_id        uuid not null references auth.users on delete cascade,
  boss_id        text not null references bosses on delete cascade,
  character_id   uuid not null references characters on delete cascade,
  notify_enabled boolean not null default true,
  primary key (user_id, boss_id, character_id)
);

alter table user_boss_tracking enable row level security;

create policy user_boss_tracking_manage_own
  on user_boss_tracking for all using (auth.uid() = user_id);

-- ── 4. char_boss_entries (개명) ──────────────────────────
-- append-only. 덮어쓰지 않고 쌓는다 — raid_receipt boss_entries 와 같은 정책.
--
-- boss_id 는 on delete cascade 다 (maple_helper 원본 유지). 정산 쪽 boss_entries 는
-- set null + boss_name 스냅샷인데, 여기는 보스가 사라지면 개인 기록도 같이 지운다.
-- bosses 는 0012 가 관리하는 8행짜리 큐레이션 마스터고 삭제 경로가 관리자 전용
-- 스텁이라 실질 차이는 없다. 원본과 다르게 만들 이유가 없어 그대로 둔다.
create table char_boss_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  character_id uuid not null references characters on delete cascade,
  boss_id      text not null references bosses on delete cascade,
  boss_name    text not null,
  entered_at   timestamptz not null default now(),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table char_boss_entries enable row level security;

create policy char_boss_entries_manage_own
  on char_boss_entries for all using (auth.uid() = user_id);

create index idx_char_boss_entries_char on char_boss_entries (character_id, entered_at desc);
create index idx_char_boss_entries_user on char_boss_entries (user_id, entered_at desc);

-- ── 5. checklist_templates ───────────────────────────────
-- cycle 은 0012 가 만든 boss_cycle enum 을 재사용한다. 여기서 만들지 않는다.
create table checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  cycle      boss_cycle not null default 'DAILY',
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table checklist_templates enable row level security;

create policy checklist_templates_manage_own
  on checklist_templates for all using (auth.uid() = user_id);

create index idx_checklist_templates_user on checklist_templates (user_id);

-- ── 6. checklist_completions ─────────────────────────────
-- MERGE_PLAN §8: 유일한 고속 증가 테이블이다 (유저 × 캐릭터 × 항목 × 매일).
-- 유저 1000명이면 연 1GB 급이라, 그때 오래된 행을 정리한다.
--
-- user_id 를 두지 않고 template 을 통해 소유자를 판정한다. 비정규화를 피한 대신
-- 정책이 행마다 EXISTS 를 타므로, 아래 인덱스가 그 경로를 받쳐준다.
create table checklist_completions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references checklist_templates on delete cascade,
  character_id uuid not null references characters on delete cascade,
  period_date  date not null,
  completed_at timestamptz not null default now(),
  unique (template_id, character_id, period_date)
);

alter table checklist_completions enable row level security;

create policy checklist_completions_manage_own
  on checklist_completions for all
  using (
    exists (
      select 1 from checklist_templates t
      where t.id = checklist_completions.template_id
        and t.user_id = auth.uid()
    )
  );

create index idx_checklist_completions_lookup
  on checklist_completions (template_id, character_id, period_date);

-- ── 7. updated_at 자동 갱신 ──────────────────────────────
-- raid_receipt 에는 없던 함수라 이름 충돌이 없다.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_char_boss_entries_updated_at
  before update on char_boss_entries
  for each row execute function set_updated_at();

-- ── 8. handle_new_user 병합 ★ ────────────────────────────
-- **여기가 이 마이그레이션에서 제일 위험한 부분이다.**
--
-- 두 제품이 같은 이름의 함수를 같은 트리거(on_auth_user_created)에 걸고 있었다.
--   raid_receipt 0004_rls_fix.sql:35  → 초대로 만들어진 guild_accounts 에 user_id 를 채운다
--   maple_helper 0002                 → user_profiles 행을 만든다
-- maple_helper 쪽을 그대로 옮기면 create or replace 가 raid_receipt 것을 덮어써서
-- **초대 링크가 조용히 죽는다**. 가입은 되는데 길드에 안 붙는 형태라 알아채기도 어렵다.
-- 그래서 지우지 않고 두 동작을 한 함수에 합친다.
--
-- 트리거(on_auth_user_created)는 0004 에서 이미 만들어져 있다. 함수만 교체하면 된다.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- 정산: 초대(guild_accounts)가 email 로 미리 만들어져 있으면 user_id 를 연결한다.
  --       auth_user_guilds() 가 이 값으로 "내 길드"를 판정한다. — 0004 P1-3
  update guild_accounts
     set user_id = new.id
   where email = new.email
     and user_id is null;

  -- helper: 서비스 전역 프로필을 만든다. 길드가 없어도 개인 도구를 쓸 수 있어야 한다.
  insert into user_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ── 9. 기존 가입자 백필 ──────────────────────────────────
-- 트리거는 INSERT 시점에만 돈다. 이미 가입한 사람들은 user_profiles 행이 없어서
-- helper 화면이 프로필 없는 상태로 열린다. 여기서 한 번 채워준다.
insert into user_profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
  from auth.users
on conflict (id) do nothing;

-- ── 10. GRANT ────────────────────────────────────────────
-- PostgREST 는 role 에 GRANT 가 없으면 RLS 가 맞아도 permission denied(42501) 를 낸다
-- (0004 P1-7 주석). 새 테이블도 빠짐없이 준다.
--
-- user_profiles 만 DELETE 를 빼둔다 — 프로필 삭제는 계정 삭제(auth.users cascade)로만
-- 일어나야 한다. 본인이 프로필만 지우면 helper 화면이 빈 상태가 된다.
GRANT SELECT, INSERT, UPDATE         ON user_profiles         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON characters            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_boss_tracking    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON char_boss_entries     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_templates   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_completions TO authenticated;
