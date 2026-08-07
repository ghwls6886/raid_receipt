# features/recruit — 파티 구인

**4단계까지 비워둔다.** 반응을 보고 착수 여부를 정한다. (MERGE_PLAN §7 4단계)

들어올 것: 구인 글 · 지원 · 파티 채팅(realtime) · 매너 평가.

주의:

- MH 의 `parties` 는 RR 공대와 **완전히 다른 개념**이다. 여기서는 `recruit_posts` 로 개명해 쓴다
  (§3 함정 1). 라우트도 `/party-finder` 로 유지해 RR `/parties` 와 충돌을 피한다 (§4).
- realtime 동시접속 200(Supabase 무료 한도)이 여기서 먼저 걸린다 (§8).
- `features/settlement` 직접 import 금지 (§4.1 원칙 3).
