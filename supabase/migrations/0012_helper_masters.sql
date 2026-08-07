-- 0012_helper_masters.sql — 공용 마스터 교체 (MERGE_PLAN §3.2 · §7 1단계)
--
-- maple_helper 흡수를 위한 첫 스키마 작업. 두 제품이 **같이 쓸** 마스터를
-- maple_helper 쪽 정의(상위집합)로 맞춘다. 여기서 맞춰두지 않으면 0013 에서
-- 들어올 characters·user_boss_tracking·char_boss_entries 가 전부 걸린다.
--
--   1) bosses        uuid PK 3컬럼 → text PK 8컬럼
--   2) game_servers  uuid PK 2컬럼 → text PK 5컬럼
--   3) boss_entries.boss_id  uuid → text (bosses PK 변경에 따라)
--
-- 왜 helper 쪽이 이기나: helper 는 cycle(일간/주간)·reset_hour_kst·difficulty·
-- sort_order·max_entries 를 실제로 쓰는데 raid_receipt 는 name·cooldown_hours 만 쓴다.
-- 교체 비용도 이쪽이 압도적으로 싸다 — bosses 를 참조하는 곳이 boss_entries.boss_id
-- 하나뿐이기 때문이다. raids 는 boss_name 텍스트 스냅샷만 쓰고 FK 가 없다
-- (0001_init.sql:110). 그래서 PK 타입 교체가 컬럼 하나로 끝난다.
--
-- 왜 슬러그 id 인가: helper 코드가 'zakum' 같은 안정적인 문자열 id 를 전제한다.
-- uuid 는 환경마다 값이 달라져서 마스터를 코드/시드로 관리할 수 없다.
--
-- 기존 행은 버리지 않는다. raid_receipt seed 의 보스 6종은 이름이 helper 8종에
-- 모두 포함되므로 **이름으로 슬러그를 매핑**해 boss_entries 의 참조를 그대로 살린다.
-- 관리자가 손으로 넣은 미지의 보스는 legacy- 접두어로 살려둔다(마이그레이션 실패 방지).
--
-- 적용: supabase db push (또는 supabase migration up)

-- ── 0. 주기 enum ─────────────────────────────────────────
create type boss_cycle as enum ('DAILY', 'WEEKLY');

-- ── 1. bosses: 컬럼 확장 + 슬러그 산출 ───────────────────
alter table bosses add column cycle          boss_cycle  not null default 'DAILY';
alter table bosses add column reset_hour_kst int         not null default 0;
alter table bosses add column difficulty     text        not null default 'normal';
alter table bosses add column sort_order     int         not null default 0;
-- 하루에 몇 번까지 입장 가능한가. helper 보스 추적이 쓴다.
alter table bosses add column max_entries    int         not null default 2;
alter table bosses add column slug           text;

update bosses set slug = case name
  when '자쿰'              then 'zakum'
  when '혼테일'            then 'horntail'
  when '파풀라투스'         then 'papulatus'
  when '카오스 자쿰'        then 'chaos-zakum'
  when '카오스 혼테일'      then 'chaos-horntail'
  when '핑크빈'            then 'pinkbean'
  when '카오스 핑크빈'      then 'chaos-pinkbean'
  when '카오스 파풀라투스'   then 'chaos-papulatus'
  -- 시드에 없던 보스 — 이름을 모르므로 기존 uuid 로 충돌 없는 id 를 만든다
  else 'legacy-' || replace(id::text, '-', '')
end;

-- ── 2. boss_entries.boss_id 를 슬러그로 옮겨 담는다 ──────
-- 순서 주의: bosses.id 를 먼저 지우면 FK 때문에 cascade 가 필요하고,
-- 그러면 입장 기록의 보스 연결이 통째로 날아간다.
alter table boss_entries add column boss_slug text;
update boss_entries be set boss_slug = b.slug from bosses b where b.id = be.boss_id;

-- 컬럼을 지우면 FK 와 (guild_id, party_id, boss_id, entered_at desc) 인덱스도 같이 사라진다.
alter table boss_entries drop column boss_id;
alter table boss_entries rename column boss_slug to boss_id;

-- ── 3. bosses PK 교체 ────────────────────────────────────
alter table bosses drop column id;                    -- PK 제약도 함께 사라진다
alter table bosses rename column slug to id;
alter table bosses alter column id set not null;
alter table bosses add primary key (id);

-- ── 4. boss_entries FK · 인덱스 복구 ─────────────────────
-- 보스 마스터에서 삭제돼도 기록은 남긴다 → set null (0002 정책 그대로).
-- boss_name 스냅샷이 있어서 연결이 끊겨도 화면은 보스 이름을 잃지 않는다.
alter table boss_entries
  add constraint boss_entries_boss_id_fkey
  foreign key (boss_id) references bosses(id) on delete set null;

create index on boss_entries (guild_id, party_id, boss_id, entered_at desc);

-- ── 5. 보스 마스터 정본 ──────────────────────────────────
-- 시드가 아니라 마이그레이션에 둔다. helper 코드가 이 id 를 전제하므로
-- 운영 DB 에도 반드시 있어야 하는 참조 데이터다(샘플 데이터가 아니다).
-- 기존 6종은 helper 정의로 정규화되고, 파풀라투스 2종이 새로 들어온다.
insert into bosses (id, name, cycle, cooldown_hours, reset_hour_kst, difficulty, sort_order, max_entries) values
  ('zakum',           '자쿰',             'DAILY',   24, 0, 'normal', 1, 2),
  ('horntail',        '혼테일',           'DAILY',   24, 0, 'normal', 2, 2),
  ('papulatus',       '파풀라투스',        'DAILY',   24, 0, 'normal', 3, 2),
  ('chaos-zakum',     '카오스 자쿰',       'DAILY',   24, 0, 'chaos',  4, 2),
  ('chaos-horntail',  '카오스 혼테일',     'DAILY',   24, 0, 'chaos',  5, 2),
  ('pinkbean',        '핑크빈',           'WEEKLY', 168, 0, 'normal', 6, 2),
  ('chaos-pinkbean',  '카오스 핑크빈',     'WEEKLY', 168, 0, 'chaos',  7, 2),
  ('chaos-papulatus', '카오스 파풀라투스',  'WEEKLY', 168, 0, 'chaos',  8, 2)
on conflict (id) do update set
  name           = excluded.name,
  cycle          = excluded.cycle,
  cooldown_hours = excluded.cooldown_hours,
  reset_hour_kst = excluded.reset_hour_kst,
  difficulty     = excluded.difficulty,
  sort_order     = excluded.sort_order,
  max_entries    = excluded.max_entries;

-- ── 6. game_servers ──────────────────────────────────────
-- maple_helper 의 servers 와 같은 개념이라 raid_receipt 이름(game_servers)을 유지하고
-- 컬럼만 흡수한다 (MERGE_PLAN §3). 참조하는 FK 가 없어 교체가 자유롭다.
--
-- 이 표는 FK 대상이 아니라 **드롭다운 소스**다. 양쪽 다 서버를 자유 입력 text 로 들고 있다
-- (raid_receipt `guilds.server_name`, maple_helper `characters.server_name`·`parties.server_name`).
-- 0013 이관 때도 이 구조를 유지한다 — 지금 FK 로 조이면 기존 자유 입력 값이 전부 걸린다.
alter table game_servers add column sort_order int         not null default 0;
alter table game_servers add column is_active  boolean     not null default true;
alter table game_servers add column created_at timestamptz not null default now();
alter table game_servers add column slug       text;

update game_servers set slug = case name
  when '메이플랜드'   then 'maple-land'
  when '메이플플래닛' then 'maple-planet'
  else 'legacy-' || replace(id::text, '-', '')
end;

alter table game_servers drop column id;
alter table game_servers rename column slug to id;
alter table game_servers alter column id set not null;
alter table game_servers add primary key (id);

insert into game_servers (id, name, sort_order) values
  ('maple-land',   '메이플랜드',   1),
  ('maple-planet', '메이플플래닛', 2)
on conflict (id) do update set
  name       = excluded.name,
  sort_order = excluded.sort_order;

-- RLS(bosses_read · servers_read)와 GRANT SELECT 는 테이블 단위라 그대로 유효하다.
-- 0002 의 bosses_cooldown_hours_range check 도 컬럼이 유지되므로 살아 있다.
