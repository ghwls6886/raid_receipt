# 메월드 통합 계획 — maple_helper → raid_receipt

**결론: raid_receipt 를 베이스로 maple_helper 를 흡수한다.** Supabase 프로젝트 1개, 도메인 1개, 랜딩 3개.
따로 두면 로그인이 두 번이고, 무료 티어 정지 리스크도 두 배다.

> 조사 기준: 2026-08-06 · raid_receipt `f35d97c` · maple_helper `main`
> 코드 재검증: 2026-08-07 — 함정 4 정정, 함정 7 · §3.2 · §4.1 추가, §7 1·2단계 보강
> 관련 문서: [BE_PLAN.md](BE_PLAN.md) (백엔드 3층 구조) · [BE_PROGRESS.md](BE_PROGRESS.md)

---

## 0. 왜 합치나

1. **로그인.** Supabase 프로젝트가 둘이면 인증 풀도 둘이다. 같은 구글 계정으로 들어가도 `user.id` 가 다르다.
   한 도메인 안에서 한 서비스처럼 보이는데 로그인을 두 번 하는 게 분리 운영의 유일하고 진짜 비용이다.
2. **무료 티어 정지.** Free 는 7일 무트래픽이면 프로젝트가 정지된다. 프로젝트가 둘이면 인기 없는 쪽이 먼저
   죽고, 그 다음 처음 들어온 사람이 에러를 본다. 반응을 보려는 단계에서 가장 나쁜 시나리오다.
3. **관리 비용.** 마이그레이션·배포·타입 생성·RLS 가 두 벌.
4. **교차 홍보.** "구인에서 4인 모집 완료 → 이 멤버로 정산" 같은 문맥 넛지(§6)는 한 DB 안에서만 가능하다.

유일한 손해는 Free 총량이 절반이 되는 것이다 (500MB×2 → 500MB, egress 5GB×2 → 5GB).
§8 참고 — 500MB 는 한참 안 차므로 사실상 무해하다.

## 1. 현황

| | raid_receipt | maple_helper |
|---|---|---|
| 역할 | 길드 정산 (**과금 축**) | 개인 도구 + 파티 구인 |
| 코드 | 11,725 LOC | 10,893 LOC |
| 마이그레이션 | 11개 / 2,423줄 | 15개 / 1,551줄 |
| 테이블 | 22 | 17 |
| 스택 | pnpm + turbo + Vite + React 19 + zustand + Tailwind 4 | **동일** |
| Supabase 클라이언트 | `createClient<Database>` + `database.types.ts` | 타입 없음 |
| Edge Function | `discord-send` | 없음 |
| 인증 범위 | 길드 스코프 (`guild_accounts` + 온보딩) | 유저 스코프 (`auth.users` 직접) |
| 배포 | Vercel | Vercel |

**베이스가 raid_receipt 인 이유** — 타입 있는 클라이언트, Edge Function, `packages/shared`, 길드 다중 테넌시,
문서(BE_PLAN·BE_PROGRESS·SETUP), 그리고 과금 축이 여기다.

**둘 다 같은 템플릿에서 나왔다.** `Layout`·`TopNav`·`RequireAuth`·`ErrorBoundary`·`ui/*`·`feedback/*`·
`popup/Modal`·`useThemeStore`·`useToastStore` 가 거의 동일하다. 이식 대상은 셸이 아니라 기능뿐이다.

이식 대상 규모: 페이지 9 · 컴포넌트 36 (`boss-tracker` 6, `buff-call` 8, `characters` 4,
`daily-checklist` 5, `manner` 5, `party-finder` 8) · 훅 11 · 워커 2 · 테이블 15.

## 2. ⚠️ 반드시 알아야 할 함정

1. **`parties` 는 이름만 같고 완전히 다른 개념이다.**
   - RR = **공대**. `guild_id`, 리더는 `members`(길드원), `remainder_policy`(정산 잔액 정책). 고정 조직이자 정산 단위.
   - MH = **구인 공고**. `auth.users`, `title`, `category`, `required_stat_attack`,
     `status(OPEN/FULL/IN_PROGRESS/CLOSED)`, `max_members 2~6`, 유저당 활성 1개. 일회성.

   → 합칠 수 없다. MH 쪽을 `recruit_posts` 로 개명한다.

2. **`boss_entries` 도 축이 다르다.** RR 은 공대 단위(`party_id`), MH 는 캐릭터 단위(`character_id`, `note`).
   둘 다 남긴다.

3. **`bosses` 는 MH 가 상위집합이고, 교체 비용이 싸다.**
   - MH: `id text PK, name, cycle, cooldown_hours, reset_hour_kst, difficulty, sort_order`
   - RR: `id uuid, name` — 2컬럼뿐.

   RR 에서 `bosses(id)` 를 참조하는 곳은 **`boss_entries.boss_id` 단 하나**다.
   `raids` 는 `boss_name` 텍스트 스냅샷만 쓰고 FK 가 없다 (`0001_init.sql:110`).
   → uuid → text 전환이 한 컬럼으로 끝난다.

4. **라우트가 전부 온보딩을 요구한다 — 단, 가드 자체는 이미 준비돼 있다.**
   지금 `RequireAuth requireOnboarded` 가 모든 앱 라우트를 감싼다 (`App.tsx:51`). helper 기능은 길드가
   없어도 써야 하므로 **라우트**를 두 층으로 갈라야 한다. **이게 §4이고, 나머지 전부의 전제다.**

   다만 `requireOnboarded` 는 이미 **선택 prop** 이다 (`RequireAuth.tsx:9`). 가드를 개조할 일은 없고,
   플래그 없이 감싼 라우트 그룹을 하나 더 만들면 끝난다. 진짜 걸림돌은 가드가 아니라 **함정 7** 이다.

5. **클라이언트 2개는 답이 아니다.** 두 Supabase 클라이언트를 한 앱에 두면 둘 다 `detectSessionInUrl` 로
   OAuth 콜백 해시를 파싱하려 들어 엉뚱한 쪽이 토큰을 먹는다. DB 를 합치면 이 문제 자체가 사라진다.

6. **광고 링크가 `/` 를 가리키면 안 된다.** §5.

7. **`TopNav` 가 길드 컨텍스트를 전제한다.** ← 함정 4 의 진짜 걸림돌
   `useGuildStore` · `useCurrentGuild` 를 직접 읽어 길드 스위처를 그린다 (`TopNav.tsx:19,106-121`).
   길드 없는 유저가 helper 라우트에 들어오면 상단바가 빈 길드로 렌더된다. `Layout` 자체는 길드에
   의존하지 않으므로(`Layout.tsx`) 고칠 곳은 `TopNav` 하나다.
   → 길드 유무로 분기하고, 길드가 없으면 그 자리에 §6 의 **제품 스위처**를 놓는다.
   NAV_ITEMS(`대시보드`·`레이드`·`공대 구성`·`공대원`·`길드 설정`)도 제품별로 갈린다.

## 3. DB 통합 — 테이블 매핑

이관 방향: maple_helper → raid_receipt 의 `public` 스키마.
스키마 분리(`helper.`)는 **쓰지 않는다** — 개명 8개로 충돌이 전부 해소되므로 RLS·타입 생성을 복잡하게 만들 이유가 없다.

| MH 테이블 | 처리 | 새 이름 | 사유 |
|---|---|---|---|
| `parties` | 개명 | `recruit_posts` | RR 공대와 충돌 (함정 1) |
| `party_members` | 개명 | `recruit_post_members` | 〃 |
| `party_applications` | 개명 | `recruit_applications` | 명명 일관성 |
| `party_messages` | 개명 | `recruit_messages` | 〃 |
| `party_history` | 개명 | `recruit_history` | 〃 |
| `party_ratings` | 개명 | `recruit_ratings` | 〃 |
| `boss_entries` | 개명 | `char_boss_entries` | RR 공대 입장기록과 충돌 (함정 2) |
| `bosses` | **RR 것을 교체** | `bosses` | MH 가 상위집합 (함정 3) |
| `servers` | **RR 로 흡수** | `game_servers` | 같은 개념, RR 이름 유지 |
| `characters` | 그대로 | | |
| `checklist_templates` / `checklist_completions` | 그대로 | | |
| `manner_profiles` | 그대로 | | |
| `rating_sessions` / `rating_session_participants` | 그대로 | | |
| `user_boss_tracking` | 그대로 | | |
| `user_profiles` | 그대로 | | RR `members` 와 다른 층 → §3.1 |

### 3.1 user_profiles / guild_accounts / members 는 층이 다르다

| 테이블 | 단위 | 뜻 |
|---|---|---|
| `user_profiles` (MH) | auth 계정 1개당 1행 | 서비스 전역 프로필 (닉네임·아바타) |
| `guild_accounts` (RR) | (guild_id, email, role) | 어느 길드에 어떤 권한으로 속하는가 |
| `members` (RR) | 길드 내 인물 | 정산 대상. **auth 계정이 없는 사람도 있을 수 있다** |

세 개는 통합하지 않는다. 다만 `user_profiles.id` ↔ `guild_accounts` 연결 규칙은 이관 시 정할 것.

### 3.2 명명 규칙 — `h_` 접두어는 쓰지 않는다

**소유 제품이 아니라 도메인으로 묶는다.**

| 계층 | 테이블 | 접두어 |
|---|---|---|
| 공용 마스터 | `bosses` · `game_servers` · `user_profiles` | 없음 |
| 개인 도구 | `characters` · `char_boss_entries` · `user_boss_tracking` · `checklist_*` | 도메인 접두어 |
| 구인 | `recruit_*` 6개 · `manner_profiles` · `rating_*` | `recruit_` |
| 정산 | `raids` · `raid_*` · `parties` · `members` · `guild_*` | 기존 유지 |

helper 테이블 전체에 `h_` 를 붙이는 안은 기각한다.

1. **공유 테이블이 있다.** `bosses` · `game_servers` · `user_profiles` 는 두 제품이 같이 쓴다 (§3.1).
   `h_` 를 붙이면 이름이 거짓말이 되고, 붙일지 말지를 테이블마다 판단해야 한다. 경계가 움직이면
   — 정산이 그 테이블을 쓰기 시작하면 — 또 개명해야 한다.
2. **RR 쪽은 접두어가 없다.** `h_` 만 붙이면 비대칭이라 결국 `r_` 도 붙여야 일관된다.
3. **이미 도메인 접두어가 그 역할을 한다.** `recruit_` · `char_` · `checklist_` · `raid_` · `guild_` —
   이름만 보고 소속을 알 수 있으면 접두어의 목적은 달성된 것이다.

물리적 분리를 원한다면 접두어보다 별도 스키마(`helper.`)가 정공법이지만, §3 서두대로 기각한다.
개명 8개로 충돌이 전부 해소되는데 RLS·타입 생성을 복잡하게 만들 이유가 없다.

### 3.3 마이그레이션 번호

RR 기준 `0012_` 부터 이어 붙인다.

| 파일 | 내용 |
|---|---|
| `0012_helper_masters.sql` | `bosses` 교체 · `game_servers` 흡수 · `boss_entries.boss_id` uuid→text |
| `0013_helper_personal.sql` | `user_profiles` · `characters` · `user_boss_tracking` · `char_boss_entries` · `checklist_*` |
| `0014_helper_recruit.sql` | `recruit_*` 6개 + `manner_profiles` · `rating_*` — **4단계로 미루면 생략** |

> 실데이터 이관은 지금이 제일 싸다. 정산 데이터가 쌓인 뒤에는 훨씬 까다로워진다.

## 4. 라우팅 · 인증 · 코드 구조

**지금**

```
RequireAuth requireOnboarded → Layout → 모든 앱 라우트
```

**바뀐 뒤**

```
RequireAuth                  → 개인 도구 · 구인   (길드 불필요)
RequireAuth requireOnboarded → 정산 · 공대 · 멤버 (길드 필수)
```

| 경로 | 역할 | 접근 조건 |
|---|---|---|
| `/` | 허브 | 공개 |
| `/party` | 파티모집 랜딩 — **광고 A 착지점** | 공개 |
| `/settlement` | 정산 랜딩 — **광고 B 착지점** | 공개 |
| `/login` · `/terms` · `/privacy` | 공통 | 공개 |
| `/characters` · `/checklist` · `/boss-tracker` · `/party-finder` · `/ratings` | 개인 도구와 구인 | 로그인 |
| `/onboarding` | 길드 생성 · 초대코드 | 로그인 |
| `/dashboard` · `/raids` · `/parties` · `/members` · `/settings` · `/admin` · `/manual` | 정산과 공대 | 로그인 + 온보딩 |

> ⚠️ `/parties` 는 **RR 공대**다. MH 구인은 `/party-finder` 로 유지해 URL 충돌을 피한다.

### 4.1 폴더 구조 재편 — 이식 **전에** 한다

순서가 뒤집히면 안 된다. 이식 후에 재편하면 같은 파일을 두 번 옮긴다.

두 레포는 조직 축이 다르다. RR 은 타입 축(`pages/{app,auth,public}` · `components/{dashboard,raids,charts}`),
MH 는 기능 축(`components/{boss-tracker,buff-call,characters,daily-checklist,manner,party-finder}`).
그대로 부으면 `components/` 밑에 두 제품 폴더 15개가 뒤섞인다.

```
apps/web/src/
├── features/
│   ├── settlement/          # 정산 — 기존 RR 기능
│   │   ├── pages/           # Dashboard · Raids · RaidNew · Parties · Members · GuildSettings
│   │   ├── components/      # 현 components/{raids,dashboard,charts}
│   │   └── api.ts
│   ├── helper/              # 개인 도구 — 2단계 이식분
│   │   ├── characters/ · checklist/ · boss-tracker/ · buff-call/
│   │   └── api.ts
│   └── recruit/             # 구인 — 4단계. 지금은 비워둔다
├── pages/public/            # HubPage · PartyLandingPage · SettlementLandingPage · Legal · NotFound
├── components/              # 제품 무관 공용만 — ui · layout · feedback · popup · auth · common
├── hooks/ · lib/ · stores/ · styles/ · workers/
```

원칙 3가지:

1. **`components/` 최상위에는 제품 무관 공용만 둔다.** 지금 여기 있는 `dashboard/` · `raids/` · `charts/` 는
   `features/settlement/` 로 내려간다. 남는 건 두 제품이 실제로 공유하는 셸뿐이다 (§1 마지막 문단).
2. **`lib/api.ts` 를 feature 별로 쪼갠다.** 현재 **1,521줄**이고 MH 쪽(`api.ts` 933줄 + `api-chat` ·
   `api-history` · `api-manner` · `api-servers`)을 합치면 단일 파일 2,500줄이 된다.
   `supabase.ts` · `database.types.ts` · `format.ts` · `cn.ts` 는 공용으로 `lib/` 에 남는다.
3. **`features/` 간 직접 import 금지.** 교차는 `components/` · `lib/` · `stores/` 를 통해서만 한다.
   §6 문맥 넛지는 이 규칙 안에서 라우팅(`navigate`)으로 푼다. 나중에 분리할 여지를 남긴다.

## 5. 랜딩 구조

**원칙: 광고 클릭은 그 제품 랜딩으로 직행한다. 허브를 중간에 끼우지 않는다.**

따로 광고할 거라면 이게 구조를 정한다. 파티모집 광고를 보고 온 사람에게 "둘 중 뭐 보실래요?"를 먼저 띄우면
결정이 하나 늘고 거기서 전환이 샌다. 허브는 퍼널 **위**가 아니라 **옆**에 붙는다 — 검색·북마크로 직접 들어온
사람만 받는 자리다.

```
[광고·공유 A]      [광고·공유 B]        [검색·북마크·직접]
      │                  │                      │
      │                  │                      ▼
      │                  │                  ┌────────┐
      │                  │                  │ / 허브  │
      │                  │                  └───┬────┘
      │◄─────────────────┼──────────────────────┘  (허브는 갈라만 준다)
      ▼                  ▼
 /party            /settlement
      └────────┬─────────┘
               ▼
            /login          계정 하나 · Supabase 하나
               │
       ┌───────┴────────┐
       ▼                ▼
   로그인만        로그인 + 온보딩
 개인도구·구인      정산·공대·멤버
       └── 제품 스위처 ──┘
```

이관 작업:

- 기존 RR `pages/public/LandingPage.tsx` → `/settlement`
- 기존 MH `pages/LandingPage.tsx` → `/party`
- `/` 허브 **신규** — 두 제품 카드 + 각각 CTA
- 두 랜딩 하단에 서로를 가리키는 배너 한 줄. **CTA 아래**에 둔다 — 위로 올리면 주 전환을 갉아먹는다

> 두 랜딩 모두 다크모드를 강제로 끄고 라이트 고정이다 (각 `LandingPage` 의 `useEffect`).
> 허브도 같은 규칙을 따를지 정할 것.

## 6. 교차 홍보 — 강도 순

| 수단 | 효과 | 위치 · 문구 |
|---|---|---|
| **문맥 넛지** | 강 | 구인 4인 모집 완료 → "이 멤버로 공대 만들고 정산하기"<br>정산 공대 인원 부족 → "구인 글 올리기" |
| **제품 스위처** | 강 | TopNav 좌측 드롭다운. 이미 로그인 상태라 전환 장벽 0 |
| 가입 직후 1회 안내 | 중 | 온보딩 마지막 단계. **딱 한 번** — 반복하면 광고가 된다 |
| 랜딩 하단 배너 | 약 | CTA 아래 한 줄. 제일 약하지만 공짜 |

문맥 넛지가 두 제품을 한 DB 에 두는 진짜 이유다. 배너로는 못 하는 걸 한다.

## 7. 단계별 실행 계획

### 1단계 — 기반 (나머지 전부의 전제)

**코드 구조** — 이식 전에 끝낸다 (§4.1) · **완료 2026-08-07**

- [x] `features/{settlement,helper,recruit}` 신설 + 정산 코드 이동 (페이지 8 · 컴포넌트 7 · 모듈 3)
- [x] `lib/api.ts` 1,521줄 분할 → `features/settlement/api/` 7모듈 + 배럴 (최대 538줄)
- [x] 공용 승격: `lib/masters.ts` (보스·서버 마스터, §3.2) · `lib/account.ts` (`AccountRole` 등)
      · `throwIfError` → `lib/supabase.ts`
      ↳ `stores/useGuildStore` 가 `@/lib/api` 를 참조하던 역방향 의존이 이때 끊겼다

**라우팅** (§4) · **완료 2026-08-07**

- [x] 길드 불필요 라우트 그룹 추가 — `RequireAuth` 를 `requireOnboarded` **없이** 감싼 두 번째 `Layout` 그룹
      ↳ 가드는 이미 옵션화돼 있어 개조 없이 라우트만 추가했다 — 함정 4
      ↳ 404(`path="*"`)를 이 그룹으로 옮겼다. 오타 URL 때문에 길드 생성을 요구할 이유가 없다
      ↳ 개인 도구 라우트는 2단계에 이 그룹으로 들어온다
- [x] `TopNav` 길드 의존 분기 — 함정 7
      ↳ `NAV_ITEMS` → `SETTLEMENT_NAV` / `HELPER_NAV`. `HELPER_NAV` 는 2단계까지 비어 있고,
        비면 내비 행 자체를 그리지 않는다
      ↳ 길드 없으면 길드 스위처 대신 `CreateGuildButton`. 이 자리가 3단계에 제품 스위처로 확장된다 (§6)
      ↳ 매뉴얼 버튼도 길드 있을 때만 — 없으면 눌러도 온보딩으로 튕긴다

**DB**

- [x] `0012_helper_masters.sql` — `bosses` 교체, `game_servers` 흡수, `boss_entries.boss_id` uuid→text
      ↳ 기존 행은 **이름으로 슬러그 매핑**해 살린다. RR 보스 6종 이름이 helper 8종에 모두 있다
      ↳ 보스 마스터 정본을 seed 가 아니라 마이그레이션에 뒀다 — seed 는 운영에서 실행되지 않는데
        helper 코드는 슬러그 id 를 전제한다
      ↳ FE 영향 없음: `getBosses`/`getServers` 는 컬럼명이 같고 쓰기 경로는 전부 관리자 전용 스텁이다
- [x] **0012 를 배포 Supabase 에 적용** (2026-08-07) — Docker 없이 `--linked` 로 원격 직행
      ↳ 적용 전 저장소 **밖**에 덤프 확보. `auth` 스키마엔 리프레시 토큰·이메일이 들어 있어
        저장소 안에 두면 안 된다. 이후 백업은 `--schema public` 으로 뜬다
      ↳ 결과: 보스 8종 슬러그 id, `legacy-` 0건, `boss_entries` 1건이 `'horntail'` 로 이관
      ↳ 핑크빈·카오스 핑크빈은 24 → 168시간(WEEKLY)으로 정규화. 기존 24 는 아무도 설정한 적 없는
        `0002` 의 컬럼 기본값이었다
- [x] `pnpm db:types:remote` 재생성 → `database.types.ts` (1,229 → 1,259줄)
      ↳ 기존 `db:types` 는 `--local` 고정이라 원격용 스크립트를 추가했다

### 2단계 — 개인 도구 이식

- [x] `0013_helper_personal.sql` 적용 (2026-08-07)
      ↳ `handle_new_user()` 를 덮어쓰지 않고 **병합**했다. 두 제품이 같은 이름의 함수를
        같은 트리거에 걸고 있어서, 그대로 옮겼으면 정산 초대 링크가 조용히 죽었다
      ↳ `user_profiles.is_admin` 은 제외 — RR `admins` + `is_admin()` 으로 통일 (§9 미결 해소)
      ↳ MH `0009` 캐릭터 조회 정책은 4단계로 — `parties` 를 참조하는데 RR `parties` 는 공대다
- [x] 캐릭터 관리 (`characters` 4 컴포넌트 + `CharacterSelector`) (2026-08-07)
      ↳ `JOB_GROUPS`·`JOB_CATEGORIES` 를 `lib/jobs.ts` 로 공용 승격. 두 제품의 직업 계열
        5종이 정확히 같았고, helper 가 settlement 을 import 하면 안 된다 (§4.1 원칙 3)
      ↳ `lib/masters.ts` 에 `getActiveServers()` 추가 — 폼은 활성 서버만, 관리 화면은 전체
      ↳ 라우트 `/characters` 를 길드 불필요 그룹에, `HELPER_NAV` 첫 항목 배선
- [ ] 일일·주간 숙제 (`daily-checklist` 5 컴포넌트)
- [ ] 개인 보스 추적 (`boss-tracker` 6 컴포넌트, `useBosses`, `useNow`)
- [ ] **버프콜** — `buff-call` 8 컴포넌트, `useAudioAlert` · `useWakeLock`,
      `lib/audio.ts` · `buffTimer.ts` · `buffTimerRunner.ts`,
      **`workers/buff-timer.worker.ts` + `workers/types.ts`**, `stores/useBuffCallStore.ts`
      → 공대 실전 도구라 정산과 궁합이 제일 좋다. 지금 제품의 빈칸.
      ⚠️ **워커를 빠뜨리기 쉽다.** `buffTimerRunner.ts:18` 이
      `new Worker(new URL('@/workers/buff-timer.worker.ts', import.meta.url), { type: 'module' })`
      형태라 **Vite 가 별칭(`@/`)을 정적 해석해야** 번들에 포함된다. RR `vite.config.ts` 의 alias 설정을
      먼저 확인하고, 안 잡히면 상대경로로 바꾼다. 개발 서버에선 되는데 프로덕션 빌드에서 죽는 유형이다.
- [ ] MH `api-*.ts` 를 RR `lib/api.ts` 규약에 맞춰 이식 → `features/helper/api.ts` (타입 적용, §4.1)

### 3단계 — 랜딩·도메인

- [ ] 랜딩 3분할 + 허브 신규 — §5
- [ ] 제품 스위처 (TopNav)
- [ ] 문맥 넛지 2곳
- [ ] 도메인 연결, Supabase Auth 의 허용 리다이렉트 URL 갱신
- [ ] **광고·공유 링크를 `/party` · `/settlement` 로 교체** ← 여기서 전환이 갈린다

### 4단계 — 구인 (반응 보고 결정)

- [ ] `0014_helper_recruit.sql`
- [ ] 파티 구인 · 지원 · 파티 채팅(realtime) · 매너 평가
- [ ] realtime 동시접속 200(무료 한도)이 여기서 걸린다 — §8

## 8. 무료 티어 예산과 업그레이드 트리거

| 항목 | Free | Pro ($25/mo) | 먼저 터지나 |
|---|---|---|---|
| DB 용량 | 500 MB | 8 GB | ❌ 한참 멀었음 |
| MAU | 50,000 | 100,000 | ❌ 〃 |
| **Egress** | **5 GB/월** | 250 GB | ⚠️ 2순위 |
| **Realtime 동시접속** | **200** | 500 | ⚠️ 3순위 |
| 프로젝트 수 | **2개** | 무제한 | 통합하면 1칸 여유 |
| 비활성 정지 | **7일 후** | 없음 | ⚠️ **초기 1순위** |
| Storage | 1 GB | 100 GB | ❌ |
| Edge Function | 50만 호출 | 200만 | ❌ |

**DB 용량 추정**

- 정산: 레이드 1건 ≈ `raids` 1행 + `raid_participants` ~20행 + `raid_drops` ~10행 + 패널티·지원금 ≈ **8KB**
  → 500MB 면 약 **6만 건**. 길드 하나가 주 3회면 연 156건이니 수백 길드가 몇 년 써야 찬다.
- 고속 증가 테이블은 `checklist_completions` (유저 × 캐릭터 × 항목 × 매일) 하나뿐.
  유저 50명이면 연 50MB 수준, 1000명이면 연 1GB 급 → 그때 오래된 행을 정리한다.

**먼저 터지는 순서**: ① 7일 정지(초기) → ② egress 5GB → ③ realtime 동접 200 → ④ DB 500MB (한참 뒤)

**정지 회피**: 트래픽이 한 프로젝트에 모이면 확률이 준다. 그래도 불안하면 GitHub Actions 로 며칠에 한 번
헬스 요청을 쏜다. Supabase 는 API 요청 유무로 판단한다.

**업그레이드 시점** = egress 나 realtime 이 보일 때. 그쯤이면 이미 수익을 논할 만한 트래픽이다.

## 9. 확정 / 미결

**확정**

- 베이스는 raid_receipt
- Supabase 1개, `public` 스키마, 개명 8종 (§3)
- 테이블 명명은 **도메인 접두어**. `h_` 접두어와 `helper.` 스키마는 기각 (§3.2)
- 코드는 `features/` 축으로 재편하고, 재편은 **이식 전에** 한다 (§4.1)
- 랜딩 3개. 광고는 제품 랜딩으로 직행
- **랜딩은 3단계다.** 개인 도구 이식(2단계) 전에 만들면 CTA 가 가리킬 화면이 없어 빈 껍데기가 된다
- 구인·채팅·매너는 4단계로 분리

**미결**

- [ ] 도메인명
- [ ] 경로 분리 vs 서브도메인 (§5 는 경로 전제)
- [ ] 파티모집에 별도 액센트 색을 줄지 — 지금은 양쪽 다 주황이라 브랜드 패밀리는 이미 잡혀 있다
- [ ] 허브의 다크모드 정책 (§5)
- [ ] MH `RequireAdmin` · `AdminBossPage` · `AdminServersPage` 를 RR `AdminPage` · `admins` 테이블과 어떻게 합칠지
- [ ] `user_profiles.id` ↔ `guild_accounts` 연결 규칙 (§3.1)
