-- 0006_subsidy.sql — 역할 지원금 (보우마스터 샤프아이즈 / 비숍 부활 등)
--
-- 특정 역할을 맡은 참여자에게 n빵 전에 먼저 떼어주는 정액 몫.
-- 워터폴에서의 위치 (settlement.ts 와 동일):
--
--   순수익 - 공대장 뽀찌 = 분배 대상액
--   분배 대상액 - 역할 지원금 = n빵 대상액
--   n빵 대상액 / 참여인원 = 기본 1인당
--
-- 뽀찌를 뗀 "뒤"에 차감하므로 공대장 몫은 줄지 않고 공대원 전원이 1/N 씩 부담한다.
-- 이탈해도 전액 지급하되 몰수 대상자에게는 지급하지 않는다(잔돈으로 흘림).
--
-- 스냅샷 정책은 패널티와 동일: 확정 후 길드 정책이 바뀌어도 영수증이 흔들리지 않도록
-- name/amount 를 raid_participant_subsidies 에 박아 둔다.

-- ══════════════════════════════════════════════════════════
-- 1. 길드 지원금 정책
-- ══════════════════════════════════════════════════════════

create table subsidy_types (
  id        uuid primary key default gen_random_uuid(),
  guild_id  uuid not null references guilds(id) on delete cascade,
  name      text not null,
  -- 자동 프리필 대상 직업(members.job 과 같은 문자열). null = 직업 무관(수동 전용).
  -- 임시 용병은 직업 정보가 없으므로 null 유형을 수동으로 붙인다.
  job       text,
  amount    int  not null default 0,   -- 메소 정액
  is_active boolean not null default true,
  unique (guild_id, name)   -- penalty_types 와 동일 규칙 (api.ts addSubsidyType 중복 이름 거부)
);
create index on subsidy_types (guild_id);

alter table subsidy_types enable row level security;
create policy subsidy_types_same_guild on subsidy_types
  for all using (guild_id in (select auth_user_guilds()))
  with check (guild_id in (select auth_user_guilds()));

GRANT SELECT, INSERT, UPDATE, DELETE ON subsidy_types TO authenticated;

-- ══════════════════════════════════════════════════════════
-- 2. 레이드 스냅샷 컬럼 + 참여자별 지원금 내역
-- ══════════════════════════════════════════════════════════

-- 분배 대상액에서 뗀 지원금 총액 (비례 축소 후 기준)
alter table raids add column subsidy_total int not null default 0;

-- 실제 지급된 지원금 (몰수 대상자는 0)
alter table raid_participants add column subsidy int not null default 0;

create table raid_participant_subsidies (
  id                   uuid primary key default gen_random_uuid(),
  raid_participant_id  uuid not null references raid_participants(id) on delete cascade,
  subsidy_type_id      uuid references subsidy_types(id) on delete set null,
  name                 text not null,
  amount               int  not null
);
create index on raid_participant_subsidies (raid_participant_id);

alter table raid_participant_subsidies enable row level security;
create policy raid_participant_subsidies_via_raid on raid_participant_subsidies
  for all using (raid_participant_id in (
    select rp.id from raid_participants rp
    join raids r on r.id = rp.raid_id
    where r.guild_id in (select auth_user_guilds())
  ));

-- 0005 와 동일 정책: 레이드 자식 테이블은 SELECT 만 열고 변경은 save_raid RPC 전용.
GRANT SELECT ON raid_participant_subsidies TO authenticated;

-- ══════════════════════════════════════════════════════════
-- 3. save_raid RPC 교체 — subsidy 스냅샷 저장 추가
--    (0005_rls_hardening.sql 의 정의에 지원금 처리만 더한 것)
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
