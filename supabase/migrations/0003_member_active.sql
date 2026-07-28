-- 0003_member_active.sql — 길드원 비활성화 (soft delete)
-- FE apps/web/src/lib/api.ts (Member.isActive, getMembers/deactivateMember/reactivateMember) 반영.
-- 적용: supabase db push  (또는 supabase migration up)

-- 길드를 떠난 사람을 DELETE 하면 raid_participants.member_id 가 set null 이 되어(0001)
-- 과거 레이드의 참여자가 누구였는지, 참여도 집계가 통째로 사라진다.
-- 비활성은 "앞으로 명단에 올리지 않는다"는 뜻일 뿐이고 지난 기록은 그대로 남는다.
alter table members add column is_active boolean not null default true;

-- 활성 명단 조회(공대 편성·레이드 참여자 선택)가 기본 경로라 여기에 인덱스를 태운다.
create index on members (guild_id, is_active);

-- 비활성화 시 FE 가 함께 처리하는 것 (BE 이관 시 RPC 로 원자화할 것):
--   1) party_members 에서 해당 member_id 삭제
--   2) 그 사람이 공대장이던 parties.leader_id 를 null 로 (0001 에서 이미 nullable)
--   3) 마지막 활성 MASTER 는 비활성화 거부
-- TODO(BE): deactivate_member(p_member_id) RPC 로 묶어 1~3 을 한 트랜잭션에서 처리.
--   지금은 FE 목업이 순서대로 수행하므로 중간 실패 시 부분 반영될 수 있다.

-- 닉네임 unique 는 0001 의 (guild_id, nickname) 을 그대로 둔다.
-- 비활성까지 포함해 막아야 같은 닉네임이 두 사람으로 쪼개져 과거 이력이 갈라지지 않는다.
-- 복귀는 새로 등록하는 게 아니라 is_active 를 true 로 되돌리는 것.
