import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321';
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'public-anon-key-placeholder';

export const supabase = createClient<Database>(url, anonKey);

/** PostgREST 응답의 error 를 예외로 승격 — 모든 데이터 레이어가 공유한다 */
export function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
