# supabase/

Supabase-native 백엔드. 별도 서버(NestJS) 없이 **RLS + DB 함수 + Edge Function** 로 구성.

```
supabase/
  migrations/   테이블 + RLS + RPC 함수 (0001_init.sql)
  functions/    Edge Functions (discord-send: 웹훅 발송)
  seed.sql      SYS 마스터 시드 (보스 6·서버 2)
  config.toml   최소 설정 (supabase init 로 전체 생성 권장)
```

## 시작

CLI 는 루트 devDependency 라 별도 설치가 필요 없다 (`pnpm install` 이면 끝).
로컬 스택을 쓰려면 Docker 가 떠 있어야 한다.

### A. 로컬 (Docker) — 개발용

```bash
pnpm db:start     # 로컬 스택 기동. 끝나면 API_URL / ANON_KEY 를 출력한다
                  # → 그 값을 apps/web/.env 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 에
pnpm db:reset     # DB 재생성 + migrations/*.sql 재적용 + seed.sql 실행
pnpm db:types     # apps/web/src/lib/database.types.ts 재생성
pnpm db:stop      # 스택 정지
```

Studio(GUI) 는 기동 후 http://127.0.0.1:54323 .

### B. 클라우드 프로젝트 — 배포용

```bash
pnpm exec supabase link --project-ref <your-ref>
pnpm exec supabase db push                 # migrations/*.sql 반영
# 시드는 db push 에 포함되지 않는다 → 대시보드 SQL editor 에 seed.sql 붙여넣기
pnpm exec supabase functions deploy discord-send
pnpm exec supabase gen types typescript --linked > apps/web/src/lib/database.types.ts
```

> `pnpm db:types` 는 **로컬(--local)** 기준이다. 클라우드 스키마로 타입을 뽑으려면
> 위처럼 `--linked` 를 직접 쓴다.

## 3층 구조

1. **CRUD** → PostgREST + RLS. FE 에서 `supabase-js` 직접 호출(길드/길드원/공대/레이드 목록 등). 서버 코드 0.
2. **원자성** → Postgres 함수(RPC). `confirm_settlement()` 등. `supabase.rpc(...)`.
3. **비밀키** → Edge Function. `discord-send`(웹훅 URL 서버 보관). 결제 검증도 여기.

전환 계약(FE 함수 ↔ Supabase)은 `../BE_PLAN.md` 참조.
