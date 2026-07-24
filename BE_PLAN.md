# 메월드 길드 정산 매니저 — 백엔드 계획 (Supabase-native)

**결론: NestJS 없이 Supabase 로 간다.** 더 싸고($0 무료 티어) 단순하고 모노레포에 자연스럽다.
서버 로직이 수십 엔드포인트로 불어나거나 팀이 커지면 그때 NestJS 를 고려.

FE 데이터 레이어 `apps/web/src/lib/api.ts` 가 **API 계약의 사실상 명세**다. 각 함수를 아래 3층 중 하나로 치환하면 화면 수정 없이 실데이터로 전환된다.

---

## 0. 3층 구조

1. **CRUD → PostgREST + RLS (서버 0)**
   테이블에 자동으로 붙는 REST API + Row-Level Security. FE 에서 `supabase-js` 직접 호출.
   길드/길드원/공대/정책/레이드 목록·상세 등 대부분이 여기. 권한은 DB(RLS)가 막음.
2. **원자성 → Postgres 함수(RPC)**
   트랜잭션이 필요한 것만 DB 함수로. `confirm_settlement()`. 마이그레이션에 포함 → 별도 서버 $0.
3. **비밀키 → Edge Function (Deno)**
   클라이언트 노출 금지인 것만. `discord-send`(웹훅 URL), 결제 검증. Supabase 무료 티어.

## 1. 구조 (모노레포)

```
apps/web/            React FE (Vercel)
supabase/
  migrations/        테이블 + RLS + RPC 함수  → 0001_init.sql
  functions/         Edge Functions           → discord-send/
  seed.sql           SYS 마스터 시드(보스 6·서버 2)
  config.toml
packages/shared/     공용 타입 골격 (대부분 supabase gen types 로 대체)
```
> `apps/api`(NestJS)는 **제거됨**.

## 2. ⚠️ 반드시 알아야 할 함정

1. **영수증 "이미지"는 Edge Function 에서 못 만든다.**
   Edge=Deno 라 Puppeteer/Chromium(HTML→PNG) 불가. → **MVP 는 디스코드 embed(리치 텍스트)** 로 발송
   (`functions/discord-send`). PNG 는 나중에 외부 렌더 API(htmlcsstoimage 등)로.
2. **Prisma 안 씀 — SQL 마이그레이션으로 통일.**
   RLS·DB함수가 SQL 이라 `supabase/migrations/*.sql` 로 일원화. FE 타입은
   `supabase gen types typescript --linked > apps/web/src/lib/supabase-types.ts`.
3. **정산 계산 위치.** MVP 는 FE `settlement.ts`(§3)에서 계산 → RPC 는 저장·검증만.
   무결성 강화가 필요하면 계산을 DB함수(plpgsql)로 이관.
4. **크레딧 원자성은 지금 불필요.** 현재 **무료 베타**라 확정 시 크레딧 차감 없음 →
   `confirm_settlement` 는 상태변경+스냅샷+audit 만. 크레딧 원자 차감은 유료화 때 부활(주석에 표시됨).

## 3. 인증 (Google OAuth)

- Supabase Auth 로 구글 로그인. FE `useAuthStore`(목업)를 Supabase 세션으로 교체.
- 온보딩: 길드 생성(생성자 = `guild_accounts.role=OWNER` 자동) 또는 초대코드 redeem
  → `guild_accounts` 에 (email, role) 추가.
- **RLS 헬퍼** `auth_user_guilds()`(SECURITY DEFINER)로 "내 길드"만 접근. 재귀 회피(§9).
- MVP RLS = "같은 길드 = 전권". 확정·권한변경 등 role 세분화는 RPC 내부 체크 또는 정책 강화로.

## 4. FE 함수 → Supabase 매핑

| FE 함수 (`lib/api.ts`) | 방식 |
|---|---|
| getMembers / addMember / get·create·update·deleteParty | **1층** `supabase.from('members'/'parties')` |
| getBosses / getServers / getPenaltyTypes / getGuildSettings | **1층** select |
| addBoss/deleteBoss, addServer/deleteServer | **1층** (RLS: 시스템 관리자/service_role) |
| getAccounts / updateAccountRole / removeAccount | **1층** (마지막 OWNER 보호는 트리거 or RPC) |
| createInvite / redeemInvite | **1층** insert / **2층** RPC(계정 생성 동반) |
| getRaids / getRaid / getRaidDetail | **1층** select(+조인) |
| saveRaid (신규/수정) | **1층** upsert (raids + 자식 테이블) |
| **확정** | **2층** `supabase.rpc('confirm_settlement', {p_raid_id})` → **3층** discord-send |
| getDashboardStats / getBossAverages / getMemberStats | **1층** view/RPC 집계 |
| getAuditLogs | **1층** select (audit_logs) |
| 웹훅 발송 · 결제 검증 | **3층** Edge Function |

## 5. 핵심 로직

- **정산(§3)**: `settlement.ts` 그대로 사용. 확정 시 참여자별 penalty/redistributed/final 을
  `raid_participants` 에 스냅샷. `boss_name/party_name` 등도 스냅샷(마스터 변경과 무관).
- **확정 RPC**(`confirm_settlement`): 권한 체크 → 상태 검증(draft/미발송) → 스냅샷 → (유료화 시 크레딧
  원자 차감 + credit_logs) → status=CONFIRMED → audit → discord-send.
- **발송 실패 롤백(§10)**: [유료화 시] `credit_logs reason='rollback'` 자동 복구.
- **멱등성**: 결제 웹훅 `credit_logs.payment_id UNIQUE`.
- **변경 이력**: FE `logAudit()` 호출 지점(`[BE TODO]` 마커)들을 `audit_logs` INSERT 로. 서버명·권한·정책·초대·길드원 변경 등.

## 6. FE 에서 "가짜"인 부분 (교체 대상)

- `lib/api.ts` in-memory + setTimeout → supabase-js / rpc / functions.
- `useAuthStore`(로그인/온보딩), 초대 redeem(현재 선택만) → 실제 계정·멤버십.
- 레이드 확정: `sent=true` 만 → RPC + discord-send.
- 크레딧: **무료 베타**(차감 없음). 유료화 시 결제 연동 + 원자 차감 복원.
- 변경 이력: `logAudit` no-op(주석) → `audit_logs`.

## 7. 착수 순서

1. `supabase init` → `link` → `db push`(0001_init) → seed.
2. 구글 Auth + `guild_accounts` 온보딩/초대 redeem.
3. 1층 CRUD 를 FE `api.ts` 함수 속에서 supabase-js 로 교체(화면 무수정).
4. `saveRaid` upsert + `confirm_settlement` RPC + `settlement.ts` 사용.
5. `discord-send` Edge Function(embed) 배포 → 확정 후 호출.
6. 대시보드 집계(view/RPC), audit_logs.
7. (나중) 결제 + 크레딧 원자 차감 복원 + RLS role 세분화.

## 8. 참고

- 스키마·RLS·RPC 초안: `supabase/migrations/0001_init.sql`.
- Edge Function 예시: `supabase/functions/discord-send/index.ts`.
- 명세서 원본 §번호·초기 SQL 초안(`claude/schema.sql`)도 참조.
