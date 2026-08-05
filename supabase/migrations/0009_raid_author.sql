-- 0009_raid_author.sql — 정산 작성자 소유권
--
-- 0008 에서 길드원 누구나 정산을 만들 수 있게 열었더니, 공대장이 여럿인 길드에서
-- 남이 만들던 임시저장을 다른 공대장이 열어 고칠 수 있는 상태가 됐다.
-- 작성자를 기록하고 수정·삭제를 작성자 본인(+관리자)으로 제한한다.
--
--   생성   : 길드원 누구나 (0008 그대로)
--   수정   : 작성자 본인 또는 OWNER/ADMIN
--   삭제   : 작성자 본인 또는 OWNER/ADMIN   (0005 의 관리자 전용에서 완화)
--   확정   : 확정 직전에 save_raid 를 거치므로 수정 규칙이 그대로 걸린다
--
-- created_by_name 은 audit_logs.actor 와 같은 스냅샷 방식이다. 목록에서 작성자를
-- 보여줄 때 guild_accounts 조인이 필요 없고, 계정이 삭제돼도 이름이 남는다.

-- ══════════════════════════════════════════════════════════
-- 1. 컬럼 추가
-- ══════════════════════════════════════════════════════════

alter table raids add column created_by      uuid references auth.users(id) on delete set null;
alter table raids add column created_by_name text;

create index on raids (created_by);

-- 기존 레이드는 작성자를 알 수 없어 NULL 로 남는다.
-- NULL = "주인 없음" 으로 보고 수정은 종전처럼 길드원 누구나 하게 둔다.
-- 여기서 관리자 전용으로 잠그면 지금 남아 있는 임시저장을 만든 본인조차 못 고친다.
-- 그 레이드가 한 번 저장되면 작성자가 채워지면서 자연히 소유권이 생긴다.

-- ══════════════════════════════════════════════════════════
-- 2. save_raid — 0008 정의에 작성자 기록 + 수정 권한 검사 추가
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
  v_subsidy    jsonb;
  v_idx        int;
BEGIN
  v_guild_id := (p_input->>'guild_id')::uuid;
  v_raid_id  := (p_input->>'id')::uuid;  -- null → 새 레이드

  -- 1) 권한: 해당 길드 소속이면 role 무관 (0008)
  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = v_guild_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this guild';
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

    -- 소유권 (0009): 작성자 본인이거나 관리자여야 한다.
    -- created_by IS NULL 은 0009 이전에 만들어진 레이드 → 종전대로 허용.
    IF v_existing.created_by IS NOT NULL
       AND v_existing.created_by <> auth.uid()
       AND v_caller.role = 'MEMBER' THEN
      RAISE EXCEPTION 'only the author or an admin can modify this raid';
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
      subsidy_total    = COALESCE((p_input->>'subsidy_total')::int, 0),
      leftover         = (p_input->>'leftover')::int,
      participant_count = (p_input->>'participant_count')::int,
      per_person       = (p_input->>'per_person')::int,
      -- 관리자가 대신 고쳐도 원 작성자는 바뀌지 않는다.
      -- 다만 주인 없던(NULL) 레이드는 이번에 손댄 사람이 작성자가 된다.
      created_by       = COALESCE(v_existing.created_by, auth.uid()),
      created_by_name  = COALESCE(v_existing.created_by_name, v_caller.name),
      updated_at       = now()
    WHERE id = v_raid_id
    RETURNING * INTO v_raid;

    -- 자식 삭제 (cascade 로 participant_penalties / participant_subsidies 도 같이 삭제)
    DELETE FROM raid_drops WHERE raid_id = v_raid_id;
    DELETE FROM raid_expenses WHERE raid_id = v_raid_id;
    DELETE FROM raid_participants WHERE raid_id = v_raid_id;

  -- 3) 새 레이드
  ELSE
    INSERT INTO raids (
      guild_id, boss_name, party_name, ppoji_pct, remainder_policy, phase_count,
      fee_total, total_sales, expense_total, net_profit, leader_ppoji, subsidy_total, leftover,
      participant_count, per_person, created_by, created_by_name
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
      COALESCE((p_input->>'subsidy_total')::int, 0),
      (p_input->>'leftover')::int,
      (p_input->>'participant_count')::int,
      (p_input->>'per_person')::int,
      auth.uid(),
      v_caller.name
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

  -- 6) participants + penalties/subsidies 스냅샷
  v_idx := 0;
  FOR v_participant IN SELECT * FROM jsonb_array_elements(COALESCE(p_input->'participants', '[]'::jsonb))
  LOOP
    INSERT INTO raid_participants (
      raid_id, member_id, guest_name, exit_phase,
      base, subsidy, penalty, redistributed, final_amount, forfeited, sort_order
    ) VALUES (
      v_raid_id,
      (v_participant->>'member_id')::uuid,
      v_participant->>'guest_name',
      (v_participant->>'exit_phase')::int,
      COALESCE((v_participant->>'base')::int, 0),
      COALESCE((v_participant->>'subsidy')::int, 0),
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

    FOR v_subsidy IN SELECT * FROM jsonb_array_elements(
      COALESCE(v_participant->'subsidies', '[]'::jsonb)
    )
    LOOP
      INSERT INTO raid_participant_subsidies (
        raid_participant_id, subsidy_type_id, name, amount
      ) VALUES (
        v_rp_id,
        (v_subsidy->>'subsidy_type_id')::uuid,
        v_subsidy->>'name',
        (v_subsidy->>'amount')::int
      );
    END LOOP;

    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_raid;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 3. delete_raid — 작성자 본인도 삭제 가능하게 (0005 는 관리자 전용이었다)
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this guild';
  END IF;

  -- 작성자 본인 또는 관리자. NULL(0009 이전 레이드)은 관리자만 지울 수 있게 둔다.
  -- 수정과 달리 되돌릴 수 없어서, 주인이 불분명한 기록은 보수적으로 잠근다.
  IF v_caller.role = 'MEMBER'
     AND (v_raid.created_by IS NULL OR v_raid.created_by <> auth.uid()) THEN
    RAISE EXCEPTION 'only the author or an admin can delete this raid';
  END IF;

  DELETE FROM raids WHERE id = p_raid_id;

  INSERT INTO audit_logs (guild_id, actor, action, detail)
    VALUES (v_raid.guild_id, v_caller.email, '레이드 삭제', v_raid.boss_name);
END;
$$;
