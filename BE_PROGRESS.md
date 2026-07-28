# BE 진행 체크리스트

세션이 끊겨도 여기만 보면 이어서 할 수 있게 만든 파일. **작업 끝날 때마다 체크박스를 갱신한다.**

- 무엇을 만드는지(설계) → [BE_PLAN.md](BE_PLAN.md)
- 계정·대시보드 클릭 순서(최초 1회) → [supabase/SETUP.md](supabase/SETUP.md)
- 일상 CLI 명령 → [supabase/README.md](supabase/README.md)

**현재 위치: P0-2 (`pnpm db:start`)**

---

## 페이즈 지도

| # | 페이즈 | 소요(대략) | 선행 | 상태 |
|---|---|---|---|---|
| P0 | 로컬 스택 가동 | 30분 | — | ⬜ |
| P1 | RLS 갭 6개 수정 (0004) | 3~4시간 | P0 | ⬜ |
| P2 | 로컬 인증 E2E 검증 | 1시간 | P1 | ⬜ |
| P3 | 구글 OAuth 등록 | 40분 | P0 | ⬜ |
| P4 | FE 1층 CRUD 교체 | 1~2일 | P2 | ⬜ |
| P5 | saveRaid + confirm_settlement | 4~6시간 | P4 | ⬜ |
| P6 | discord-send 연결 | 2~3시간 | P5 | ⬜ |
| P7 | 대시보드 집계 + audit_logs | 3~4시간 | P4 | ⬜ |
| P8 | 클라우드 프로젝트 + 배포 | 2시간 | P6 | ⬜ |

P3는 P0 끝나면 언제든 병렬로 가능(구글 콘솔 작업이라 코드와 무관). 나머지는 순차.

---

## P0. 로컬 스택 가동

**목표: `migrations/*.sql` 3개가 실제로 통과하는지 확인.** 계정 불필요.

- [x] **P0-1** `supabase/config.toml` 확충 ✅ 2026-07-28
      CLI 2.110.0 기본값 기준으로 작성. `supabase status`로 파싱 확인.
      - `storage`/`analytics`는 미사용이라 `enabled = false` (기동 가속. 필요하면 한 줄 flip)
      - 구글 블록은 **주석 처리** — 루트 `.env` 없이 켜면 `db:start`가 실패. P3-4에서 해제
      - `auto_expose_new_tables`는 미설정(클라우드 기본값과 동일) → 대신 P1-7 GRANT 필요
- [ ] **P0-2** `pnpm db:start` → 출력된 URL/anon key 가 `apps/web/.env` 값과 같은지 대조
- [ ] **P0-3** `pnpm db:reset` — **SQL 오류가 여기서 잡힌다. P0의 진짜 목적**
- [ ] **P0-4** Studio(http://127.0.0.1:54323)에서 테이블 19개 + seed(보스 6·서버 2) 확인
- [ ] **P0-5** `pnpm db:types` → `apps/web/src/lib/database.types.ts` 생성, 타입체크 통과

**완료 조건:** `db:reset`이 에러 0으로 끝나고 Studio에 테이블이 보인다.

> 정리하고 싶을 때: `npx supabase stop --no-backup`(볼륨까지 삭제) → `docker image prune -a`(이미지).
> 상태는 전부 `migrations/*.sql` + `seed.sql`에 있으므로 잃을 것 없다.

---

## P1. RLS 갭 6개 수정 → `0004_rls_fix.sql`

`SETUP.md:182-197`에서 발견된 것들. **1~3번은 "로그인은 되는데 아무 데이터도 안 보이는" 종류**라
P3(구글) 전에 반드시 끝내야 한다.

- [ ] **P1-1** 초대 redeem — `invites_same_guild`가 `guild_id in auth_user_guilds()`라 초대받은
      사람이 invite 행을 SELECT조차 못 한다. → `SECURITY DEFINER` RPC로 이관
- [ ] **P1-2** 권한 상승 — `accounts_same_guild`가 `for all`이라 MEMBER가 자기 role을 OWNER로
      UPDATE 가능. UPDATE/DELETE 분리 또는 role 변경을 RPC 전용으로
- [ ] **P1-3** `user_id` 링크 — `guild_accounts`는 email로 선생성되는데 `auth_user_guilds()`는
      `user_id = auth.uid()`로만 조회. 첫 로그인 시 email 매칭으로 `user_id`를 채우는 단계 필요
- [ ] **P1-4** `guilds.webhook_url`이 길드원 전원에게 SELECT 노출 → 컬럼 분리 또는 뷰로 가림
- [ ] **P1-5** `admins` 테이블 도입 + `error_logs` 정책 (`0001_init.sql:332` TODO,
      FE `AdminPage.getErrorLogs`가 대기 중)
- [ ] **P1-6** `confirm_settlement` 구현 — 현재 TODO 주석만 있는 껍데기
      (`0001_init.sql:338-372`). 권한체크 → 상태검증 → 스냅샷 → status=CONFIRMED → audit
- [ ] **P1-7** ⚠️ **GRANT 누락** (P0-1에서 발견, SETUP.md 목록에 없던 항목)
      마이그레이션 3개에 GRANT 문이 **0개**인데, 현재 CLI/클라우드 기본값은 `public`의 새 테이블을
      `anon`/`authenticated`에 자동 노출하지 않는다. → **RLS 정책이 맞아도 FE 호출이
      `permission denied`(42501)로 전부 막힌다.** 테이블 19개 + RPC에 명시적 GRANT 추가.
      `auto_expose_new_tables = true`로 우회하지 말 것 — 그 키는 2026-10-30 제거 예정

**완료 조건:** `db:reset` 통과 + P2 시나리오가 전부 의도대로 동작.

---

## P2. 로컬 인증 E2E 검증

구글 없이 **이메일/비번 로그인**으로 검증한다. 메일은 로컬 캐처(http://127.0.0.1:54324).

- [ ] **P2-1** 유저 A/B 생성, A가 길드 생성 → `guild_accounts.role=OWNER` 자동 부여 확인
- [ ] **P2-2** A가 초대코드 발급 → B가 redeem → B가 길드에 들어오는지 (P1-1, P1-3 검증)
- [ ] **P2-3** B(MEMBER)가 자기 role을 OWNER로 UPDATE 시도 → **거부되어야 함** (P1-2 검증)
- [ ] **P2-4** 유저 C가 남의 길드 데이터 SELECT 시도 → 0행 (RLS 기본 동작 검증)
- [ ] **P2-5** 세션 만료/갱신 — `jwt_expiry`를 짧게 줄여 자동 refresh 확인 후 원복

**완료 조건:** 5개 시나리오가 전부 의도대로. 여기가 통과하면 RLS는 믿어도 된다.

---

## P3. 구글 OAuth 등록

절차·한글 라벨은 [SETUP.md §②](supabase/SETUP.md) 참조. 비용 0원, 심사 없음.

- [ ] **P3-1** 개인 Gmail로 Google Cloud 프로젝트 생성 (⚠️ **회사 계정 금지** — SETUP.md:23-31)
- [ ] **P3-2** 동의 화면: 외부 / 스코프는 `openid`·`email`·`profile`만 / **로고 업로드 금지**
- [ ] **P3-3** OAuth 클라이언트 ID(웹) 발급 — 리디렉션 URI에 **로컬용을 반드시 포함**
      `http://127.0.0.1:54321/auth/v1/callback` (빠뜨리면 로컬에서 `redirect_uri_mismatch`)
- [ ] **P3-4** 레포 **루트** `.env`에 `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET`
      (`config.toml`은 커밋되는 파일이므로 반드시 `env(...)` 참조)
- [ ] **P3-5** `pnpm db:stop && pnpm db:start` 재기동 → 구글 로그인 실동작 확인

---

## P4. FE 1층 CRUD 교체

`apps/web/src/lib/api.ts`(1118줄)의 **함수 속만** supabase-js 호출로 교체. 화면은 무수정.
매핑표는 [BE_PLAN.md §4](BE_PLAN.md).

- [ ] **P4-1** `useAuthStore` 목업 → Supabase 세션. `RequireAuth`에 `loading` 상태 추가
      (세션 복원이 비동기라 없으면 첫 렌더에서 로그인 페이지로 튕긴다 — SETUP.md:177)
- [ ] **P4-2** `onboarded` 판정을 localStorage 플래그 → `guild_accounts` 조회 결과로
- [ ] **P4-3** 마스터: getBosses / getServers / getPenaltyTypes / getGuildSettings
- [ ] **P4-4** 길드원·공대: getMembers / addMember / 파티 CRUD
- [ ] **P4-5** 계정·초대: getAccounts / updateAccountRole / removeAccount / createInvite / redeemInvite
- [ ] **P4-6** 보스타이머: getBossEntries / recordBossEntry / update / delete (0002)
- [ ] **P4-7** 레이드 조회: getRaids / getRaid / getRaidDetail
- [ ] **P4-8** `lib/axios.ts` 폐기 (NestJS 잔재)

---

## P5. 레이드 저장·확정

- [ ] **P5-1** `saveRaid` — raids + 자식 테이블 upsert
- [ ] **P5-2** `confirm_settlement` RPC 연결. 계산은 FE `settlement.ts` 유지, RPC는 저장·검증만
- [ ] **P5-3** 참여자별 penalty/redistributed/final + boss_name/party_name **스냅샷** 확인
      (마스터가 나중에 바뀌어도 과거 정산이 안 흔들려야 함)

---

## P6. discord-send

- [ ] **P6-1** 로컬에서 Edge Function 호출 테스트 (아웃바운드라 로컬에서도 실제 발송됨)
- [ ] **P6-2** 확정 성공 후 호출 연결, `sent` 플래그 갱신
- [ ] **P6-3** 발송 실패 시 처리 (무료 베타라 크레딧 롤백은 불필요 — BE_PLAN.md §2-4)

---

## P7. 집계 + 이력

- [ ] **P7-1** getDashboardStats / getBossAverages / getMemberStats → view 또는 RPC
- [ ] **P7-2** FE `logAudit()` no-op → `audit_logs` INSERT (`[BE TODO]` 마커 지점들)
- [ ] **P7-3** getAuditLogs select 연결

---

## P8. 클라우드 + 배포

절차는 [SETUP.md §③](supabase/SETUP.md).

- [ ] **P8-1** 프로젝트 생성 (Seoul 리전 / DB 비밀번호 **비밀번호 관리자에 저장**)
- [ ] **P8-2** `supabase link` → `db push` → `seed.sql`은 대시보드 SQL Editor에 직접 실행
      (`db push`에 포함 안 됨)
- [ ] **P8-3** 구글 리디렉션 URI에 `https://<ref>.supabase.co/auth/v1/callback` 추가,
      대시보드 Auth 설정
- [ ] **P8-4** `functions deploy discord-send` + `service_role` 키를 **Edge Function 환경변수로만**
- [ ] **P8-5** Vercel 환경변수 → 배포 → 실도메인으로 Site URL 갱신

> ⚠️ `VITE_` 접두사 값은 프론트 번들에 박혀 브라우저에 노출된다. `service_role` 키는 RLS를
> 전부 무시하는 마스터 키라 절대 넣으면 안 된다.
