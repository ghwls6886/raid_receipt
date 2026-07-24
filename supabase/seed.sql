-- seed.sql — SYS 마스터 초기값. 적용: supabase db reset (seed 자동 실행) 또는 psql 로 실행.

insert into bosses (name) values
  ('자쿰'), ('혼테일'), ('핑크빈'), ('카오스 자쿰'), ('카오스 혼테일'), ('카오스 핑크빈')
on conflict (name) do nothing;

insert into game_servers (name) values
  ('메이플랜드'), ('메이플플래닛')
on conflict (name) do nothing;
