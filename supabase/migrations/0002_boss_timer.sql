-- 0002_boss_timer.sql — 보스 입장 기록 + 재입장 쿨타임
-- FE apps/web/src/lib/api.ts (BossEntry, getBossEntries/recordBossEntry/updateBossEntry/
-- deleteBossEntry) 와 lib/bossTimer.ts 의 계산 규칙을 반영.
-- 적용: supabase db push  (또는 supabase migration up)

-- ── 보스별 재입장 쿨타임 ─────────────────────────────────
-- 다음 입장 가능 시각 = entered_at + cooldown_hours.
-- 코드에 24 를 박지 않고 마스터 값으로 두어, 주 1회 보스(168)나 게임 규칙 변경을
-- 관리자 화면에서 숫자만 고쳐 대응한다. seed.sql 의 기존 INSERT 는 default 로 채워진다.
alter table bosses add column cooldown_hours int not null default 24;

-- 오타(24 → 240)로 타이머가 사실상 안 열리는 걸 막는다. FE MAX_COOLDOWN_HOURS 와 같은 값.
alter table bosses add constraint bosses_cooldown_hours_range
  check (cooldown_hours between 1 and 720);

-- ── 보스 입장 기록 ───────────────────────────────────────
-- raids 에 컬럼으로 붙이지 않고 테이블을 분리한 이유:
-- 입장했지만 정산하지 않는 레이드(실패·꽝·파토)가 있는데, 입장 시각을 raids 행에 매달면
-- 그런 건이 통째로 누락돼 타이머가 틀린 값을 보여준다. 두 기록은 생명주기가 다르다.
--
-- 쿨타임 자체는 캐릭터 단위지만, 공대가 같이 도는 운영을 전제로 (공대, 보스) 단위로 잡는다.
-- 임시 공대(raids.party_name is null)는 party_id 가 없어 타이머 대상이 아니다.
--
-- 덮어쓰지 않고 쌓는다(append-only). 취소가 "마지막 행 삭제"로 풀리고, 입장 이력 화면을
-- 나중에 붙일 때 구조를 바꿀 필요가 없다. 조회는 (party_id, boss_id) 별 최신 1건.
create table boss_entries (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  party_id   uuid not null references parties(id) on delete cascade,
  -- 보스 마스터에서 삭제돼도 기록은 남긴다 → boss_name 스냅샷 (raids.boss_name 과 같은 정책)
  boss_id    uuid references bosses(id) on delete set null,
  boss_name  text not null,
  -- 실제 입장 시각. "지금 입장"을 늦게 눌렀을 때 사용자가 보정할 수 있다.
  entered_at timestamptz not null default now(),
  -- 기록을 남긴 시각. entered_at 이 보정돼도 이건 그대로라 감사 추적이 가능하다.
  created_at timestamptz not null default now()
);

-- 최신 1건 조회((party_id, boss_id) 그룹별 entered_at desc)를 그대로 태우는 인덱스
create index on boss_entries (guild_id, party_id, boss_id, entered_at desc);

-- ── RLS ──────────────────────────────────────────────────
-- 0001 의 헬퍼 auth_user_guilds() 재사용. MVP 정책 "같은 길드 = 전권"(§9)을 따른다.
alter table boss_entries enable row level security;
create policy boss_entries_same_guild on boss_entries
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

-- TODO(BE): 미래 시각 거부는 FE(updateBossEntry)와 여기 양쪽에서 막아야 한다.
-- check (entered_at <= now()) 는 now() 가 immutable 이 아니라 CHECK 제약으로 못 쓴다
-- → BEFORE INSERT/UPDATE 트리거로 구현할 것.

-- TODO(BE): 디스코드 예약 알림을 붙일 때 —
-- entered_at + (cooldown_hours || ' hours')::interval 이 지난 건을 pg_cron 으로 훑어
-- functions/discord-send 를 호출한다. 발송 중복을 막으려면 notified_at 컬럼을 추가할 것.
