# BE 진행 체크리스트

세션이 끊겨도 여기만 보면 이어서 할 수 있게 만든 파일. **작업 끝날 때마다 체크박스를 갱신한다.**

- 무엇을 만드는지(설계) → [BE_PLAN.md](BE_PLAN.md)
- 계정·대시보드 클릭 순서(최초 1회) → [supabase/SETUP.md](supabase/SETUP.md)
- 일상 CLI 명령 → [supabase/README.md](supabase/README.md)

**현재 위치: P8 (클라우드 + 배포) — P3(구글 OAuth)는 사용자 수동 작업 필요**

---

## 페이즈 지도

| # | 페이즈 | 소요(대략) | 선행 | 상태 |
|---|---|---|---|---|
| P0 | 로컬 스택 가동 | 30분 | — | ✅ |
| P1 | RLS 갭 6개 수정 (0004) | 3~4시간 | P0 | ✅ |
| P2 | 로컬 인증 E2E 검증 | 1시간 | P1 | ✅ |
| P3 | 구글 OAuth 등록 | 40분 | P0 | ⬜ |
| P4 | FE 1층 CRUD 교체 | 1~2일 | P2 | ✅ |
| P5 | saveRaid + confirm_settlement | 4~6시간 | P4 | ✅ |
| P6 | discord-send 연결 | 2~3시간 | P5 | ✅ |
| P7 | 대시보드 집계 + audit_logs | 3~4시간 | P4 | ✅ |
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
- [x] **P0-2** `pnpm db:start` → 출력된 URL/anon key 가 `apps/web/.env` 값과 같은지 대조 ✅ 2026-07-30
- [x] **P0-3** `pnpm db:reset` — **SQL 오류가 여기서 잡힌다. P0의 진짜 목적** ✅ 2026-07-30
- [x] **P0-4** Studio(http://127.0.0.1:54323)에서 테이블 19개 + seed(보스 6·서버 2) 확인 ✅ 2026-07-30
- [x] **P0-5** `pnpm db:types` → `apps/web/src/lib/database.types.ts` 생성, 타입체크 통과 ✅ 2026-07-30

**완료 조건:** `db:reset`이 에러 0으로 끝나고 Studio에 테이블이 보인다.

> 정리하고 싶을 때: `npx supabase stop --no-backup`(볼륨까지 삭제) → `docker image prune -a`(이미지).
> 상태는 전부 `migrations/*.sql` + `seed.sql`에 있으므로 잃을 것 없다.

---

## P1. RLS 갭 6개 수정 → `0004_rls_fix.sql`

`SETUP.md:182-197`에서 발견된 것들. **1~3번은 "로그인은 되는데 아무 데이터도 안 보이는" 종류**라
P3(구글) 전에 반드시 끝내야 한다.

- [x] **P1-1** 초대 redeem → `redeem_invite(p_code, p_display_name)` SECURITY DEFINER RPC ✅ 2026-07-30
      + `create_guild(p_server_name, p_guild_name, p_display_name)` RPC 추가 (길드 생성도 RLS 우회 필요)
- [x] **P1-2** 권한 상승 방지 → `accounts_same_guild` 삭제, SELECT 전용 정책으로 교체 ✅ 2026-07-30
      `update_account_role(p_account_id, p_role)` + `remove_account(p_account_id)` RPC (OWNER 전용, 마지막 OWNER 보호)
- [x] **P1-3** `user_id` 링크 → `auth.users` AFTER INSERT 트리거(`handle_new_user`) ✅ 2026-07-30
      + `redeem_invite` 에서도 ON CONFLICT DO UPDATE 로 user_id 링크
- [x] **P1-4** `webhook_url` 노출 차단 → column-level GRANT(webhook_url 제외) ✅ 2026-07-30
      + `get_webhook_url` / `set_webhook_url` RPC (OWNER/ADMIN 전용)
- [x] **P1-5** `admins` 테이블 + `is_admin()` 헬퍼 + `error_logs_admin_read` 정책 ✅ 2026-07-30
- [x] **P1-6** `confirm_settlement` 구현 — 권한(OWNER/ADMIN) → 상태(DRAFT) → CONFIRMED → audit ✅ 2026-07-30
      (유료화 시 크레딧 차감 주석 유지)
- [x] **P1-7** GRANT 추가 — 테이블 20개 + 함수에 명시적 GRANT ✅ 2026-07-30
      guilds 는 column-level SELECT(webhook_url 제외) + 제한된 UPDATE(server_name, guild_name)
      guild_accounts 는 SELECT 만 (INSERT/UPDATE/DELETE 는 RPC 전용)

**완료 조건:** `db:reset` 통과 + P2 시나리오가 전부 의도대로 동작.

---

## P2. 로컬 인증 E2E 검증

구글 없이 **이메일/비번 로그인**으로 검증한다. 메일은 로컬 캐처(http://127.0.0.1:54324).

- [x] **P2-1** 유저 A/B 생성, A가 길드 생성 → `guild_accounts.role=OWNER` + guild_settings 자동 생성 ✅ 2026-07-30
- [x] **P2-2** A가 초대코드 발급 → B가 redeem → MEMBER 로 합류, invite.used_by 기록 ✅ 2026-07-30
- [x] **P2-3** B(MEMBER) 직접 UPDATE → `permission denied` / RPC → `only OWNER can change roles` ✅ 2026-07-30
- [x] **P2-4** 유저 C가 8개 테이블 SELECT → 전부 0행. SYS(bosses 6, servers 2)는 정상 조회 ✅ 2026-07-30
- [x] **P2-5** 추가 검증: webhook_url SELECT 차단, get_webhook_url MEMBER 거부, error_logs 0행,
      handle_new_user 트리거(email→user_id 자동 링크) ✅ 2026-07-30
      (세션 만료/갱신은 런타임 테스트 필요 → P3 이후 브라우저에서 확인)

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

- [x] **P4-1** `useAuthStore` 목업 → Supabase 세션. `RequireAuth`에 `loading` 상태 추가 ✅ 2026-07-30
- [x] **P4-2** `onboarded` 판정을 localStorage 플래그 → `guild_accounts` 조회 결과로 ✅ 2026-07-30
- [x] **P4-3** 마스터: getBosses / getServers / getPenaltyTypes / getGuildSettings ✅ 2026-07-30
- [x] **P4-4** 길드원·공대: getMembers / addMember / 파티 CRUD ✅ 2026-07-30
- [x] **P4-5** 계정·초대: getAccounts / updateAccountRole / removeAccount / createInvite / redeemInvite ✅ 2026-07-30
- [x] **P4-6** 보스타이머: getBossEntries / recordBossEntry / update / delete (0002) ✅ 2026-07-30
- [x] **P4-7** 레이드 조회: getRaids / getRaid / getRaidDetail ✅ 2026-07-30
- [x] **P4-8** `lib/axios.ts` 폐기 (NestJS 잔재) ✅ 2026-07-30
      + `useGuildStore` Supabase 연동, `LoginPage` Google OAuth + 이메일 로그인 UI,
      + `OnboardingPage` create_guild RPC + redeem_invite RPC 연결,
      + `LandingPage` 세션 기반 CTA, `GuildSettingsPage` AccountRole 타입 정합,
      + typecheck 0 errors

---

## P5. 레이드 저장·확정

- [x] **P5-1** `saveRaid` — raids + 자식 테이블 upsert ✅ 2026-07-30
      settlement 재계산 → raids upsert + drops/expenses/participants/penalties 재생성
      기존 id 있으면 update + 자식 delete→재insert, 없으면 insert
- [x] **P5-2** `confirm_settlement` RPC 연결 ✅ 2026-07-30
      status='confirmed' 시 DRAFT 저장 후 confirm_settlement RPC 호출 (권한·상태 검증 + audit)
- [x] **P5-3** 참여자별 penalty/redistributed/final + boss_name/party_name **스냅샷** 확인 ✅ 2026-07-30
      raid_participants: base/penalty/redistributed/final_amount/forfeited 스냅샷
      raid_participant_penalties: name/calc_type/value 스냅샷 (penalty_type_id는 참조용)
      raids: boss_name/party_name은 text 스냅샷 (FK 아님)

---

## P6. discord-send

- [x] **P6-1** 로컬에서 Edge Function 호출 테스트 (아웃바운드라 로컬에서도 실제 발송됨) ✅ 2026-07-30
- [x] **P6-2** 확정 성공 후 호출 연결, `sent` 플래그 갱신 ✅ 2026-07-30
      saveRaid에서 confirm_settlement 성공 후 supabase.functions.invoke('discord-send') 호출
      Edge Function에서 발송 성공 시 raids.sent = true 업데이트
- [x] **P6-3** 발송 실패 시 처리 ✅ 2026-07-30
      발송 실패는 catch로 무시 — 확정은 유지, sent=false 로 남음 (무료 베타라 크레딧 롤백 불필요)

---

## P7. 집계 + 이력

- [x] **P7-1** getDashboardStats / getBossAverages / getMemberStats → 클라이언트 집계 동작 ✅ 2026-07-30
      topContributor 구현 (getMemberStats 활용), 클라이언트 집계는 MVP 충분 → DB view 이관은 추후
- [x] **P7-2** FE `logAudit()` → `audit_logs` INSERT 연결 ✅ 2026-07-30
      서버 변경 시 logAudit 호출 추가, confirm_settlement RPC 에서도 자동 기록
- [x] **P7-3** getAuditLogs select 연결 + AuditLogCard 복원 ✅ 2026-07-30
      GuildSettingsPage 에 AuditLogCard 주석 해제, getAuditLogs 구현

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
