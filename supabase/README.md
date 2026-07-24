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

```bash
# 1) CLI 설치 후 프로젝트 링크
supabase init          # 최초 1회 (config.toml 전체 생성)
supabase link --project-ref <your-ref>

# 2) 스키마/RLS/함수 적용
supabase db push        # migrations/*.sql 반영
# 시드: 대시보드 SQL editor 에 seed.sql 붙여넣기 or supabase db reset (로컬)

# 3) Edge Function 배포
supabase functions deploy discord-send

# 4) FE 타입 생성 (packages/shared 대체)
supabase gen types typescript --linked > apps/web/src/lib/supabase-types.ts
```

## 3층 구조

1. **CRUD** → PostgREST + RLS. FE 에서 `supabase-js` 직접 호출(길드/길드원/공대/레이드 목록 등). 서버 코드 0.
2. **원자성** → Postgres 함수(RPC). `confirm_settlement()` 등. `supabase.rpc(...)`.
3. **비밀키** → Edge Function. `discord-send`(웹훅 URL 서버 보관). 결제 검증도 여기.

전환 계약(FE 함수 ↔ Supabase)은 `../BE_PLAN.md` 참조.
