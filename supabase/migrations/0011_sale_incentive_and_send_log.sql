-- 0011_sale_incentive_and_send_log.sql — 드랍템 판매 인센티브 + 영수증 발송 이력
--
-- 두 가지를 한 번에 담는다. 둘 다 save_raid / 발송 경로에만 닿아 있고, save_raid 를
-- 한 번만 교체하면 되기 때문이다.
--
-- 1) 드랍템 판매 인센티브
--    아이템을 대신 팔아준 사람에게 주는 수고비다. 드랍템 **행마다** 판매자와 %를
--    따로 정하므로 한 레이드 안에서 아이템별로 다른 사람·다른 요율이 될 수 있다.
--    % 기준은 그 행의 실수익(판매가 - 수수료)이다. 순수익 기준으로 잡으면 다른
--    아이템의 판매가나 경비에 따라 같은 "5%"가 다른 금액이 되어 설명이 안 된다.
--    차감 순서는 공대장 인센티브보다 **앞**이다 — settlement.ts 주석 참고.
--
-- 2) 발송 이력
--    지금까지 발송 상태는 raids.sent boolean 하나뿐이라 "언제 보냈나"를 알 수 없었다.
--    확정 건 재발송 기능이 생기면서 boolean 으로는 부족해졌다. 마지막 발송 시각과
--    누적 발송 횟수를 남긴다. sent 는 하위호환을 위해 그대로 둔다(마지막 발송 성공 여부).

-- ══════════════════════════════════════════════════════════
-- 1. 드랍템에 판매자 / 인센티브율
-- ══════════════════════════════════════════════════════════

-- 판매자는 raid_participants 를 참조하지 않는다. save_raid 가 저장할 때마다
-- 참여자 행을 지우고 다시 넣어(DELETE + INSERT) id 가 매번 바뀌기 때문이다.
-- 참여자와 같은 방식(길드원 id 또는 용병 이름)으로 가리킨다.
alter table raid_drops
  add column seller_member_id uuid references members(id) on delete set null;
alter table raid_drops
  add column seller_guest_name text;
alter table raid_drops
  add column incentive_pct real not null default 0;   -- 0~100
-- 실제 계산된 메소. 확정 영수증을 나중에 재현할 때 %만으로는 부족하다
-- (비례 축소가 걸렸을 수 있고, 판매자가 명단에서 빠지면 0 이 된다).
alter table raid_drops
  add column incentive_amount int not null default 0;

-- ══════════════════════════════════════════════════════════
-- 2. 참여자 / 레이드 스냅샷에 판매 인센티브
-- ══════════════════════════════════════════════════════════

-- 한 사람이 여러 아이템을 팔았으면 합산된 금액이 들어온다.
alter table raid_participants
  add column sale_incentive int not null default 0;

alter table raids
  add column sale_incentive_total int not null default 0;

-- ══════════════════════════════════════════════════════════
-- 3. 발송 이력
-- ══════════════════════════════════════════════════════════

alter table raids
  add column sent_at timestamptz;                -- 마지막 발송 성공 시각 (미발송이면 null)
alter table raids
  add column send_count int not null default 0;  -- 누적 발송 횟수 (재발송 포함)

-- 이미 발송된 과거 건은 시각을 알 수 없다. 최소한 "한 번은 보냈다"는 사실은 남긴다.
update raids set send_count = 1 where sent = true and send_count = 0;

-- ══════════════════════════════════════════════════════════
-- 4. save_raid — 0010 정의에 위 필드 저장만 추가
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
      sale_incentive_total = COALESCE((p_input->>'sale_incentive_total')::int, 0),
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
      fee_total, total_sales, expense_total, net_profit, sale_incentive_total,
      leader_ppoji, subsidy_total, leftover,
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
      COALESCE((p_input->>'sale_incentive_total')::int, 0),
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
    INSERT INTO raid_drops (
      raid_id, name, sale_price, fee_pct, sort_order,
      seller_member_id, seller_guest_name, incentive_pct, incentive_amount
    )
    VALUES (
      v_raid_id,
      v_drop->>'name',
      (v_drop->>'sale_price')::int,
      (v_drop->>'fee_pct')::real,
      v_idx,
      (v_drop->>'seller_member_id')::uuid,
      v_drop->>'seller_guest_name',
      COALESCE((v_drop->>'incentive_pct')::real, 0),
      COALESCE((v_drop->>'incentive_amount')::int, 0)
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
      is_leader, incentive, leftover_share, sale_incentive
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
      COALESCE((v_participant->>'leftover_share')::int, 0),
      COALESCE((v_participant->>'sale_incentive')::int, 0)
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
