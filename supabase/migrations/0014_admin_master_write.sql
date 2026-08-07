-- 0014_admin_master_write.sql — 시스템 관리자에게 마스터 쓰기 권한을 연다
--
-- AdminPage 에 보스·서버 추가/삭제 UI 가 있는데 눌러도 아무 일도 안 났다.
-- 버그가 아니라 3개 층이 전부 막혀 있었다:
--   1) FE  lib/masters.ts 의 addBoss·deleteBoss·updateBossCooldown 이 예외를 던지는 스텁
--   2) GRANT  0004_rls_fix.sql:353 에 GRANT SELECT ON bosses 뿐 — 쓰기 권한 없음
--   3) RLS  0001_init.sql:320 의 bosses_read 는 SELECT 전용 — 쓰기 정책 없음
-- 이 파일이 2)3) 을 열고, FE 스텁은 같은 커밋에서 구현한다.
--
-- 왜 길드 관리자가 아니라 시스템 관리자인가:
-- 0012 이후 bosses · game_servers 는 정산과 helper 가 **같이 쓰는 전역 마스터**다.
-- 길드 A 의 관리자가 지운 보스가 길드 B 와 helper 사용자 전원에게서 사라지면 안 된다.
-- 그래서 0004 의 admins 테이블 + is_admin() 을 그대로 재사용한다.
--
-- ⚠️ admins 는 정책이 없어 authenticated 가 접근할 수 없다(0004:16). 행 추가는
--    service_role 로만 — 대시보드 SQL Editor 에서 직접 넣어야 한다:
--
--      insert into admins (user_id)
--      select id from auth.users where email = '<본인 이메일>'
--      on conflict (user_id) do nothing;
--
-- 적용: supabase db push (또는 supabase migration up)

-- ── 1. bosses 쓰기 정책 ──────────────────────────────────
-- 기존 bosses_read(SELECT, authenticated)는 그대로 둔다. 정책은 OR 로 합쳐지므로
-- 읽기는 계속 전원 허용이고, 쓰기만 관리자로 좁혀진다.
create policy bosses_admin_insert on bosses for insert with check (is_admin());
create policy bosses_admin_update on bosses for update using (is_admin()) with check (is_admin());
create policy bosses_admin_delete on bosses for delete using (is_admin());

-- ── 2. game_servers 쓰기 정책 ────────────────────────────
create policy game_servers_admin_insert on game_servers for insert with check (is_admin());
create policy game_servers_admin_update on game_servers for update using (is_admin()) with check (is_admin());
create policy game_servers_admin_delete on game_servers for delete using (is_admin());

-- ── 3. GRANT ────────────────────────────────────────────
-- GRANT 는 authenticated 전체에 주고 실제 제한은 위 RLS 가 한다 (raid_receipt 표준 패턴).
-- GRANT 가 없으면 RLS 가 맞아도 PostgREST 가 permission denied(42501) 를 낸다.
GRANT INSERT, UPDATE, DELETE ON bosses       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON game_servers TO authenticated;

-- ── 4. 파풀라투스 2종 제거 ───────────────────────────────
-- 0012 가 maple_helper 시드를 정본으로 삼으면서 따라 들어왔는데, 운영에서 쓰지 않는다.
--
-- 참조 정리:
--   user_boss_tracking.boss_id  → on delete cascade  (해당 보스 참조 0행)
--   char_boss_entries.boss_id   → on delete cascade  (0013 에서 막 생성, 0행)
--   boss_entries.boss_id        → on delete set null (혼테일 1행뿐, 무관)
--   raids.boss_name             → FK 없는 텍스트 스냅샷, 영향 없음
--
-- 앞으로 보스를 더 지우거나 추가할 때는 마이그레이션 말고 AdminPage 를 쓰면 된다.
-- 위 1~3 이 그걸 가능하게 만든다.
delete from bosses where id in ('papulatus', 'chaos-papulatus');
