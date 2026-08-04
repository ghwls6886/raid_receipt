-- 0007_default_policies.sql — 새 길드에 패널티/지원금 기본값 심기
--
-- 정책이 하나도 없으면 레이드 화면에 칩이 아예 안 그려져서, 그런 기능이 있다는 것조차
-- 모르고 지나간다. 가장 흔한 두 가지를 미리 넣어 두고 필요 없으면 지우게 한다.
--
--   지각            FIXED       1,000,000 메소   (개인 몫에서 차감)
--   샤프아이즈 지원   보우마스터   1,000,000 메소   (n빵 전에 먼저 지급)
--
-- 이미 만들어진 길드는 건드리지 않는다. 운영 중인 길드에 정책이 갑자기 생기면
-- 다음 정산에서 의도치 않은 차감·지급이 일어날 수 있어서다.
--
-- 0006_subsidy.sql 의 subsidy_types 에 의존하므로 반드시 그 뒤에 적용한다.

-- ══════════════════════════════════════════════════════════
-- create_guild 교체 — 0004_rls_fix.sql 정의에 기본 정책 INSERT 만 추가
-- ══════════════════════════════════════════════════════════

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

  -- 기본 패널티: 지각 100만 메소 정액
  INSERT INTO penalty_types (guild_id, name, calc_type, value)
    VALUES (v_guild.id, '지각', 'FIXED', 1000000);

  -- 기본 지원금: 보우마스터 샤프아이즈 100만 메소.
  -- job 이 members.job 문자열과 정확히 같아야 레이드 화면에서 자동으로 켜진다.
  INSERT INTO subsidy_types (guild_id, name, job, amount)
    VALUES (v_guild.id, '샤프아이즈 지원', '보우마스터', 1000000);

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_guild.id, v_email, '길드 생성',
            v_guild.server_name || ' / ' || v_guild.guild_name);

  RETURN v_guild;
END;
$$;
