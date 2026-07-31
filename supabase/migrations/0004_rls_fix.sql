-- 0004_rls_fix.sql — RLS 갭 수정 + GRANT + RPC 구현
-- BE_PROGRESS.md P1-1 ~ P1-7 항목. SETUP.md:182-197 에서 발견된 문제 해결.
-- 적용: supabase db push (또는 supabase migration up)

-- ══════════════════════════════════════════════════════════
-- P1-5: admins 테이블 + is_admin() 헬퍼 + error_logs 정책
-- ══════════════════════════════════════════════════════════
-- FE AdminPage.getErrorLogs 가 이걸 기다림 (0001_init.sql:332 TODO).
-- admins 행 추가는 service_role 로만 (대시보드 SQL Editor 또는 Edge Function).

CREATE TABLE admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
-- 정책 없음 → authenticated 접근 불가, service_role 만 관리.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

CREATE POLICY error_logs_admin_read ON error_logs
  FOR SELECT USING (is_admin());

-- ══════════════════════════════════════════════════════════
-- P1-3: user_id 자동 링크 (첫 가입 시 email 매칭)
-- ══════════════════════════════════════════════════════════
-- guild_accounts 가 email 로 미리 생성(초대)되었을 때, 그 사람이 실제로 가입하면
-- user_id 를 채워 auth_user_guilds() 가 동작하게 한다.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE guild_accounts
    SET user_id = NEW.id
    WHERE email = NEW.email
      AND user_id IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ══════════════════════════════════════════════════════════
-- P1-4: webhook_url SELECT 차단 + RPC
-- ══════════════════════════════════════════════════════════
-- guilds.webhook_url 은 디스코드 비밀 URL. 길드원 전원에게 노출되면 안 된다.
-- GRANT 섹션에서 guilds 는 column-level SELECT(webhook_url 제외)로 처리.
-- 읽기/쓰기는 OWNER/ADMIN 전용 RPC.

CREATE OR REPLACE FUNCTION get_webhook_url(p_guild_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url text;
  v_caller guild_accounts;
BEGIN
  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = p_guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role = 'MEMBER' THEN
    RAISE EXCEPTION 'only OWNER/ADMIN can view webhook URL';
  END IF;

  SELECT webhook_url INTO v_url FROM guilds WHERE id = p_guild_id;
  RETURN v_url;
END;
$$;

CREATE OR REPLACE FUNCTION set_webhook_url(p_guild_id uuid, p_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller guild_accounts;
BEGIN
  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = p_guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role = 'MEMBER' THEN
    RAISE EXCEPTION 'only OWNER/ADMIN can set webhook URL';
  END IF;

  UPDATE guilds SET webhook_url = p_url WHERE id = p_guild_id;

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (p_guild_id, v_caller.email, '웹훅 URL 변경',
            CASE WHEN p_url IS NULL THEN '삭제' ELSE '설정' END);
END;
$$;

-- ══════════════════════════════════════════════════════════
-- P1-2: 권한 상승 방지
-- ══════════════════════════════════════════════════════════
-- 기존 accounts_same_guild(for all) → SELECT 만 남기고
-- INSERT/UPDATE/DELETE 는 SECURITY DEFINER RPC 전용.

DROP POLICY accounts_same_guild ON guild_accounts;

CREATE POLICY accounts_select ON guild_accounts
  FOR SELECT USING (guild_id IN (SELECT auth_user_guilds()));

-- role 변경: OWNER 만 가능. 마지막 OWNER 보호.
CREATE OR REPLACE FUNCTION update_account_role(
  p_account_id uuid,
  p_role account_role
)
RETURNS guild_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target guild_accounts;
  v_old_role account_role;
  v_caller guild_accounts;
  v_owner_count int;
BEGIN
  SELECT * INTO v_target FROM guild_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;

  v_old_role := v_target.role;

  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = v_target.guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role != 'OWNER' THEN
    RAISE EXCEPTION 'only OWNER can change roles';
  END IF;

  -- 마지막 OWNER 강등 방지
  IF v_old_role = 'OWNER' AND p_role != 'OWNER' THEN
    SELECT count(*) INTO v_owner_count FROM guild_accounts
      WHERE guild_id = v_target.guild_id AND role = 'OWNER';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot remove last OWNER';
    END IF;
  END IF;

  UPDATE guild_accounts SET role = p_role WHERE id = p_account_id
    RETURNING * INTO v_target;

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_target.guild_id, v_caller.email, '권한 변경',
            v_target.name || ': ' || v_old_role::text || ' → ' || p_role::text);

  RETURN v_target;
END;
$$;

-- 계정 제거: OWNER 만 가능. 마지막 OWNER 삭제 방지.
CREATE OR REPLACE FUNCTION remove_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target guild_accounts;
  v_caller guild_accounts;
  v_owner_count int;
BEGIN
  SELECT * INTO v_target FROM guild_accounts WHERE id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;

  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = v_target.guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role != 'OWNER' THEN
    RAISE EXCEPTION 'only OWNER can remove accounts';
  END IF;

  IF v_target.role = 'OWNER' THEN
    SELECT count(*) INTO v_owner_count FROM guild_accounts
      WHERE guild_id = v_target.guild_id AND role = 'OWNER';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot remove last OWNER';
    END IF;
  END IF;

  DELETE FROM guild_accounts WHERE id = p_account_id;

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_target.guild_id, v_caller.email, '계정 제거',
            v_target.name || ' (' || v_target.email || ')');
END;
$$;

-- ══════════════════════════════════════════════════════════
-- P1-1: 길드 생성 + 초대 redeem RPC
-- ══════════════════════════════════════════════════════════
-- 두 함수 모두 "아직 길드에 속하지 않은 유저"가 호출 → RLS 우회 필요 → SECURITY DEFINER.

-- 길드 생성: guilds + guild_accounts(OWNER) + guild_settings 를 원자적으로 생성.
CREATE OR REPLACE FUNCTION create_guild(
  p_server_name text,
  p_guild_name text,
  p_display_name text DEFAULT NULL
)
RETURNS guilds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_guild guilds;
  v_email text;
  v_name text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  v_name := COALESCE(NULLIF(trim(p_display_name), ''), split_part(v_email, '@', 1));

  INSERT INTO guilds (server_name, guild_name)
    VALUES (p_server_name, p_guild_name)
    RETURNING * INTO v_guild;

  INSERT INTO guild_accounts (guild_id, user_id, email, name, role)
    VALUES (v_guild.id, auth.uid(), v_email, v_name, 'OWNER');

  INSERT INTO guild_settings (guild_id)
    VALUES (v_guild.id);

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_guild.id, v_email, '길드 생성',
            v_guild.server_name || ' / ' || v_guild.guild_name);

  RETURN v_guild;
END;
$$;

-- 초대 수락: invite 검증 → guild_accounts 생성 → invite 사용 처리.
CREATE OR REPLACE FUNCTION redeem_invite(
  p_code text,
  p_display_name text DEFAULT NULL
)
RETURNS guild_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite invites;
  v_email text;
  v_name text;
  v_account guild_accounts;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  v_name := COALESCE(NULLIF(trim(p_display_name), ''), split_part(v_email, '@', 1));

  -- 유효한 미사용 초대 코드 찾기
  SELECT * INTO v_invite FROM invites
    WHERE code = upper(trim(p_code))
      AND used_by IS NULL
      AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired invite code';
  END IF;

  -- 이미 해당 길드 소속인지 확인
  IF EXISTS (
    SELECT 1 FROM guild_accounts
      WHERE guild_id = v_invite.guild_id
        AND (user_id = auth.uid() OR email = v_email)
  ) THEN
    RAISE EXCEPTION 'already a member of this guild';
  END IF;

  -- 계정 생성 (email 로 미리 만들어진 행이 있으면 user_id 링크)
  INSERT INTO guild_accounts (guild_id, user_id, email, name, role)
    VALUES (v_invite.guild_id, auth.uid(), v_email, v_name, v_invite.role)
    ON CONFLICT (guild_id, email) DO UPDATE
      SET user_id = auth.uid(), name = EXCLUDED.name
    RETURNING * INTO v_account;

  -- 초대 코드 사용 처리
  UPDATE invites SET used_by = v_email WHERE code = v_invite.code;

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_invite.guild_id, v_email, '초대 수락', '코드: ' || v_invite.code);

  RETURN v_account;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- P1-6: confirm_settlement 구현 (0001 의 껍데기를 교체)
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION confirm_settlement(p_raid_id uuid)
RETURNS raids
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_raid raids;
  v_caller guild_accounts;
BEGIN
  SELECT * INTO v_raid FROM raids WHERE id = p_raid_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'raid not found'; END IF;

  -- 1) 권한: OWNER 또는 ADMIN 만
  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = v_raid.guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role = 'MEMBER' THEN
    RAISE EXCEPTION 'insufficient permissions: OWNER or ADMIN required';
  END IF;

  -- 2) 상태: DRAFT 만 확정 가능 (FE isRaidEditable 과 동일 규칙)
  IF v_raid.status != 'DRAFT' THEN
    RAISE EXCEPTION 'raid already confirmed';
  END IF;

  -- 3) 정산 검증: MVP 는 FE settlement.ts 결과를 신뢰.
  --    서버 재계산 이관 시 여기서 불일치 검증 추가.

  -- 4) [유료화 시 크레딧 차감 — 현재 무료 베타라 생략]
  --    UPDATE guilds SET credits = credits - 1
  --      WHERE id = v_raid.guild_id AND credits > 0;
  --    IF NOT FOUND THEN RAISE EXCEPTION 'insufficient credits'; END IF;
  --    INSERT INTO credit_logs (guild_id, delta, reason, raid_id)
  --      VALUES (v_raid.guild_id, -1, 'raid_confirm', p_raid_id);

  -- 5) 상태 변경
  UPDATE raids
    SET status = 'CONFIRMED', updated_at = now()
    WHERE id = p_raid_id
    RETURNING * INTO v_raid;

  -- 6) 감사 로그
  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_raid.guild_id, v_caller.email, '레이드 확정', v_raid.boss_name);

  -- 7) 발송: Edge Function discord-send 는 확정 후 FE 가 호출.
  --    발송 실패 시 sent=false 유지.

  RETURN v_raid;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- audit_logs INSERT 정책 (FE logAudit 에서 직접 INSERT 용)
-- ══════════════════════════════════════════════════════════

CREATE POLICY audit_insert ON audit_logs
  FOR INSERT WITH CHECK (guild_id IN (SELECT auth_user_guilds()));

-- ══════════════════════════════════════════════════════════
-- P1-7: GRANT (테이블 20개 + 함수)
-- ══════════════════════════════════════════════════════════
-- 마이그레이션 0001~0003 에 GRANT 문이 0개. PostgREST 는 role 에 GRANT 가 없으면
-- RLS 정책이 맞아도 permission denied(42501) 를 반환한다.

-- SYS 마스터 (읽기 전용)
GRANT SELECT ON bosses TO authenticated;
GRANT SELECT ON game_servers TO authenticated;

-- guilds: webhook_url 제외 column-level SELECT + 제한된 UPDATE
-- PostgREST SELECT * 는 GRANT 된 컬럼만 반환 → webhook_url 자동 제외.
GRANT SELECT (id, server_name, guild_name, credits, created_at) ON guilds TO authenticated;
GRANT UPDATE (server_name, guild_name) ON guilds TO authenticated;
-- INSERT/DELETE 는 RPC 전용 (create_guild)

-- guild_accounts: SELECT 만 (INSERT/UPDATE/DELETE 는 RPC 전용)
GRANT SELECT ON guild_accounts TO authenticated;

-- 길드 데이터 (RLS 가 같은 길드만 허용)
GRANT SELECT, INSERT, UPDATE, DELETE ON members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON parties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON party_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON penalty_types TO authenticated;
GRANT SELECT, INSERT, UPDATE    ON guild_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON raids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON raid_drops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON raid_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON raid_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON raid_participant_penalties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON boss_entries TO authenticated;

-- 읽기 전용 / 제한
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT SELECT ON credit_logs TO authenticated;
GRANT SELECT ON error_logs TO authenticated;  -- RLS(is_admin) 가 추가 제한
