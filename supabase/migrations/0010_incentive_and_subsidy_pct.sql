-- 0010_incentive_and_subsidy_pct.sql — 공대장 인센티브 지급 + 지원금 %/정액 + 잔돈 재분배
--
-- 세 가지를 한 번에 담는다. 전부 settlement.ts 결과를 받는 스냅샷 컬럼이라 성격이 같고,
-- save_raid 를 한 번만 교체하면 되기 때문이다.
--
-- 1) 공대장 인센티브(구 "뽀찌")를 실제로 지급한다.
--    종전에는 순수익에서 떼기만 하고 아무 참여자에게도 주지 않아, 영수증에서 그 돈이
--    어디로 갔는지 알 수 없었다. 이제 공대장 참여자 행에 얹는다.
--    받을 사람이 지정되지 않으면 아예 떼지 않는다 (settlement.ts hasLeader).
--
-- 2) 지원금도 패널티처럼 % / 정액을 고른다.
--    % 기준은 **순수익**이다. 분배 대상액이나 1인당을 기준으로 잡으면
--    "지원금을 빼야 1인당이 나오는데 1인당이 있어야 지원금이 나오는" 순환이 생긴다.
--
-- 3) 잔돈은 참여자에게 되돌려준다.
--    수령자 없는 벌금·몰수자 지원금·나눗셈 끝전을 몰수되지 않은 참여자에게 다시 n빵한다.
--    remainder_policy(길드 기금/공대장/이월)는 더 이상 쓰지 않지만 과거 레이드가 참조하고
--    있어 컬럼과 enum 은 남겨 둔다. 화면에서만 걷어낸다.

-- ══════════════════════════════════════════════════════════
-- 1. 지원금 유형에 계산 방식 추가
-- ══════════════════════════════════════════════════════════

-- penalty_types 와 같은 enum 을 쓴다. 기존 지원금은 전부 정액이었으므로 FIXED 가 기본.
alter table subsidy_types
  add column calc_type penalty_calc_type not null default 'FIXED';

-- 스냅샷 쪽도 동일하게. amount 는 "실제 계산된 메소"라 그대로 두고,
-- calc_type/value 는 "그때 정책이 어떤 규칙이었는지"를 남긴다 (패널티와 같은 구조).
alter table raid_participant_subsidies
  add column calc_type penalty_calc_type not null default 'FIXED';
alter table raid_participant_subsidies
  add column value int not null default 0;

-- 기존 스냅샷은 정액이었으니 지급 금액이 곧 규칙 값이다.
update raid_participant_subsidies set value = amount where value = 0;

-- ══════════════════════════════════════════════════════════
-- 2. 참여자 스냅샷에 인센티브 / 잔돈 몫 추가
-- ══════════════════════════════════════════════════════════

alter table raid_participants
  add column is_leader boolean not null default false;   -- 인센티브 수령자
alter table raid_participants
  add column incentive int not null default 0;           -- 공대장 인센티브 수령액
alter table raid_participants
  add column leftover_share int not null default 0;      -- 잔돈 재분배 수령액

-- ══════════════════════════════════════════════════════════
-- 3. save_raid — 0009 정의에 위 필드 저장만 추가
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
      created_by       = COALESCE(v_existing.created_by, auth.uid()),
      created_by_name  = COALESCE(v_existing.created_by_name, v_caller.name),
      updated_at       = now()
    WHERE id = v_raid_id
    RETURNING * INTO v_raid;

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
      base, subsidy, penalty, redistributed, final_amount, forfeited, sort_order,
      is_leader, incentive, leftover_share
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
      v_idx,
      COALESCE((v_participant->>'is_leader')::boolean, false),
      COALESCE((v_participant->>'incentive')::int, 0),
      COALESCE((v_participant->>'leftover_share')::int, 0)
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
        raid_participant_id, subsidy_type_id, name, amount, calc_type, value
      ) VALUES (
        v_rp_id,
        (v_subsidy->>'subsidy_type_id')::uuid,
        v_subsidy->>'name',
        (v_subsidy->>'amount')::int,
        COALESCE((v_subsidy->>'calc_type')::penalty_calc_type, 'FIXED'),
        COALESCE((v_subsidy->>'value')::int, 0)
      );
    END LOOP;

    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_raid;
END;
$$;
