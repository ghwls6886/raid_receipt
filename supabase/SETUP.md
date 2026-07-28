# 최초 셋업 가이드

**처음 한 번만** 하는 작업. 일상적인 CLI 명령은 [README.md](./README.md) 에 있으므로 여기서
반복하지 않는다. 아키텍처·FE 매핑은 [../BE_PLAN.md](../BE_PLAN.md).

## 순서 (의존관계)

```
① 로컬 Docker 스택          ← 계정 불필요. 제일 먼저
       ↓
② 구글 OAuth 등록            ← 로그인 붙일 때
       ↓
③ Supabase 클라우드 프로젝트  ← 배포할 때. 마지막
```

`pnpm db:start` 는 Docker 로 Postgres + Auth + PostgREST 를 통째로 띄운다. supabase.com
계정과 무관하다. **클라우드 프로젝트를 먼저 만들 필요 없다.**

가장 급한 것은 `migrations/*.sql` 이 실제로 통과하는지 확인하는 것이고, ① 만으로 된다.

---

## ⚠️ 계정 선택 (나중에 되돌리기 어려움)

**Google Cloud / Supabase 둘 다 개인 계정으로 만들 것.** 회사 Workspace 계정으로 만들면:

- Google Cloud 프로젝트가 회사 조직에 귀속 → 조직 정책이 외부 사용자 OAuth 를 막으면
  길드원이 로그인 자체를 못 한다.
- 계정이 정지되면 프로젝트가 통째로 사라진다. 운영 중이면 복구 불가.

git 리모트가 개인 계정이므로 Supabase 도 같은 개인 GitHub 로 붙이는 게 일관된다.

---

## ① 로컬 Docker 스택

Docker 가 떠 있어야 한다. **계정은 필요 없다.**

명령은 [README.md § A. 로컬](./README.md) 참조. 순서만:
`pnpm install` → `pnpm db:start` → 출력된 URL/anon key 를 `apps/web/.env` 에 →
`pnpm db:reset`(SQL 오류가 여기서 잡힌다) → `pnpm db:types`.

Studio(http://127.0.0.1:54323) 에서 테이블 19개가 생겼는지 확인.

> `VITE_` 접두사가 붙은 값은 **프론트 번들에 박혀 브라우저에 노출된다.** anon key 는 공개
> 전제라 괜찮지만, `service_role` key 는 RLS 를 전부 무시하는 마스터 키라 절대 넣으면 안 된다.

### 다른 PC 에서 이어받을 때

git 에 안 올라가는 것들이라 머신마다 다시 해야 한다 (~15분):
`pnpm install` → `pnpm db:start` → `apps/web/.env` 재작성(`.env.example` 참고) →
(클라우드 쓰면) `supabase link`.
상태는 전부 `migrations/*.sql` 에 있으므로 잃어버릴 것은 없다.

---

## ② 구글 OAuth 등록

비용 0원, 세금정보 불필요, 심사 없음. 개인 Gmail 로 가능.

### 2-1. 동의 화면

`Google 인증 플랫폼`(구 `OAuth 동의 화면`)

| 메뉴 | 설정 |
|---|---|
| **브랜딩** | 앱 이름, 지원 이메일, 개인정보처리방침 URL, 서비스 약관 URL (`LegalPages.tsx` 배포 URL) |
| **대상** | `외부`. 테스트 모드면 여기서 **테스트 사용자**에 본인 Gmail 추가 |
| **데이터 액세스** | `openid` / `email` / `profile` 만. 추가 금지 |

- **로고는 올리지 말 것** — 브랜드 심사가 붙는다.
- 스코프가 전부 비민감(non-sensitive)이라 **게시(Publish)해도 심사가 없다.**

| 게시 상태 | 사용자 한도 | 심사 |
|---|---|---|
| 테스트 | 100명 (일일이 등록) | 없음 |
| 프로덕션 | 무제한 | 없음 |

베타는 테스트 모드로 시작 → 길드원 늘면 **게시** 버튼.

> 구글은 테스트 모드 앱의 **구글** refresh token 을 7일 만에 만료시키지만, 이 프로젝트에는
> 영향이 없다. Supabase 는 최초 로그인에만 구글을 쓰고 이후엔 자체 JWT/refresh token 으로
> 세션을 굴린다.

### 2-2. 클라이언트 ID

`API 및 서비스` → `사용자 인증 정보` → `+ 사용자 인증 정보 만들기` → `OAuth 클라이언트 ID`

| 한글 라벨 | 입력값 |
|---|---|
| 애플리케이션 유형 | `웹 애플리케이션` |
| 이름 | `raid-receipt-web` (내부 식별용) |
| 승인된 JavaScript 원본 | **비움** (Supabase 방식에선 불필요) |
| 승인된 리디렉션 URI | 아래 2개 |

```
http://127.0.0.1:54321/auth/v1/callback            ← 로컬 Docker 스택용
https://<your-ref>.supabase.co/auth/v1/callback    ← 클라우드용 (③ 이후 추가해도 됨)
```

**로컬 URI 를 빠뜨리면** 로컬 개발 중 구글 로그인이 `redirect_uri_mismatch` 로 막힌다.

### 2-3. 로컬 스택에 연결 (config.toml)

로컬은 클라우드 대시보드 설정을 쓰지 않는다. 파일에 직접 넣는다.

```toml
[auth]
enabled = true
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173/auth/callback"]
jwt_expiry = 3600                      # access token 수명(초). 기본 3600, 최대 604800
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10      # 0 이면 다중 탭/재시도 시 강제 로그아웃이 발생한다

[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_SECRET)"
```

시크릿은 **반드시 `env(...)` 참조.** `config.toml` 은 커밋되는 파일이다.
레포 **루트**에 `.env` 생성 (CLI 가 여기서 읽는다. `.gitignore:26` 에 이미 포함):

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_SECRET=...
```

수정 후 `pnpm db:stop && pnpm db:start` 재기동해야 반영된다.

### 2-4. 클라우드에 연결 (대시보드, 영어만 지원)

- `Authentication` → `Sign In / Providers` → `Google` 활성화 + Client ID/Secret 입력
- `Authentication` → `URL Configuration`
  - Site URL: `http://localhost:5173` (배포 후엔 실제 도메인)
  - Redirect URLs: `http://localhost:5173/auth/callback`

---

## ③ Supabase 클라우드 프로젝트

supabase.com/dashboard → 개인 GitHub 로그인 → **New project**

| 항목 | 값 |
|---|---|
| Name | `raid-receipt` |
| Database Password | 자동생성 후 **비밀번호 관리자에 저장** (다시 안 보여준다) |
| Region | **Northeast Asia (Seoul)** |
| Plan | Free |

`Project Settings` → `API Keys` 에서 URL 과 공개키(anon/publishable)를 가져와 `apps/web/.env` 에.
`service_role`(secret) 키는 **어디에도 넣지 않는다** — Edge Function 환경변수로만.

배포 명령(`link` / `db push` / `functions deploy` / `gen types --linked`)은
[README.md § B. 클라우드](./README.md) 참조.
`seed.sql` 은 `db push` 에 포함되지 않으므로 대시보드 SQL Editor 에 직접 붙여넣어 실행한다.

### 무료 티어 제약

- 조직당 프로젝트 2개
- **7일간 요청이 없으면 자동 일시정지** (대시보드에서 수동 복구 가능)
- DB 500MB / 대역폭 5GB — 현재 데이터 규모로는 충분

---

## 세션/토큰 참고

토큰 관리는 `supabase-js` 가 전담한다. `Authorization` 헤더를 직접 붙이는 코드는 불필요
(`apps/web/src/lib/axios.ts` 는 NestJS 제거와 함께 폐기 대상).

- access token(JWT, 기본 1h) + refresh token 을 localStorage 에 저장, 만료 전 자동 갱신
- JWT 의 `sub` → `auth.uid()` → RLS `auth_user_guilds()` 가 "내 길드"만 필터
- **인가는 FE 가 아니라 DB(RLS)가 한다.** `useAuthStore` 는 화면 라우팅용 상태일 뿐이다
- 세션 단위는 "유저 1명의 로그인 1건". IP·길드 단위가 아니므로 길드원 N명 = 세션 N개로 무관
- `sessions_single_per_user`(Pro 전용)는 PC/폰 동시 사용을 막으므로 **켜지 말 것**
- `RequireAuth` 에는 `loading` 상태가 필요하다. 세션 복원이 비동기라 첫 렌더에서 로그인
  페이지로 튕긴다. `onboarded` 도 localStorage 플래그가 아니라 `guild_accounts` 조회 결과여야 한다

---

## 알려진 미해결 이슈 (BE 착수 시 처리)

`0001_init.sql` 의 RLS 초안에 다음 갭이 있다. 적용 전 검토 필요:

1. **초대 redeem 불가** — `invites_same_guild` 가 `guild_id in auth_user_guilds()` 인데
   초대받은 사람은 아직 그 길드 소속이 아니라 invite 행을 SELECT 할 수 없다.
   → redeem 은 반드시 `SECURITY DEFINER` RPC 여야 한다.
2. **권한 상승** — `accounts_same_guild` 가 `for all` 이라 MEMBER 가 자기 role 을 OWNER 로
   UPDATE 할 수 있다. UPDATE/DELETE 를 분리하거나 role 변경을 RPC 로만 허용해야 한다.
3. **`user_id` 링크 누락** — `guild_accounts` 는 email 로 미리 생성되는데 `auth_user_guilds()`
   는 `user_id = auth.uid()` 로만 조회한다. 첫 로그인 시 email 매칭으로 `user_id` 를 채우는
   단계가 없으면 초대받은 사람이 어느 길드에도 들어가지 못한다.
4. `guilds.webhook_url` 이 길드원 전원에게 SELECT 노출된다 (주석엔 "select 제한 권장", 미구현).
5. `error_logs` 는 정책이 없어 `service_role` 만 접근 가능 → `admins` 테이블 도입 필요
   (FE `AdminPage.getErrorLogs` 가 대기 중. `0001_init.sql:332` TODO).
6. `confirm_settlement` 은 TODO 주석만 있는 껍데기 (`0001_init.sql:338-372`).
