-- 0008_member_can_settle.sql — 길드원(MEMBER)도 정산을 만들고 확정할 수 있게 개방
--
-- 배경: save_raid / confirm_settlement 가 OWNER·ADMIN 전용이었는데 화면에는 role 가드가
-- 없어서, MEMBER 계정은 레이드를 다 입력하고 [임시저장]·[확정 & 발송] 을 눌러도 둘 다
-- 'insufficient permissions' 로 거절당했다. 화면은 "저장에 실패했습니다." 만 띄워서
-- 사용자는 이유를 알 수 없었다.
--
-- 결정: 정산 생성·확정은 길드원 누구나 할 수 있게 연다. 공대장이 여럿인 길드에서
-- 관리자만 정산을 쓸 수 있는 제약이 실사용과 맞지 않는다.
--
-- 여전히 OWNER/ADMIN 전용으로 남기는 것 (이번 변경 대상 아님):
--   delete_raid          — 확정 기록 삭제는 되돌릴 수 없다
--   create_invite        — 길드 가입 통제
--   update_account_role / remove_account  — 권한 관리
--   get_webhook_url / set_webhook_url     — 디스코드 비밀 URL
--
-- 길드 소속 검사(NOT FOUND)는 그대로 둔다. 남의 길드 정산을 건드리는 걸 막는 유일한
-- 방어선이라 절대 풀면 안 된다. role 조건만 뺀다.

-- ══════════════════════════════════════════════════════════
-- 0. guild_accounts.user_id 백필
-- ══════════════════════════════════════════════════════════
-- handle_new_user() 트리거는 AFTER INSERT ON auth.users 라서, 0004 적용 전에 이미
-- 가입해 있던 사용자에게는 한 번도 돈 적이 없다. 초대로 email 만 먼저 만들어 둔
-- guild_accounts 행이 있으면 user_id 가 NULL 로 남고, 그러면
--   - auth_user_guilds() 가 그 길드를 못 잡아 RLS 가 전부 막고
--   - save_raid 의 "WHERE user_id = auth.uid()" 도 NOT FOUND 가 된다
-- 초대 코드를 다시 넣어도 redeem_invite 가 'already a member' 로 거절해서
-- 사용자가 스스로 빠져나올 방법이 없다. 여기서 한 번 이어 준다.
UPDATE guild_accounts ga
   SET user_id = u.id
  FROM auth.users u
 WHERE u.email = ga.email
   AND ga.user_id IS NULL;

-- ══════════════════════════════════════════════════════════
-- 1. save_raid — 0006_subsidy.sql 정의에서 권한 조건만 완화
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
      COALESCE((p_input->>'subsidy_total')::int, 0),
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
-- 2. confirm_settlement — 0004_rls_fix.sql 정의에서 권한 조건만 완화
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

  -- 1) 권한: 해당 길드 소속이면 role 무관 (0008)
  SELECT * INTO v_caller FROM guild_accounts
    WHERE guild_id = v_raid.guild_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this guild';
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
