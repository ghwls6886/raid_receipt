import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321';
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'public-anon-key-placeholder';

export const supabase = createClient<Database>(url, anonKey);
