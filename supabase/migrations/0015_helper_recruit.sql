-- 0015_helper_recruit.sql — 파티 구인 · 채팅 · 매너 평가 (MERGE_PLAN §3 · §7 4단계)
--
-- maple_helper 의 파티 시스템을 통째로 들여온다. 원본은 마이그레이션 7개에 흩어져
-- 있었고(0005 생성 → 0006 무결성 → 0008 realtime → 0010 채팅 → 0011 매너 →
-- 0013 이력·RLS수정 → 0014 해산정리), 여기서는 **최종 상태만** 한 번에 만든다.
-- 중간 단계를 재현할 이유가 없다.
--
-- ⚠️ 개명 6종 (MERGE_PLAN §3, 함정 1)
--   parties            → recruit_posts          ← raid_receipt 의 parties 는 **공대**다
--   party_members      → recruit_post_members
--   party_applications → recruit_applications
--   party_messages     → recruit_messages
--   party_history      → recruit_history
--   party_ratings      → recruit_ratings
-- manner_profiles · rating_sessions · rating_session_participants 는 이름 그대로.
-- RPC 도 같은 규칙으로 개명한다 (create_party → create_recruit_post 등).
-- 정산의 parties 와 이름이 겹치면 "어느 파티인지"를 매번 되짚어야 한다.
--
-- 적용: supabase db push (또는 supabase migration up)

-- ══════════════════════════════════════════════════════════
-- 1. recruit_posts — 구인 글
-- ══════════════════════════════════════════════════════════
-- 일회성이다. 모집이 끝나면 CLOSED 로 죽고, 정산의 parties(고정 공대)와 달리
-- 재사용하지 않는다. buff_skills/buff_started_at 은 원본에서 나중에 붙은 컬럼인데
-- 여기서는 처음부터 넣는다 (§7 4단계 버프콜).
create table recruit_posts (
  id                   uuid primary key default gen_random_uuid(),
  leader_id            uuid not null references auth.users(id) on delete cascade,
  character_id         uuid not null references characters(id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 60),
  category             text not null,
  required_stat_attack bigint,
  spec_description     text,
  leader_stat_attack   bigint,
  leader_spec          text,
  max_members          smallint not null default 4 check (max_members between 2 and 6),
  status               text not null default 'OPEN'
                         check (status in ('OPEN', 'FULL', 'IN_PROGRESS', 'CLOSED')),
  server_name          text not null,
  -- 심콜 설정 — 파티장이 정하고 파티원은 읽기만 한다.
  -- 요소: { id, name, intervalSec, alertText, enabled }
  buff_skills          jsonb not null default '[]'::jsonb
                         check (jsonb_typeof(buff_skills) = 'array'),
  -- null = 정지. 값이 있으면 그 시각 기준으로 전원의 주기가 정렬된다
  buff_started_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 한 사람이 동시에 여러 구인 글을 열 수 없다
create unique index idx_recruit_posts_one_active_per_user
  on recruit_posts (leader_id)
  where status in ('OPEN', 'FULL', 'IN_PROGRESS');

-- set_updated_at() 은 0013 에서 이미 만들었다
create trigger trg_recruit_posts_updated_at
  before update on recruit_posts
  for each row execute function set_updated_at();

alter table recruit_posts enable row level security;

-- 구인 글은 공개 게시물이다. 로그인만 하면 다 본다.
create policy recruit_posts_read on recruit_posts
  for select using (auth.role() = 'authenticated');
-- INSERT 정책을 두지 않는다 — create_recruit_post RPC 전용 (§12 GRANT 주석)
create policy recruit_posts_update_leader on recruit_posts
  for update using (auth.uid() = leader_id);
create policy recruit_posts_delete_leader on recruit_posts
  for delete using (auth.uid() = leader_id);

-- ══════════════════════════════════════════════════════════
-- 2. recruit_post_members — 확정된 파티원
-- ══════════════════════════════════════════════════════════
create table recruit_post_members (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references recruit_posts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  role         text not null default 'MEMBER' check (role in ('LEADER', 'MEMBER')),
  joined_at    timestamptz not null default now(),
  unique (post_id, user_id)
);

create index idx_recruit_post_members_user on recruit_post_members (user_id);

alter table recruit_post_members enable row level security;

-- 파티원 명단은 구인 글과 함께 공개된다
create policy recruit_post_members_read on recruit_post_members
  for select using (auth.role() = 'authenticated');
-- 쓰기 정책을 두지 않는다. 참가/탈퇴/퇴장은 전부 SECURITY DEFINER RPC 를 거친다.
-- maple_helper 는 insert 정책이 auth.uid() = user_id 였는데, 그러면 **승인 없이
-- 아무 파티에나 자기를 밀어 넣을 수 있다.** GRANT 도 SELECT 만 준다.

/**
 * 한 사람이 동시에 두 파티에 속할 수 없다.
 * 부분 유니크 인덱스로는 못 한다 — 조건이 다른 테이블(recruit_posts.status)에 있다.
 * 동시 INSERT 경합은 user_id 기준 advisory lock 으로 직렬화한다.
 */
create or replace function check_single_active_recruit_membership()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_conflicts int;
begin
  perform pg_advisory_xact_lock(hashtext('recruit_membership:' || new.user_id::text));

  select count(*) into v_conflicts
  from recruit_post_members m
  join recruit_posts p on p.id = m.post_id
  where m.user_id = new.user_id
    and m.post_id <> new.post_id
    and p.status in ('OPEN', 'FULL', 'IN_PROGRESS');

  if v_conflicts > 0 then
    raise exception '이미 참여 중인 파티가 있습니다. 기존 파티에서 나간 뒤 다시 시도해주세요.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

create trigger trg_recruit_post_members_single_active
  before insert on recruit_post_members
  for each row execute function check_single_active_recruit_membership();

-- ══════════════════════════════════════════════════════════
-- 3. recruit_applications — 지원
-- ══════════════════════════════════════════════════════════
create table recruit_applications (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references recruit_posts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  stat_attack  bigint,
  spec_text    text,
  message      text,
  status       text not null default 'PENDING'
                 check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at   timestamptz not null default now()
);

-- unique(post_id, user_id) 를 쓰지 않는 이유: 한 번 거절당하면 영영 재신청을 못 한다.
-- PENDING 일 때만 유일하게 두면 이력은 남기면서 재신청이 열린다.
create unique index idx_recruit_applications_one_pending
  on recruit_applications (post_id, user_id)
  where status = 'PENDING';

-- 파티장이 신청 목록을 훑는 경로
create index idx_recruit_applications_post_status
  on recruit_applications (post_id, status, created_at);

alter table recruit_applications enable row level security;

-- 신청 내용은 공개가 아니다 — 신청자 본인과 그 글의 파티장만 본다
create policy recruit_applications_read_own_or_leader on recruit_applications
  for select using (
    auth.uid() = user_id
    or auth.uid() in (select p.leader_id from recruit_posts p where p.id = post_id)
  );

create policy recruit_applications_insert_own on recruit_applications
  for insert with check (auth.uid() = user_id);

-- 대기 중인 신청은 본인이 철회할 수 있다
create policy recruit_applications_delete_own_pending on recruit_applications
  for delete using (auth.uid() = user_id and status = 'PENDING');

-- 거절은 파티장이 직접 UPDATE. 수락은 accept_recruit_application RPC 를 거친다
-- (멤버 추가·정원 확인과 원자적으로 묶여야 하기 때문).
create policy recruit_applications_update_leader on recruit_applications
  for update using (
    auth.uid() in (select p.leader_id from recruit_posts p where p.id = post_id)
  );

-- ══════════════════════════════════════════════════════════
-- 4. recruit_messages — 파티 채팅
-- ══════════════════════════════════════════════════════════
-- 용량 정책: 해산(close_recruit_post) 시 즉시 삭제 + 글 삭제 시 CASCADE.
-- 활성 파티 분량만 남아 누적되지 않는다 (§8 무료 티어 예산).
create table recruit_messages (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references recruit_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- 전송 시점 닉네임 스냅샷. 캐릭터를 바꾸거나 지워도 로그가 깨지지 않고,
  -- 조회할 때 characters 조인(과 그 RLS)을 타지 않아도 된다.
  nickname   text not null,
  message    text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create index idx_recruit_messages_post on recruit_messages (post_id, created_at desc);

alter table recruit_messages enable row level security;

create policy recruit_messages_read_members on recruit_messages
  for select using (
    exists (
      select 1
      from recruit_post_members m
      join recruit_posts p on p.id = m.post_id
      where m.post_id = recruit_messages.post_id
        and m.user_id = auth.uid()
        and p.status <> 'CLOSED'
    )
  );

create policy recruit_messages_insert_members on recruit_messages
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from recruit_post_members m
      join recruit_posts p on p.id = m.post_id
      where m.post_id = recruit_messages.post_id
        and m.user_id = auth.uid()
        and p.status <> 'CLOSED'
    )
  );
-- 수정·삭제 정책은 두지 않는다. 채팅 로그는 append-only.

-- ══════════════════════════════════════════════════════════
-- 5. manner_profiles — 매너온도
-- ══════════════════════════════════════════════════════════
-- 좋아요 +0.5 / 보통 0 / 싫어요 -0.5, 시작 30.0, 범위 0~99
create table manner_profiles (
  user_id        uuid primary key references auth.users on delete cascade,
  temperature    numeric(4, 1) not null default 30.0
                   check (temperature >= 0 and temperature <= 99),
  rating_count   int not null default 0,
  like_count     int not null default 0,
  neutral_count  int not null default 0,
  dislike_count  int not null default 0,
  -- 스티커 id → 받은 횟수
  sticker_counts jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

alter table manner_profiles enable row level security;

-- 매너온도는 신뢰 지표라 로그인 사용자에게 공개한다
create policy manner_profiles_read on manner_profiles
  for select using (auth.role() = 'authenticated');
-- 쓰기 정책 없음. 갱신은 submit_recruit_rating RPC 로만.

-- ══════════════════════════════════════════════════════════
-- 6. 평가 세션
-- ══════════════════════════════════════════════════════════
-- 파티가 해체되는 순간(해산·탈퇴·퇴장)에 그때 함께 있던 멤버로 세션을 만든다.
create table rating_sessions (
  id                    uuid primary key default gen_random_uuid(),
  -- 구인 글이 지워져도 평가 이력은 남긴다
  post_id               uuid references recruit_posts(id) on delete set null,
  post_title            text not null,
  category              text not null,
  trigger               text not null
                          check (trigger in ('PARTY_CLOSED', 'MEMBER_LEFT', 'MEMBER_KICKED')),
  triggered_by_nickname text not null default '',
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default (now() + interval '7 days')
);

-- 세션 시점의 멤버 스냅샷. 이후 캐릭터가 바뀌어도 당시 정보로 남는다.
create table rating_session_participants (
  session_id  uuid not null references rating_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  nickname    text not null,
  job         text not null default '',
  level       int  not null default 0,
  stat_attack bigint,
  primary key (session_id, user_id)
);

create table recruit_ratings (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references rating_sessions(id) on delete cascade,
  rater_id    uuid not null references auth.users on delete cascade,
  target_id   uuid not null references auth.users on delete cascade,
  value       text not null check (value in ('LIKE', 'NEUTRAL', 'DISLIKE')),
  sticker_ids text[] not null default '{}',
  created_at  timestamptz not null default now(),
  -- 같은 상대를 두 번 평가할 수 없다
  unique (session_id, rater_id, target_id),
  check (rater_id <> target_id)
);

create index idx_rating_participants_user on rating_session_participants (user_id);
create index idx_recruit_ratings_rater    on recruit_ratings (rater_id);
create index idx_recruit_ratings_target   on recruit_ratings (target_id);

alter table rating_sessions             enable row level security;
alter table rating_session_participants enable row level security;
alter table recruit_ratings             enable row level security;

/**
 * 참가 여부 확인 — SECURITY DEFINER 로 RLS 를 우회한다.
 *
 * 정책 안에서 rating_session_participants 를 직접 조회하면 그 조회에 또 정책이 걸려
 * 42P17 infinite recursion 이 난다 (maple_helper 0011 → 0013 에서 실제로 터진 문제).
 */
create or replace function is_rating_participant(p_session_id uuid)
returns boolean
language sql security definer stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from rating_session_participants
    where session_id = p_session_id and user_id = auth.uid()
  );
$$;

create policy rating_sessions_read_participant on rating_sessions
  for select using (is_rating_participant(id));

create policy rating_participants_read_participant on rating_session_participants
  for select using (is_rating_participant(session_id));

-- 내가 **남긴** 평가만 보인다. 받은 평가는 익명이어야 하므로 열지 않는다.
create policy recruit_ratings_read_own on recruit_ratings
  for select using (auth.uid() = rater_id);
-- 쓰기는 submit_recruit_rating RPC 로만.

-- ══════════════════════════════════════════════════════════
-- 7. recruit_history — 참여 이력
-- ══════════════════════════════════════════════════════════
-- recruit_post_members 는 탈퇴·퇴장·해산 시 행이 지워져 이력이 안 남는다.
-- append-only 로 따로 쌓는다.
create table recruit_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  post_id      uuid references recruit_posts(id) on delete set null,
  post_title   text not null,
  category     text not null default '',
  server_name  text not null default '',
  role         text not null check (role in ('LEADER', 'MEMBER')),
  joined_at    timestamptz not null,
  left_at      timestamptz not null default now(),
  leave_reason text not null check (leave_reason in ('LEFT', 'KICKED', 'PARTY_CLOSED'))
);

create index idx_recruit_history_user_left on recruit_history (user_id, left_at desc);

alter table recruit_history enable row level security;

create policy recruit_history_read_own on recruit_history
  for select using (auth.uid() = user_id);
-- 쓰기는 record_recruit_history RPC(SECURITY DEFINER)로만.

-- ══════════════════════════════════════════════════════════
-- 8. characters 조회 개방 — 0013 에서 미룬 것
-- ══════════════════════════════════════════════════════════
-- 0013 의 characters_manage_own 은 for all 이라 SELECT 까지 본인 것만 허용한다.
-- 그래서 구인 글·파티원 목록을 characters 와 조인하면 남의 캐릭터가 null 로 와서
-- 화면에 "알 수 없음"이 뜬다. 구인 글과 파티원은 공개 데이터이므로 거기 걸린
-- 캐릭터도 함께 연다. 신청서는 공개 대상이 아니라 신청자 본인과 파티장에게만.
--
-- (이 정책이 0013 이 아니라 여기 있는 이유: recruit_* 테이블이 이제야 생겼다.
--  0013 에 넣었으면 존재하지 않는 테이블을 참조해 실패했다.)
--
-- 정책이 행마다 EXISTS 를 타므로 조회 경로를 먼저 깔아 둔다.
create index idx_recruit_posts_character        on recruit_posts (character_id);
create index idx_recruit_post_members_character on recruit_post_members (character_id);
create index idx_recruit_applications_character on recruit_applications (character_id);

create policy characters_read_recruit_participants on characters
  for select using (
    -- 파티장 캐릭터 (구인 목록·상세에 노출)
    exists (select 1 from recruit_posts p where p.character_id = characters.id)
    -- 파티원 캐릭터 (멤버 목록에 노출)
    or exists (select 1 from recruit_post_members m where m.character_id = characters.id)
    -- 신청자 캐릭터 — 신청자 본인과 파티장만
    or exists (
      select 1
      from recruit_applications a
      join recruit_posts p on p.id = a.post_id
      where a.character_id = characters.id
        and (auth.uid() = a.user_id or auth.uid() = p.leader_id)
    )
  );

-- ══════════════════════════════════════════════════════════
-- 9. handle_new_user 3차 병합 ★
-- ══════════════════════════════════════════════════════════
-- **또 같은 함수다.** 0004(정산 초대 링크) → 0013(helper 프로필) 에 이어 세 번째로,
-- 이번엔 매너 프로필 생성이 붙는다. 앞의 두 동작을 지우면
--   - guild_accounts 링크가 사라져 초대 링크가 조용히 죽고
--   - user_profiles 가 안 생겨 helper 화면이 프로필 없는 상태가 된다
-- 셋을 모두 유지한다.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- 정산: 초대(guild_accounts)가 email 로 미리 만들어져 있으면 user_id 를 연결 — 0004
  update guild_accounts
     set user_id = new.id
   where email = new.email
     and user_id is null;

  -- helper: 서비스 전역 프로필 — 0013
  insert into user_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  -- 구인: 매너온도 프로필 — 0015
  insert into manner_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 기존 가입자 백필. 트리거는 INSERT 시점에만 돈다.
insert into manner_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ══════════════════════════════════════════════════════════
-- 10. RPC
-- ══════════════════════════════════════════════════════════
-- 전부 SECURITY DEFINER 다. RLS 를 우회하므로 각 함수가 권한을 **직접** 검사한다.

/** 구인 글 생성 + 파티장 멤버 등록을 원자적으로. 나눠 호출하면 멤버 0명 유령 글이 남는다 */
create or replace function create_recruit_post(
  p_character_id         uuid,
  p_title                text,
  p_category             text,
  p_max_members          smallint,
  p_server_name          text,
  p_required_stat_attack bigint default null,
  p_spec_description     text   default null,
  p_leader_stat_attack   bigint default null,
  p_leader_spec          text   default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_post_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- SECURITY DEFINER 는 RLS 를 우회하므로 캐릭터 소유권을 명시적으로 확인한다
  if not exists (select 1 from characters where id = p_character_id and user_id = v_uid) then
    raise exception '본인의 캐릭터가 아닙니다.';
  end if;

  insert into recruit_posts (
    leader_id, character_id, title, category, max_members, server_name,
    required_stat_attack, spec_description, leader_stat_attack, leader_spec
  ) values (
    v_uid, p_character_id, p_title, p_category, p_max_members, p_server_name,
    p_required_stat_attack, p_spec_description, p_leader_stat_attack, p_leader_spec
  )
  returning id into v_post_id;

  insert into recruit_post_members (post_id, user_id, character_id, role)
  values (v_post_id, v_uid, p_character_id, 'LEADER');

  return v_post_id;
end;
$$;

/**
 * 평가 세션 생성 — 파티 해체 시 호출. 2명 미만이면 만들지 않는다(평가할 상대가 없다).
 * **반드시 멤버 삭제 전에** 부를 것. 스냅샷을 recruit_post_members 에서 뜨기 때문이다.
 */
create or replace function create_rating_session(
  p_post_id      uuid,
  p_trigger      text,
  p_triggered_by text,
  p_user_ids     uuid[]
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_post    recruit_posts%rowtype;
  v_session uuid;
begin
  if array_length(p_user_ids, 1) is null or array_length(p_user_ids, 1) < 2 then
    return null;
  end if;

  select * into v_post from recruit_posts where id = p_post_id;
  if not found then
    return null;
  end if;

  insert into rating_sessions (post_id, post_title, category, trigger, triggered_by_nickname)
  values (p_post_id, v_post.title, v_post.category, p_trigger, coalesce(p_triggered_by, ''))
  returning id into v_session;

  insert into rating_session_participants (session_id, user_id, nickname, job, level, stat_attack)
  select
    v_session,
    m.user_id,
    coalesce(c.nickname, '알 수 없음'),
    coalesce(c.job, ''),
    coalesce(c.level, 0),
    c.stat_attack
  from recruit_post_members m
  left join characters c on c.id = m.character_id
  where m.post_id = p_post_id
    and m.user_id = any(p_user_ids);

  return v_session;
end;
$$;

/** 참여 이력 기록 — 이것도 멤버 삭제 전에 부를 것 */
create or replace function record_recruit_history(
  p_post_id  uuid,
  p_user_ids uuid[],
  p_reason   text
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if array_length(p_user_ids, 1) is null then
    return;
  end if;

  insert into recruit_history (
    user_id, post_id, post_title, category, server_name, role, joined_at, leave_reason
  )
  select m.user_id, p.id, p.title, p.category, p.server_name, m.role, m.joined_at, p_reason
  from recruit_post_members m
  join recruit_posts p on p.id = m.post_id
  where m.post_id = p_post_id
    and m.user_id = any(p_user_ids);
end;
$$;

/** 지원 수락 — 신청·글 행을 잠가 동시 수락 시 정원 초과를 막는다 */
create or replace function accept_recruit_application(p_application_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_app   recruit_applications%rowtype;
  v_post  recruit_posts%rowtype;
  v_count int;
begin
  select * into v_app from recruit_applications where id = p_application_id for update;
  if not found then
    raise exception '신청을 찾을 수 없습니다.';
  end if;
  if v_app.status <> 'PENDING' then
    raise exception '이미 처리된 신청입니다.';
  end if;

  select * into v_post from recruit_posts where id = v_app.post_id for update;
  if not found then
    raise exception '구인 글을 찾을 수 없습니다.';
  end if;
  if v_post.leader_id <> auth.uid() then
    raise exception '파티장만 신청을 수락할 수 있습니다.';
  end if;
  if v_post.status = 'CLOSED' then
    raise exception '해산된 파티입니다.';
  end if;

  select count(*) into v_count from recruit_post_members where post_id = v_post.id;
  if v_count >= v_post.max_members then
    raise exception '파티 정원이 가득 찼습니다.';
  end if;

  update recruit_applications set status = 'ACCEPTED' where id = p_application_id;

  insert into recruit_post_members (post_id, user_id, character_id, role)
  values (v_post.id, v_app.user_id, v_app.character_id, 'MEMBER');

  if v_count + 1 >= v_post.max_members then
    update recruit_posts set status = 'FULL' where id = v_post.id;
  end if;
end;
$$;

/** 탈퇴 — 평가 세션과 이력을 남긴 뒤 나간다. 반환값은 평가 세션 id (없으면 null) */
create or replace function leave_recruit_post(p_post_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_post     recruit_posts%rowtype;
  v_nickname text;
  v_members  uuid[];
  v_session  uuid;
  v_count    int;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_post from recruit_posts where id = p_post_id for update;
  if not found then
    raise exception '구인 글을 찾을 수 없습니다.';
  end if;
  if v_post.leader_id = v_uid then
    raise exception '파티장은 탈퇴할 수 없습니다. 파티를 해산해주세요.';
  end if;
  if not exists (
    select 1 from recruit_post_members where post_id = p_post_id and user_id = v_uid
  ) then
    raise exception '참여 중인 파티가 아닙니다.';
  end if;

  select coalesce(c.nickname, '알 수 없음') into v_nickname
  from recruit_post_members m
  left join characters c on c.id = m.character_id
  where m.post_id = p_post_id and m.user_id = v_uid;

  select array_agg(user_id) into v_members
  from recruit_post_members where post_id = p_post_id;

  v_session := create_rating_session(p_post_id, 'MEMBER_LEFT', v_nickname, v_members);
  perform record_recruit_history(p_post_id, array[v_uid], 'LEFT');

  delete from recruit_post_members where post_id = p_post_id and user_id = v_uid;

  select count(*) into v_count from recruit_post_members where post_id = p_post_id;
  if v_post.status = 'FULL' and v_count < v_post.max_members then
    update recruit_posts set status = 'OPEN' where id = p_post_id;
  end if;

  return v_session;
end;
$$;

/** 강제 퇴장 — 파티장 전용 */
create or replace function kick_recruit_member(p_post_id uuid, p_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_post     recruit_posts%rowtype;
  v_nickname text;
  v_members  uuid[];
  v_session  uuid;
  v_count    int;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_post from recruit_posts where id = p_post_id for update;
  if not found then
    raise exception '구인 글을 찾을 수 없습니다.';
  end if;
  if v_post.leader_id <> v_uid then
    raise exception '파티장만 퇴장시킬 수 있습니다.';
  end if;
  if p_user_id = v_uid then
    raise exception '파티장은 스스로를 퇴장시킬 수 없습니다.';
  end if;
  if not exists (
    select 1 from recruit_post_members where post_id = p_post_id and user_id = p_user_id
  ) then
    raise exception '해당 파티원을 찾을 수 없습니다.';
  end if;

  select coalesce(c.nickname, '알 수 없음') into v_nickname
  from recruit_post_members m
  left join characters c on c.id = m.character_id
  where m.post_id = p_post_id and m.user_id = p_user_id;

  select array_agg(user_id) into v_members
  from recruit_post_members where post_id = p_post_id;

  v_session := create_rating_session(p_post_id, 'MEMBER_KICKED', v_nickname, v_members);
  perform record_recruit_history(p_post_id, array[p_user_id], 'KICKED');

  delete from recruit_post_members where post_id = p_post_id and user_id = p_user_id;

  select count(*) into v_count from recruit_post_members where post_id = p_post_id;
  if v_post.status = 'FULL' and v_count < v_post.max_members then
    update recruit_posts set status = 'OPEN' where id = p_post_id;
  end if;

  return v_session;
end;
$$;

/**
 * 해산 — 파티장 전용.
 * 멤버 행까지 지운다. 남겨두면 "유령 소속"이 되어 다음 파티에 못 들어간다
 * (single-active 트리거가 걸린다). 이력은 recruit_history 에 남으므로 유실이 없다.
 */
create or replace function close_recruit_post(p_post_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_nickname text;
  v_members  uuid[];
  v_session  uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not exists (
    select 1 from recruit_posts where id = p_post_id and leader_id = v_uid
  ) then
    raise exception '파티장만 파티를 해산할 수 있습니다.';
  end if;

  select coalesce(c.nickname, '알 수 없음') into v_nickname
  from recruit_post_members m
  left join characters c on c.id = m.character_id
  where m.post_id = p_post_id and m.user_id = v_uid;

  select array_agg(user_id) into v_members
  from recruit_post_members where post_id = p_post_id;

  -- 스냅샷과 이력을 먼저 남긴 뒤 정리한다
  v_session := create_rating_session(p_post_id, 'PARTY_CLOSED', v_nickname, v_members);
  perform record_recruit_history(p_post_id, v_members, 'PARTY_CLOSED');

  update recruit_posts
     set status = 'CLOSED',
         -- 해산한 파티가 심콜 타이머를 물고 있을 이유가 없다
         buff_started_at = null
   where id = p_post_id;

  delete from recruit_messages where post_id = p_post_id;
  delete from recruit_post_members where post_id = p_post_id;

  return v_session;
end;
$$;

/** 평가 제출 — 중복은 unique(session_id, rater_id, target_id) 가 막는다 */
create or replace function submit_recruit_rating(
  p_session_id  uuid,
  p_target_id   uuid,
  p_value       text,
  p_sticker_ids text[]
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_session rating_sessions%rowtype;
  v_delta   numeric(4, 1);
  v_sticker text;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if v_uid = p_target_id then
    raise exception '본인은 평가할 수 없습니다.';
  end if;

  select * into v_session from rating_sessions where id = p_session_id for update;
  if not found then
    raise exception '평가 세션을 찾을 수 없습니다.';
  end if;
  if v_session.expires_at <= now() then
    raise exception '평가 기간이 지났습니다.';
  end if;

  -- 평가자와 대상이 모두 그 세션의 참가자여야 한다
  if not exists (
    select 1 from rating_session_participants where session_id = p_session_id and user_id = v_uid
  ) then
    raise exception '이 파티의 참가자가 아닙니다.';
  end if;
  if not exists (
    select 1 from rating_session_participants
    where session_id = p_session_id and user_id = p_target_id
  ) then
    raise exception '평가 대상이 아닙니다.';
  end if;

  insert into recruit_ratings (session_id, rater_id, target_id, value, sticker_ids)
  values (p_session_id, v_uid, p_target_id, p_value, coalesce(p_sticker_ids, '{}'));

  v_delta := case p_value when 'LIKE' then 0.5 when 'DISLIKE' then -0.5 else 0 end;

  insert into manner_profiles (user_id) values (p_target_id) on conflict (user_id) do nothing;

  update manner_profiles
     set temperature   = least(99, greatest(0, temperature + v_delta)),
         rating_count  = rating_count + 1,
         like_count    = like_count    + (case when p_value = 'LIKE'    then 1 else 0 end),
         neutral_count = neutral_count + (case when p_value = 'NEUTRAL' then 1 else 0 end),
         dislike_count = dislike_count + (case when p_value = 'DISLIKE' then 1 else 0 end),
         updated_at    = now()
   where user_id = p_target_id;

  foreach v_sticker in array coalesce(p_sticker_ids, '{}') loop
    update manner_profiles
       set sticker_counts = jsonb_set(
             sticker_counts,
             array[v_sticker],
             to_jsonb(coalesce((sticker_counts ->> v_sticker)::int, 0) + 1)
           )
     where user_id = p_target_id;
  end loop;
end;
$$;

-- ══════════════════════════════════════════════════════════
-- 11. Realtime
-- ══════════════════════════════════════════════════════════
-- publication 에 테이블을 넣지 않으면 구독은 연결만 되고 이벤트가 한 건도 안 온다.
-- (maple_helper 에서 "새 신청이 실시간으로 안 뜨던" 원인)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'recruit_posts', 'recruit_post_members', 'recruit_applications', 'recruit_messages'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- DELETE 이벤트에도 post_id 가 실려야 클라이언트 필터(post_id=eq.X)가 동작한다.
-- 기본 replica identity 는 PK 만 보내서 탈퇴·철회가 상대 화면에 반영되지 않는다.
alter table recruit_posts        replica identity full;
alter table recruit_post_members replica identity full;
alter table recruit_applications replica identity full;
alter table recruit_messages     replica identity full;

-- ══════════════════════════════════════════════════════════
-- 12. GRANT
-- ══════════════════════════════════════════════════════════
-- PostgREST 는 GRANT 가 없으면 RLS 가 맞아도 42501 을 낸다 (0004 P1-7).
--
-- 쓰기를 RPC 로 좁힌 곳이 있다. maple_helper 보다 엄격하다:
--   recruit_posts        INSERT 없음 — create_recruit_post 로만 (유령 글 방지)
--   recruit_post_members SELECT 만  — **직접 INSERT 를 열면 승인 없이 아무 파티에나
--                                     자기를 밀어 넣을 수 있다.** 원본의 구멍이었다
--   recruit_ratings      SELECT 만  — 매너온도가 같이 갱신돼야 해서 RPC 전용
--   manner_profiles      SELECT 만  — 자기 온도를 직접 올리면 지표가 무의미해진다
--   recruit_history      SELECT 만  — 이력은 시스템이 쓴다
GRANT SELECT, UPDATE, DELETE         ON recruit_posts               TO authenticated;
GRANT SELECT                         ON recruit_post_members        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recruit_applications        TO authenticated;
GRANT SELECT, INSERT                 ON recruit_messages            TO authenticated;
GRANT SELECT                         ON manner_profiles             TO authenticated;
GRANT SELECT                         ON rating_sessions             TO authenticated;
GRANT SELECT                         ON rating_session_participants TO authenticated;
GRANT SELECT                         ON recruit_ratings             TO authenticated;
GRANT SELECT                         ON recruit_history             TO authenticated;

GRANT EXECUTE ON FUNCTION create_recruit_post(uuid, text, text, smallint, text, bigint, text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_recruit_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_recruit_post(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION kick_recruit_member(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION close_recruit_post(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION submit_recruit_rating(uuid, uuid, text, text[]) TO authenticated;
-- create_rating_session · record_recruit_history 는 위 RPC 내부에서만 부른다.
-- 밖에서 호출하면 임의의 세션·이력을 만들 수 있으므로 GRANT 하지 않는다.
