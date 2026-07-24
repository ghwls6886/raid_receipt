import { createClient } from '@supabase/supabase-js';

/**
 * [BE 전환 준비] Supabase 클라이언트.
 *
 * 현재는 목업(`lib/api.ts`)이 실데이터라 아직 아무 데서도 import 하지 않는다.
 * DB 가 뜨면 `.env` 를 채우고 `api.ts` 각 함수 속을 이 클라이언트 호출(supabase.from / rpc /
 * functions.invoke)로 교체하면 화면 무수정 전환된다.
 *
 * - 로컬:      `supabase start` 후 출력되는 URL/anon key 를 .env 에.
 * - 프로덕션:  Vercel 환경변수에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 *
 * env 미설정 시 로컬 기본값(localhost:54321)으로 폴백 → import 만으로는 터지지 않음.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321';
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'public-anon-key-placeholder';

export const supabase = createClient(url, anonKey);
