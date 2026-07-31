-- 0005_rls_hardening.sql
-- 보안 강화: raids·invites 테이블 직접 변경 차단 → SECURITY DEFINER RPC 전용
--
-- 취약점:
--   1) raids 에 INSERT/UPDATE/DELETE GRANT → MEMBER 가 직접 UPDATE status='CONFIRMED' 가능
--      confirm_settlement RPC 의 OWNER/ADMIN 역할 검증 우회
--   2) invites 에 INSERT GRANT → MEMBER 가 role='OWNER' 초대 생성 후 권한 상승 가능
--
-- 수정: guild_accounts 와 동일 패턴 (SELECT 전용 GRANT + RPC 전용 변경)

-- ══════════════════════════════════════════════════════════
-- 1. GRANT 제한: INSERT/UPDATE/DELETE 제거
-- ══════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE ON raids FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON raid_drops FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON raid_expenses FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON raid_participants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON raid_participant_penalties FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON invites FROM authenticated;

-- ══════════════════════════════════════════════════════════
-- 2. save_raid RPC (OWNER/ADMIN 전용)
--    FE 가 정산 계산 결과를 JSONB 로 넘기면 트랜잭션으로 처리.
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION save_raid(p_input jsonb)
RETURNS raids
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_guild_id   uuid;
  v_raid_id    uuid;
  v_caller     guild_accounts;
  v_raid       raids;
  v_existing   raids;
  v_drop       jsonb;
  v_expense    jsonb;
  v_participant jsonb;
  v_rp_id      uuid;
  v_penalty    jsonb;
  v_idx        int;
BEGIN
  v_guild_id := (p_input->>'guild_id')::uuid;
  v_raid_id  := (p_input->>'id')::uuid;  -- null → 새 레이드

  -- 1) 권한: OWNER 또는 ADMIN 만
  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = v_guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role = 'MEMBER' THEN
    RAISE EXCEPTION 'insufficient permissions: OWNER or ADMIN required';
  END IF;

  -- 2) 기존 레이드 업데이트
  IF v_raid_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM raids
      WHERE id = v_raid_id AND guild_id = v_guild_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'raid not found';
    END IF;
    IF v_existing.status = 'CONFIRMED' THEN
      RAISE EXCEPTION 'confirmed raid cannot be modified';
    END IF;

    UPDATE raids SET
      boss_name        = p_input->>'boss_name',
      party_name       = p_input->>'party_name',
      ppoji_pct        = (p_input->>'ppoji_pct')::real,
      remainder_policy = (p_input->>'remainder_policy')::remainder_policy,
      phase_count      = (p_input->>'phase_count')::int,
      fee_total        = (p_input->>'fee_total')::int,
      total_sales      = (p_input->>'total_sales')::int,
      expense_total    = (p_input->>'expense_total')::int,
      net_profit       = (p_input->>'net_profit')::int,
      leader_ppoji     = (p_input->>'leader_ppoji')::int,
      leftover         = (p_input->>'leftover')::int,
      participant_count = (p_input->>'participant_count')::int,
      per_person       = (p_input->>'per_person')::int,
      updated_at       = now()
    WHERE id = v_raid_id
    RETURNING * INTO v_raid;

    -- 자식 삭제 (cascade 로 participant_penalties 도 같이 삭제)
    DELETE FROM raid_drops WHERE raid_id = v_raid_id;
    DELETE FROM raid_expenses WHERE raid_id = v_raid_id;
    DELETE FROM raid_participants WHERE raid_id = v_raid_id;

  -- 3) 새 레이드
  ELSE
    INSERT INTO raids (
      guild_id, boss_name, party_name, ppoji_pct, remainder_policy, phase_count,
      fee_total, total_sales, expense_total, net_profit, leader_ppoji, leftover,
      participant_count, per_person
    ) VALUES (
      v_guild_id,
      p_input->>'boss_name',
      p_input->>'party_name',
      (p_input->>'ppoji_pct')::real,
      (p_input->>'remainder_policy')::remainder_policy,
      (p_input->>'phase_count')::int,
      (p_input->>'fee_total')::int,
      (p_input->>'total_sales')::int,
      (p_input->>'expense_total')::int,
      (p_input->>'net_profit')::int,
      (p_input->>'leader_ppoji')::int,
      (p_input->>'leftover')::int,
      (p_input->>'participant_count')::int,
      (p_input->>'per_person')::int
    ) RETURNING * INTO v_raid;
    v_raid_id := v_raid.id;
  END IF;

  -- 4) drops
  v_idx := 0;
  FOR v_drop IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'drops', '[]'::jsonb))
  LOOP
    INSERT INTO raid_drops (raid_id, name, sale_price, fee_pct, sort_order)
    VALUES (
      v_raid_id,
      v_drop->>'name',
      (v_drop->>'sale_price')::int,
      (v_drop->>'fee_pct')::real,
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- 5) expenses
  v_idx := 0;
  FOR v_expense IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'expenses', '[]'::jsonb))
  LOOP
    INSERT INTO raid_expenses (raid_id, category, name, cost, sort_order)
    VALUES (
      v_raid_id,
      (v_expense->>'category')::expense_category,
      v_expense->>'name',
      (v_expense->>'cost')::int,
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- 6) participants + penalties 스냅샷
  v_idx := 0;
  FOR v_participant IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'participants', '[]'::jsonb))
  LOOP
    INSERT INTO raid_participants (
      raid_id, member_id, guest_name, exit_phase,
      base, penalty, redistributed, final_amount, forfeited, sort_order
    ) VALUES (
      v_raid_id,
      (v_participant->>'member_id')::uuid,
      v_participant->>'guest_name',
      (v_participant->>'exit_phase')::int,
      COALESCE((v_participant->>'base')::int, 0),
      COALESCE((v_participant->>'penalty')::int, 0),
      COALESCE((v_participant->>'redistributed')::int, 0),
      COALESCE((v_participant->>'final_amount')::int, 0),
      COALESCE((v_participant->>'forfeited')::boolean, false),
      v_idx
    ) RETURNING id INTO v_rp_id;

    FOR v_penalty IN SELECT * FROM jsonb_array_elements(
      COALESCE(v_participant->'penalties', '[]'::jsonb)
    )
    LOOP
      INSERT INTO raid_participant_penalties (
        raid_participant_id, penalty_type_id, name, calc_type, value
      ) VALUES (
        v_rp_id,
        (v_penalty->>'penalty_type_id')::uuid,
        v_penalty->>'name',
        (v_penalty->>'calc_type')::penalty_calc_type,
        (v_penalty->>'value')::int
      );
    END LOOP;

    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_raid;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 3. delete_raid RPC (OWNER/ADMIN 전용)
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_raid(p_raid_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_raid   raids;
  v_caller guild_accounts;
BEGIN
  SELECT * INTO v_raid FROM raids WHERE id = p_raid_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'raid not found'; END IF;

  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = v_raid.guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role = 'MEMBER' THEN
    RAISE EXCEPTION 'insufficient permissions: OWNER or ADMIN required';
  END IF;

  DELETE FROM raids WHERE id = p_raid_id;

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_raid.guild_id, v_caller.email, '레이드 삭제', v_raid.boss_name);
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 4. create_invite RPC (OWNER/ADMIN 전용)
--    OWNER 초대는 OWNER만 생성 가능.
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_invite(
  p_guild_id uuid,
  p_role     account_role,
  p_code     text
)
RETURNS invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller guild_accounts;
  v_invite invites;
BEGIN
  -- 권한: OWNER 또는 ADMIN 만
  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = p_guild_id AND user_id = auth.uid();
  IF NOT FOUND OR v_caller.role = 'MEMBER' THEN
    RAISE EXCEPTION 'insufficient permissions: OWNER or ADMIN required';
  END IF;

  -- OWNER 초대는 OWNER만 가능
  IF p_role = 'OWNER' AND v_caller.role != 'OWNER' THEN
    RAISE EXCEPTION 'only OWNER can create OWNER invites';
  END IF;

  INSERT INTO invites (code, guild_id, role)
  VALUES (p_code, p_guild_id, p_role)
  RETURNING * INTO v_invite;

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (p_guild_id, v_caller.email, '초대 생성', p_role || ' / ' || p_code);

  RETURN v_invite;
END;
$$;
